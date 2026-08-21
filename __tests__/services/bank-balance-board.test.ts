import { BankService } from "@/application/services/bank-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { BankIdentificationService } from "@/application/services/bank-identification-service";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const AS_OF = "2026-08-21T00:00:00.000Z";

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
    return { service, snapshots };
}

describe("getBalanceBoard", () => {
    it("trae las cuentas activas con su último corte y el nombre del emisor", async () => {
        const { service } = buildService();
        const inst = await service.createInstitution(USER, { name: "Jardín Azuayo", kind: "COOPERATIVE" });
        const account = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        await service.registerBalanceSnapshot(USER, account.id, 1842.3, "2026-08-09T00:00:00.000Z");

        const board = await service.getBalanceBoard(USER);

        expect(board).toHaveLength(1);
        expect(board[0].account.institutionName).toBe("Jardín Azuayo");
        expect(board[0].lastAsOf).toBe("2026-08-09T00:00:00.000Z");
        expect(board[0].lastBalance).toBe(1842.3);
    });

    it("deja en null el corte de una cuenta que nunca declaró saldo", async () => {
        const { service } = buildService();
        const cash = await service.ensureCashAccount(USER);

        const board = await service.getBalanceBoard(USER);

        expect(board).toHaveLength(1);
        expect(board[0].account.id).toBe(cash.id);
        expect(board[0].lastAsOf).toBeNull();
        expect(board[0].lastBalance).toBeNull();
    });

    it("excluye las cuentas que todavía esperan en la conciliación", async () => {
        const { service } = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        await service.createAccount(USER, {
            institutionId: inst.id, accountType: "CHECKING", isUnconfirmed: true,
        });

        expect(await service.getBalanceBoard(USER)).toHaveLength(0);
    });
});

describe("registerBalanceSnapshots", () => {
    it("guarda todos los saldos a la misma fecha", async () => {
        const { service, snapshots } = buildService();
        const inst = await service.createInstitution(USER, { name: "Jardín Azuayo", kind: "COOPERATIVE" });
        const ahorros = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        const cash = await service.ensureCashAccount(USER);

        const saved = await service.registerBalanceSnapshots(USER, AS_OF, [
            { accountId: ahorros.id, balance: 1842.3 },
            { accountId: cash.id, balance: 64 },
        ]);

        expect(saved).toHaveLength(2);
        expect(saved.every(s => s.asOf === AS_OF)).toBe(true);
        expect(await snapshots.findLatestForAccount(cash.id, AS_OF)).toMatchObject({ balance: 64 });
    });

    it("rechaza la tanda entera si una cuenta no es del usuario, sin escribir ninguna", async () => {
        const { service, snapshots } = buildService();
        const mine = await service.ensureCashAccount(USER);
        const theirs = await service.ensureCashAccount(OTHER);

        await expect(service.registerBalanceSnapshots(USER, AS_OF, [
            { accountId: mine.id, balance: 100 },
            { accountId: theirs.id, balance: 999 },
        ])).rejects.toThrow(/no es tuya/i);

        expect(await snapshots.findLatestForAccount(mine.id, AS_OF)).toBeNull();
    });

    it("no acepta el saldo de una cuenta sin revisar", async () => {
        const { service } = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const pending = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "CHECKING", isUnconfirmed: true,
        });

        await expect(service.registerBalanceSnapshots(USER, AS_OF, [
            { accountId: pending.id, balance: 10 },
        ])).rejects.toThrow(/revisadas/i);
    });
});
