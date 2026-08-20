import { BankService } from "@/application/services/bank-service";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import type { FinancialTransaction } from "@/domain/entities/financial";

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-08-20T00:00:00Z";

async function build() {
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

    const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });

    // La cuenta que en realidad era una tarjeta, y la que la tarjeta usará.
    const falsa = await service.createAccount(USER, {
        institutionId: inst.id, accountType: "SAVINGS",
        prefixDigits: "493176", lastFour: "2780",
    });
    const real = await service.createAccount(USER, {
        institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
    });

    async function gasto(accountId: string): Promise<FinancialTransaction> {
        return transactions.create({
            id: crypto.randomUUID(), ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED",
            amount: 25, currency: "USD", date: NOW, description: "compra",
            bankSourceAccountId: accountId, possibleDuplicate: false,
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as FinancialTransaction);
    }

    return { service, identification, observations, accounts, cards, transactions, inst, falsa, real, gasto };
}

describe("convertAccountToCard", () => {
    it("crea la tarjeta con el mismo número y emisor, y archiva la cuenta", async () => {
        const { service, accounts, falsa, real } = await build();

        const { card } = await service.convertAccountToCard(USER, falsa.id, {
            cardType: "DEBIT", accountId: real.id, brand: "Visa",
        });

        expect(card).toMatchObject({
            cardType: "DEBIT", prefixDigits: "493176", lastFour: "2780",
            institutionId: falsa.institutionId, accountId: real.id, brand: "Visa",
        });
        // Archivada: deja de existir para todo lo que lee cuentas vivas.
        expect(await accounts.findById(falsa.id)).toBeNull();
    });

    it("los movimientos siguen a la tarjeta y pasan a gastar de su cuenta", async () => {
        const { service, transactions, falsa, real, gasto } = await build();
        await gasto(falsa.id);
        await gasto(falsa.id);

        const { card, movedTransactions } = await service.convertAccountToCard(USER, falsa.id, {
            cardType: "DEBIT", accountId: real.id,
        });

        expect(movedTransactions).toBe(2);
        const todas = await transactions.findByOwnerId(USER);
        for (const t of todas) {
            expect(t.bankCardId).toBe(card.id);
            // Un débito descuenta de su cuenta: es lo que hace el escaneo con
            // un movimiento nuevo, y el historial tiene que contar lo mismo.
            expect(t.bankSourceAccountId).toBe(real.id);
        }
    });

    it("no toca los movimientos de otra cuenta", async () => {
        const { service, transactions, falsa, real, gasto } = await build();
        const ajeno = await gasto(real.id);
        await gasto(falsa.id);

        await service.convertAccountToCard(USER, falsa.id, { cardType: "DEBIT", accountId: real.id });

        const sigue = (await transactions.findByOwnerId(USER)).find(t => t.id === ajeno.id);
        expect(sigue?.bankCardId).toBeUndefined();
        expect(sigue?.bankSourceAccountId).toBe(real.id);
    });

    it("el número deja de apuntar a la cuenta y no vuelve a la conciliación", async () => {
        const { service, identification, observations, falsa, real } = await build();
        const observacion = await identification.observe(USER, "493176XXXX2780");
        await identification.assignObservation(USER, observacion.id, {
            kind: "ACCOUNT", targetId: falsa.id,
        });

        const { card, movedObservations } = await service.convertAccountToCard(USER, falsa.id, {
            cardType: "DEBIT", accountId: real.id,
        });

        expect(movedObservations).toBe(1);
        const despues = await observations.findById(observacion.id);
        expect(despues?.accountId).toBeNull();
        expect(despues?.cardId).toBe(card.id);
        expect(await identification.groupsByResolution(USER, "PENDING")).toEqual([]);
    });

    it("una de crédito no arrastra cuenta: no descuenta de ninguna hasta pagar el estado", async () => {
        const { service, transactions, falsa, gasto } = await build();
        await gasto(falsa.id);

        const { card } = await service.convertAccountToCard(USER, falsa.id, {
            cardType: "CREDIT", creditLimit: 3000, statementDay: 20, dueDay: 28,
        });

        expect(card.accountId).toBeNull();
        expect(card.creditLimit).toBe(3000);
        const [movimiento] = await transactions.findByOwnerId(USER);
        expect(movimiento.bankCardId).toBe(card.id);
        expect(movimiento.bankSourceAccountId).toBeNull();
    });

    it("hereda el estado de revisión: convertir corrige el tipo, no da por revisado", async () => {
        const { service, real, inst } = await build();
        const detectada = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "9999", isUnconfirmed: true,
        });

        const { card } = await service.convertAccountToCard(USER, detectada.id, {
            cardType: "DEBIT", accountId: real.id,
        });

        expect(card.isUnconfirmed).toBe(true);
    });
});

describe("lo que convertir no permite", () => {
    it("un débito sin cuenta de la que gastar", async () => {
        const { service, falsa } = await build();
        await expect(service.convertAccountToCard(USER, falsa.id, { cardType: "DEBIT" }))
            .rejects.toThrow(/de qué cuenta gasta/i);
    });

    it("apuntarse a sí misma", async () => {
        const { service, falsa } = await build();
        // Nacería gastando de una cuenta que se archiva en el mismo paso.
        await expect(service.convertAccountToCard(USER, falsa.id, {
            cardType: "DEBIT", accountId: falsa.id,
        })).rejects.toThrow(/no puede gastar de la cuenta que se está convirtiendo/i);
    });

    it("convertir el efectivo", async () => {
        const { service } = await build();
        const efectivo = await service.ensureCashAccount(USER);

        await expect(service.convertAccountToCard(USER, efectivo.id, {
            cardType: "DEBIT", accountId: efectivo.id,
        })).rejects.toThrow(/efectivo/i);
    });

    it("dejar huérfana a una tarjeta que gasta de esa cuenta", async () => {
        const { service, accounts, falsa, real, inst } = await build();
        await service.createCard(USER, {
            institutionId: inst.id, accountId: falsa.id, cardType: "DEBIT", lastFour: "1111",
        });

        await expect(service.convertAccountToCard(USER, falsa.id, {
            cardType: "DEBIT", accountId: real.id,
        })).rejects.toThrow(/Otra tarjeta gasta de esta cuenta/i);

        // Y nada quedó a medias: la cuenta sigue viva.
        expect(await accounts.findById(falsa.id)).not.toBeNull();
    });
});
