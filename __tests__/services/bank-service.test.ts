import { BankService } from "@/application/services/bank-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

const USER = "11111111-1111-1111-1111-111111111111";
const NOW = "2026-08-12T00:00:00Z";

function buildService() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const observations = new InMemoryBankNumberObservationRepository();
    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions, identification,
    );
    return { service, institutions, accounts, cards, snapshots, statements, transactions };
}

/** Una transacción mínima que la vista in-memory acepte. */
function tx(partial: Partial<FinancialTransaction>): FinancialTransaction {
    return {
        id: crypto.randomUUID(), ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED",
        amount: 0, currency: "USD", date: NOW, description: "test",
        possibleDuplicate: false, createdAt: NOW, updatedAt: NOW, isDeleted: false,
        ...partial,
    } as FinancialTransaction;
}

describe("ensureCashAccount", () => {
    it("crea la cuenta de efectivo la primera vez, sin institución", async () => {
        const { service, accounts } = buildService();
        const cash = await service.ensureCashAccount(USER);

        expect(cash.accountType).toBe("CASH");
        expect(cash.institutionId).toBeNull();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("es idempotente", async () => {
        const { service, accounts } = buildService();
        const a = await service.ensureCashAccount(USER);
        const b = await service.ensureCashAccount(USER);

        expect(a.id).toBe(b.id);
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });
});

describe("getOverview", () => {
    it("excluye del total las cuentas sin confirmar", async () => {
        const { service } = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });

        const ok = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });
        const pending = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });
        await service.markUnconfirmed(pending.id);

        await service.registerBalanceSnapshot(USER, ok.id, 1000, "2026-08-01T00:00:00Z");
        await service.registerBalanceSnapshot(USER, pending.id, 5000, "2026-08-01T00:00:00Z");

        const overview = await service.getOverview(USER);
        expect(overview.totalAvailable).toBe(1000);
    });

    it("el efectivo no entra en el disponible de cuentas, va en su propia cifra", async () => {
        const { service } = buildService();
        const cash = await service.ensureCashAccount(USER);
        await service.registerBalanceSnapshot(USER, cash.id, 185, "2026-08-01T00:00:00Z");

        const overview = await service.getOverview(USER);
        expect(overview.totalAvailable).toBe(0);
        expect(overview.cashBalance).toBe(185);
    });
});

describe("retiro en cajero", () => {
    it("baja del banco, sube al efectivo, el patrimonio no cambia", async () => {
        const { service, transactions } = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const banco = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });
        const cash = await service.ensureCashAccount(USER);

        await service.registerBalanceSnapshot(USER, banco.id, 500, "2026-08-01T00:00:00Z");
        await transactions.create(tx({
            type: "WITHDRAWAL", amount: 10, date: "2026-08-05T00:00:00Z",
            bankSourceAccountId: banco.id, bankDestinationAccountId: cash.id,
        }));

        const overview = await service.getOverview(USER);
        expect(overview.totalAvailable).toBe(490);
        expect(overview.cashBalance).toBe(10);
    });
});

describe("consumo con tarjeta de crédito", () => {
    it("sube la deuda y no toca ninguna cuenta", async () => {
        const { service, transactions } = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const cuenta = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });
        const card = await service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT",
            creditLimit: 3000, statementDay: 20, dueDay: 28,
        });

        await service.registerBalanceSnapshot(USER, cuenta.id, 1000, "2026-08-01T00:00:00Z");
        await transactions.create(tx({
            amount: 20, date: "2026-08-08T00:00:00Z",
            bankCardId: card.id, paidWithCredit: true,
        }));

        const overview = await service.getOverview(USER);
        expect(overview.totalAvailable).toBe(1000);
        expect(overview.totalDebt).toBe(20);
        expect(overview.totalAvailableCredit).toBe(2980);
    });
});

describe("closeDueStatements", () => {
    async function cardWithCycle() {
        const ctx = buildService();
        const inst = await ctx.service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const card = await ctx.service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT",
            creditLimit: 3000, statementDay: 20, dueDay: 28,
        });
        return { ...ctx, card };
    }

    it("cierra el período vencido y abre el siguiente", async () => {
        const { service, statements, card } = await cardWithCycle();
        // El 25 de julio el corte del 20 ya pasó, así que el período en curso
        // es 21-jul → 20-ago. Un mes después ese vence y se abre 21-ago → 20-sep.
        await service.closeDueStatements(USER, new Date("2026-07-25T00:00:00Z"));
        await service.closeDueStatements(USER, new Date("2026-08-25T00:00:00Z"));

        const all = await statements.findByCardId(card.id);
        expect(all.find(s => s.periodStart === "2026-07-21")?.status).toBe("CLOSED");
        expect(all.find(s => s.periodStart === "2026-08-21")?.status).toBe("OPEN");
        expect(all).toHaveLength(2);
    });

    it("es idempotente: correrlo dos veces no duplica estados", async () => {
        const { service, statements, card } = await cardWithCycle();
        const when = new Date("2026-08-25T00:00:00Z");
        await service.closeDueStatements(USER, when);
        await service.closeDueStatements(USER, when);

        expect(await statements.findByCardId(card.id)).toHaveLength(1);
    });

    it("no toca las tarjetas de débito", async () => {
        const { service, statements } = buildService();
        const inst = await service.createInstitution(USER, { name: "B", kind: "BANK" });
        const cuenta = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });
        const debito = await service.createCard(USER, {
            institutionId: inst.id, accountId: cuenta.id, cardType: "DEBIT",
        });

        await service.closeDueStatements(USER, new Date("2026-08-25T00:00:00Z"));
        expect(await statements.findByCardId(debito.id)).toHaveLength(0);
    });
});

describe("payStatement", () => {
    async function cardWithOpenStatement() {
        const ctx = buildService();
        const inst = await ctx.service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const cuenta = await ctx.service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });
        const card = await ctx.service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT",
            creditLimit: 3000, statementDay: 20, dueDay: 28,
        });
        await ctx.service.closeDueStatements(USER, new Date("2026-08-25T00:00:00Z"));
        const statement = (await ctx.statements.findOpenForCard(card.id))!;
        return { ...ctx, cuenta, card, statement };
    }

    it("crea un gasto real que sale de la cuenta y salda el estado", async () => {
        const { service, statements, cuenta, statement } = await cardWithOpenStatement();
        const updatedStatement = { ...statement, computedAmount: 611.4 };
        await statements.update(updatedStatement);

        const created = await service.payStatement(
            USER, statement.id, cuenta.id, 611.4, "2026-08-26T00:00:00Z",
        );

        expect(created.bankCardStatementId).toBe(statement.id);
        expect(created.bankSourceAccountId).toBe(cuenta.id);
        // Un pago de tarjeta no es un consumo diferido: es dinero que sale hoy.
        expect(created.paidWithCredit).toBe(false);

        const after = await statements.findById(statement.id);
        expect(after!.paidAmount).toBe(611.4);
        expect(after!.status).toBe("PAID");
    });

    it("un pago parcial deja el estado abierto", async () => {
        const { service, statements, cuenta, statement } = await cardWithOpenStatement();
        await statements.update({ ...statement, computedAmount: 611.4 });

        await service.payStatement(USER, statement.id, cuenta.id, 200, "2026-08-26T00:00:00Z");

        const after = await statements.findById(statement.id);
        expect(after!.paidAmount).toBe(200);
        expect(after!.status).toBe("OPEN");
    });

    it("el pago baja la deuda de la tarjeta y el saldo de la cuenta", async () => {
        const { service, statements, transactions, cuenta, card, statement } = await cardWithOpenStatement();
        await service.registerBalanceSnapshot(USER, cuenta.id, 1000, "2026-08-01T00:00:00Z");
        await transactions.create(tx({
            amount: 300, date: "2026-08-22T00:00:00Z", bankCardId: card.id, paidWithCredit: true,
        }));
        await statements.update({ ...statement, computedAmount: 300 });

        await service.payStatement(USER, statement.id, cuenta.id, 300, "2026-08-26T00:00:00Z");

        const overview = await service.getOverview(USER);
        expect(overview.totalDebt).toBe(0);
        expect(overview.totalAvailable).toBe(700);
    });
});
