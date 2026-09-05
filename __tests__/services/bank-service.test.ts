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

describe("payCard (sobre estado de cuenta)", () => {
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
        const { service, statements, cuenta, card, statement } = await cardWithOpenStatement();
        const updatedStatement = { ...statement, computedAmount: 611.4 };
        await statements.update(updatedStatement);

        const created = await service.payCard(
            USER, card.id, cuenta.id, 611.4, "2026-08-26T00:00:00Z",
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
        const { service, statements, cuenta, card, statement } = await cardWithOpenStatement();
        await statements.update({ ...statement, computedAmount: 611.4 });

        await service.payCard(USER, card.id, cuenta.id, 200, "2026-08-26T00:00:00Z");

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

        await service.payCard(USER, card.id, cuenta.id, 300, "2026-08-26T00:00:00Z");

        const overview = await service.getOverview(USER);
        expect(overview.totalDebt).toBe(0);
        expect(overview.totalAvailable).toBe(700);
    });
});

describe("payCard", () => {
    async function creditCard(cards: ReturnType<typeof buildService>["cards"], id: string) {
        return cards.create({
            id, ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);
    }

    it("sin estado abierto, el pago entero baja la deuda", async () => {
        const { service, cards, transactions } = buildService();
        const card = await creditCard(cards, "card-a");
        await transactions.create(tx({ amount: 534.56, bankCardId: card.id, paidWithCredit: true }));

        const payment = await service.payCard(USER, card.id, "acc-1", 534.56, NOW);

        expect(payment.type).toBe("PAYMENT");
        expect(payment.bankCardPaymentId).toBe(card.id);
        expect(payment.bankCardStatementId).toBeFalsy();
        expect(payment.bankSourceAccountId).toBe("acc-1");
        expect((await service.getCardDetail(USER, card.id))!.card.debt).toBe(0);
    });

    it("con estado abierto, abona el estado y deja el resto en la deuda", async () => {
        const { service, cards, statements, transactions } = buildService();
        const card = await creditCard(cards, "card-b");
        await statements.create({
            id: "st-b", ownerUserId: USER, cardId: card.id,
            periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
            computedAmount: 180, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);
        await transactions.create(tx({ amount: 500, bankCardId: card.id, paidWithCredit: true }));

        const payment = await service.payCard(USER, card.id, "acc-1", 200, NOW);

        expect(payment.bankCardStatementId).toBe("st-b");
        const saved = await statements.findById("st-b");
        expect(Number(saved!.paidAmount)).toBe(180);
        expect(saved!.status).toBe("PAID");
        expect((await service.getCardDetail(USER, card.id))!.card.debt).toBe(300);
    });

    it("crea una sola transacción aunque abone el estado", async () => {
        const { service, cards, statements, transactions } = buildService();
        const card = await creditCard(cards, "card-c");
        await statements.create({
            id: "st-c", ownerUserId: USER, cardId: card.id,
            periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
            computedAmount: 100, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);

        const before = (await transactions.findByOwnerId(USER)).length;
        await service.payCard(USER, card.id, "acc-1", 100, NOW);
        expect((await transactions.findByOwnerId(USER)).length).toBe(before + 1);
    });

    it("rechaza una tarjeta de otro usuario", async () => {
        const { service, cards } = buildService();
        await cards.create({
            id: "card-ajena", ownerUserId: "otro", cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);

        await expect(service.payCard(USER, "card-ajena", "acc-1", 10, NOW))
            .rejects.toThrow("Tarjeta no encontrada");
    });
});

describe("vista de movimientos con pagos atados a la tarjeta", () => {
    it("un pago con bankCardPaymentId baja la deuda de esa tarjeta", async () => {
        const { service, cards, transactions } = buildService();
        const card = await cards.create({
            id: "card-1", ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);

        await transactions.create(tx({
            amount: 500, bankCardId: card.id, paidWithCredit: true,
        }));
        await transactions.create(tx({
            amount: 200, bankCardPaymentId: card.id, bankSourceAccountId: "acc-1",
        }));

        const detail = await service.getCardDetail(USER, card.id);
        expect(detail!.card.debt).toBe(300);
    });

    it("un pago que trae tarjeta y estado a la vez resta una sola vez", async () => {
        const { service, cards, statements, transactions } = buildService();
        const card = await cards.create({
            id: "card-2", ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);
        const statement = await statements.create({
            id: "st-1", ownerUserId: USER, cardId: card.id,
            periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
            computedAmount: 500, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);

        await transactions.create(tx({
            amount: 500, bankCardId: card.id, paidWithCredit: true,
        }));
        await transactions.create(tx({
            amount: 200, bankCardPaymentId: card.id, bankCardStatementId: statement.id,
        }));

        const detail = await service.getCardDetail(USER, card.id);
        expect(detail!.card.debt).toBe(300);
    });
});

describe("bandeja de pagos por confirmar", () => {
    async function withCandidate() {
        const built = buildService();
        await built.cards.create({
            id: "card-8361", ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            lastFour: "8361", status: "ACTIVE", isUnconfirmed: false,
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);
        return built;
    }

    it("agrupa las dos capturas del mismo pago en un solo pendiente", async () => {
        const { service, transactions } = await withCandidate();
        const desc = "Pago de tarjeta de crédito XXXX8361";
        await transactions.create(tx({ amount: 481.61, description: desc }));
        await transactions.create(tx({
            amount: 481.61, description: desc, bankSourceAccountId: "acc-1",
        }));

        const pending = await service.listPendingCardPayments(USER);

        expect(pending).toHaveLength(1);
        expect(pending[0].cardId).toBe("card-8361");
        expect(pending[0].twins).toHaveLength(1);
        expect(pending[0].primary.bankSourceAccountId).toBe("acc-1");
    });

    it("no propone una tarjeta de débito aunque su número case: a esa no se le paga una deuda", async () => {
        const { service, transactions, cards } = await withCandidate();
        await cards.create({
            id: "card-debito-2780", ownerUserId: USER, cardType: "DEBIT", currency: "USD",
            lastFour: "2780", status: "ACTIVE", isUnconfirmed: false,
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);
        await transactions.create(tx({
            amount: 120, description: "Pago de tarjeta de crédito XXXX2780",
        }));

        expect(await service.listPendingCardPayments(USER)).toEqual([]);
    });

    it("confirmar ata una sola transacción y marca la gemela como duplicada", async () => {
        const { service, transactions } = await withCandidate();
        const desc = "Pago de tarjeta de crédito XXXX8361";
        const gemela = await transactions.create(tx({ amount: 481.61, description: desc }));
        const principal = await transactions.create(tx({
            amount: 481.61, description: desc, bankSourceAccountId: "acc-1",
        }));

        await service.confirmCardPayment(USER, principal.id, "card-8361");

        expect((await transactions.findById(principal.id))!.bankCardPaymentId).toBe("card-8361");
        expect((await transactions.findById(gemela.id))!.bankCardPaymentId).toBeFalsy();
        expect((await transactions.findById(gemela.id))!.possibleDuplicate).toBe(true);
        expect(await service.listPendingCardPayments(USER)).toEqual([]);
    });

    it("la gemela queda descartada como candidata, no atada a ninguna tarjeta", async () => {
        const { service, transactions } = await withCandidate();
        const desc = "Pago de tarjeta de crédito XXXX8361";
        const gemela = await transactions.create(tx({ amount: 481.61, description: desc }));
        const principal = await transactions.create(tx({
            amount: 481.61, description: desc, bankSourceAccountId: "acc-1",
        }));

        await service.confirmCardPayment(USER, principal.id, "card-8361");

        const saved = await transactions.findById(gemela.id);
        expect(saved!.possibleDuplicate).toBe(true);
        expect(saved!.cardPaymentDismissedAt).toBeTruthy();
        expect(saved!.bankCardPaymentId).toBeFalsy();
    });

    it("descartar saca la candidata de la bandeja sin borrarla", async () => {
        const { service, transactions } = await withCandidate();
        const t = await transactions.create(tx({
            amount: 100, description: "Pago de tarjeta de crédito XXXX8361",
        }));

        await service.dismissCardPayment(USER, t.id);

        expect(await service.listPendingCardPayments(USER)).toEqual([]);
        const saved = await transactions.findById(t.id);
        expect(saved!.isDeleted).toBe(false);
        expect(saved!.cardPaymentDismissedAt).toBeTruthy();
    });

    it("rechaza confirmar una transacción de otro usuario", async () => {
        const { service, transactions } = await withCandidate();
        const ajena = await transactions.create(tx({
            ownerUserId: "otro", amount: 100,
            description: "Pago de tarjeta de crédito XXXX8361",
        }));

        await expect(service.confirmCardPayment(USER, ajena.id, "card-8361"))
            .rejects.toThrow("Transacción no encontrada");
    });
});
