import { BankService } from "@/application/services/bank-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository, InMemoryBankIdentityMergeRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import {
    InMemoryFinancialTransactionRepository, InMemoryBalanceSettingsRepository,
} from "@/infrastructure/repositories/implementations";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function build() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const observations = new InMemoryBankNumberObservationRepository();
    const settings = new InMemoryBalanceSettingsRepository();
    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const merges = new InMemoryBankIdentityMergeRepository(
        cards, accounts, snapshots, statements, observations, transactions, settings,
    );
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions,
        identification, undefined, merges,
    );
    return { service, cards, accounts, snapshots, statements, transactions, settings };
}

async function tx(
    repo: InMemoryFinancialTransactionRepository, id: string, patch: Partial<FinancialTransaction>,
) {
    return repo.create({
        id, ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED", amount: 10, currency: "USD",
        description: id, merchant: null, notes: null, possibleDuplicate: false, isDeleted: false,
        tags: [], date: "2026-09-20T10:00:00.000Z",
        createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-20T10:00:00.000Z",
        ...patch,
    } as FinancialTransaction);
}

describe("unificar tarjetas", () => {
    // El caso real: la misma Mastercard ••8361 registrada dos veces, con los
    // consumos repartidos y ninguna de las dos diciendo la deuda de verdad.
    async function twoMastercards() {
        const ctx = build();
        const inst = await ctx.service.createInstitution(USER, { name: "Banco del Pacífico", kind: "BANK" });
        const original = await ctx.service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT", brand: "Mastercard", lastFour: "8361",
        });
        const repetida = await ctx.service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT", lastFour: "8361", creditLimit: 3000,
        });
        return { ...ctx, original, repetida };
    }

    it("pasa los consumos y los pagos de la repetida a la que se queda", async () => {
        const { service, transactions, original, repetida } = await twoMastercards();
        await tx(transactions, "t1", { bankCardId: original.id });
        await tx(transactions, "t2", { bankCardId: repetida.id });
        await tx(transactions, "t3", { bankCardPaymentId: repetida.id, type: "PAYMENT" });

        const result = await service.mergeCards(USER, [repetida.id], original.id);

        expect(result.movedTransactions).toBe(2);
        const all = await transactions.findByOwnerId(USER);
        expect(all.find(t => t.id === "t2")?.bankCardId).toBe(original.id);
        expect(all.find(t => t.id === "t3")?.bankCardPaymentId).toBe(original.id);
    });

    it("archiva la repetida y la que se queda sigue viva", async () => {
        const { service, cards, original, repetida } = await twoMastercards();

        await service.mergeCards(USER, [repetida.id], original.id);

        // Archivada: el repositorio ya no la devuelve.
        expect(await cards.findById(repetida.id)).toBeNull();
        expect(await cards.findById(original.id)).not.toBeNull();
    });

    it("rellena lo que la que se queda no sabía, sin pisar lo que sí", async () => {
        const { service, cards, original, repetida } = await twoMastercards();

        await service.mergeCards(USER, [repetida.id], original.id);

        const merged = await cards.findById(original.id);
        // El cupo solo lo tenía la repetida; la marca, solo la original.
        expect(merged?.creditLimit).toBe(3000);
        expect(merged?.brand).toBe("Mastercard");
    });

    it("un estado de cuenta del mismo periodo no se duplica: el de la repetida se archiva", async () => {
        const { service, statements, original, repetida } = await twoMastercards();
        const base = {
            ownerUserId: USER, periodEnd: "2026-09-19", dueDate: "2026-10-05",
            totalAmount: 0, computedAmount: 0, paidAmount: 0, minimumPayment: null, status: "OPEN" as const,
            createdAt: "", updatedAt: "", isDeleted: false,
        };
        await statements.create({ ...base, id: "s1", cardId: original.id, periodStart: "2026-08-20" });
        await statements.create({ ...base, id: "s2", cardId: repetida.id, periodStart: "2026-08-20" });
        await statements.create({ ...base, id: "s3", cardId: repetida.id, periodStart: "2026-07-20" });

        await service.mergeCards(USER, [repetida.id], original.id);

        const onTarget = (await statements.findByCardId(original.id)).filter(s => !s.isDeleted);
        expect(onTarget.map(s => s.periodStart).sort()).toEqual(["2026-07-20", "2026-08-20"]);
        expect(await statements.findById("s2")).toBeNull();
    });

    it("no mezcla una de crédito con una de débito aunque compartan número", async () => {
        const { service, original } = await twoMastercards();
        const ahorro = await service.createAccount(USER, { accountType: "SAVINGS", lastFour: "0814" });
        const debito = await service.createCard(USER, {
            cardType: "DEBIT", lastFour: "8361", accountId: ahorro.id,
        });

        await expect(service.mergeCards(USER, [debito.id], original.id)).rejects.toThrow(/mismo tipo/i);
    });

    it("no deja unificar una tarjeta consigo misma", async () => {
        const { service, original } = await twoMastercards();

        await expect(service.mergeCards(USER, [original.id], original.id)).rejects.toThrow(/destino/i);
    });

    it("no toca tarjetas de otro usuario", async () => {
        const { service, original } = await twoMastercards();
        const ajena = await service.createCard(OTHER, { cardType: "CREDIT", lastFour: "8361" });

        await expect(service.mergeCards(USER, [ajena.id], original.id)).rejects.toThrow(/no encontrada/i);
    });
});

describe("unificar cuentas", () => {
    async function twoAccounts() {
        const ctx = build();
        const original = await ctx.service.createAccount(USER, { accountType: "SAVINGS", lastFour: "9558" });
        const repetida = await ctx.service.createAccount(USER, { accountType: "SAVINGS", lastFour: "9558" });
        return { ...ctx, original, repetida };
    }

    it("pasa los movimientos de los dos lados, los cortes y el débito que gastaba de ella", async () => {
        const { service, transactions, snapshots, cards, original, repetida } = await twoAccounts();
        await tx(transactions, "sale", { bankSourceAccountId: repetida.id });
        await tx(transactions, "entra", { type: "INCOME", bankDestinationAccountId: repetida.id });
        await service.registerBalanceSnapshot(USER, repetida.id, 120, "2026-09-01T00:00:00.000Z");
        const debito = await service.createCard(USER, {
            cardType: "DEBIT", lastFour: "1860", accountId: repetida.id,
        });

        const result = await service.mergeAccounts(USER, [repetida.id], original.id);

        expect(result.movedTransactions).toBe(2);
        expect(result.movedSnapshots).toBe(1);
        expect(result.movedCards).toBe(1);
        expect((await snapshots.findByAccountId(original.id))).toHaveLength(1);
        expect((await cards.findById(debito.id))?.accountId).toBe(original.id);
    });

    it("la excepción de balance de la repetida no se hereda", async () => {
        const { service, settings, original, repetida } = await twoAccounts();
        await settings.setRule(USER, "ACCOUNT", repetida.id, false);

        await service.mergeAccounts(USER, [repetida.id], original.id);

        // Heredarla podría excluir del balance, en silencio, una cuenta que el
        // usuario tiene incluida: manda la regla de la que se queda.
        expect(await settings.getRules(USER)).toHaveLength(0);
    });

    it("el efectivo no se mezcla con una cuenta de banco", async () => {
        const { service, original } = await twoAccounts();
        const efectivo = await service.createAccount(USER, { accountType: "CASH" });

        await expect(service.mergeAccounts(USER, [efectivo.id], original.id)).rejects.toThrow(/efectivo/i);
    });
});
