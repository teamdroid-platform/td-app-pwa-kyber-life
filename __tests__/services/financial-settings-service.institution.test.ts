import { FinancialSettingsService } from "@/application/services/financial-settings-service";
import {
    InMemoryFinancialInstitutionRepository,
    InMemoryFinancialTransactionRepository,
} from "@/infrastructure/repositories/implementations";
import {
    IFinancialInstitutionTypeRepository,
    IFinancialAccountRepository,
    IFinancialCategoryRepository,
} from "@/domain/repositories/financial";
import { FinancialInstitution, FinancialTransaction } from "@/domain/entities/financial";

const USER = "user-1";
const OTHER_USER = "user-2";

const stubType = {} as unknown as IFinancialInstitutionTypeRepository;
const stubAcc = {} as unknown as IFinancialAccountRepository;
const stubCat = {} as unknown as IFinancialCategoryRepository;

function makeInst(over: Partial<FinancialInstitution> & { id: string; name: string }): FinancialInstitution {
    return {
        ownerUserId: USER,
        logoUrl: null,
        institutionTypeId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        isDeleted: false,
        ...over,
    };
}

function makeTx(over: Partial<FinancialTransaction> & { id: string }): FinancialTransaction {
    return {
        ownerUserId: USER,
        type: "EXPENSE",
        status: "CONFIRMED",
        amount: 10,
        currency: "USD",
        description: "t",
        possibleDuplicate: false,
        date: "2026-06-10T00:00:00.000Z",
        institutionId: null,
        isDeleted: false,
        ...over,
    } as FinancialTransaction;
}

async function setup() {
    const institutionRepo = new InMemoryFinancialInstitutionRepository();
    const transactionRepo = new InMemoryFinancialTransactionRepository();
    await institutionRepo.create(makeInst({ id: "inst-a", name: "Uber Eats" }));
    await institutionRepo.create(makeInst({ id: "inst-b", name: "Uber" }));
    const service = new FinancialSettingsService(stubType, institutionRepo, stubAcc, stubCat, transactionRepo);
    return { service, institutionRepo, transactionRepo };
}

describe("FinancialSettingsService.mergeInstitution", () => {
    it("reassigns the source's transactions to the target and removes the source", async () => {
        const { service, institutionRepo, transactionRepo } = await setup();
        await transactionRepo.create(makeTx({ id: "t1", institutionId: "inst-a" }));
        await transactionRepo.create(makeTx({ id: "t2", institutionId: "inst-a" }));
        await transactionRepo.create(makeTx({ id: "t3", institutionId: "inst-b" }));

        const { reassignedCount } = await service.mergeInstitution(USER, "inst-a", "inst-b");

        expect(reassignedCount).toBe(2);
        // Source is gone.
        expect(await institutionRepo.findById("inst-a")).toBeNull();
        // All of the user's transactions now point to the target.
        const txs = await transactionRepo.findByOwnerId(USER);
        expect(txs.every(t => t.institutionId === "inst-b")).toBe(true);
    });

    it("counts the transactions linked to an institution", async () => {
        const { service, transactionRepo } = await setup();
        await transactionRepo.create(makeTx({ id: "t1", institutionId: "inst-a" }));
        await transactionRepo.create(makeTx({ id: "t2", institutionId: "inst-a" }));
        expect(await service.getInstitutionTransactionCount(USER, "inst-a")).toBe(2);
    });

    it("refuses to merge an institution into itself", async () => {
        const { service } = await setup();
        await expect(service.mergeInstitution(USER, "inst-a", "inst-a")).rejects.toThrow(/consigo misma/i);
    });

    it("refuses when the source is not owned by the user", async () => {
        const { service, institutionRepo } = await setup();
        await institutionRepo.create(makeInst({ id: "inst-x", name: "Ajena", ownerUserId: OTHER_USER }));
        await expect(service.mergeInstitution(USER, "inst-x", "inst-b")).rejects.toThrow(/not found or access denied/i);
    });

    it("refuses when the target does not exist", async () => {
        const { service } = await setup();
        await expect(service.mergeInstitution(USER, "inst-a", "missing")).rejects.toThrow(/destino/i);
    });

    it("does not touch another user's transactions", async () => {
        const { service, transactionRepo } = await setup();
        await transactionRepo.create(makeTx({ id: "t1", institutionId: "inst-a" }));
        await transactionRepo.create(makeTx({ id: "t2", institutionId: "inst-a", ownerUserId: OTHER_USER }));

        await service.mergeInstitution(USER, "inst-a", "inst-b");

        const otherTxs = await transactionRepo.findByOwnerId(OTHER_USER);
        expect(otherTxs.find(t => t.id === "t2")?.institutionId).toBe("inst-a");
    });
});
