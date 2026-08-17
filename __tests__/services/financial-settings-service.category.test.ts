import { FinancialSettingsService } from "@/application/services/financial-settings-service";
import {
    InMemoryFinancialCategoryRepository,
    InMemoryFinancialTransactionRepository,
} from "@/infrastructure/repositories/implementations";
import {
    IFinancialInstitutionTypeRepository,
    IFinancialInstitutionRepository,
} from "@/domain/repositories/financial";
import { FinancialCategory, FinancialTransaction } from "@/domain/entities/financial";

const USER = "user-1";
const OTHER_USER = "user-2";

// deleteCategory only touches the category + transaction repos; the rest are stubs.
const stub = {} as unknown as IFinancialInstitutionTypeRepository;
const stubInst = {} as unknown as IFinancialInstitutionRepository;

function makeCategory(over: Partial<FinancialCategory> & { id: string; name: string }): FinancialCategory {
    return {
        ownerUserId: USER,
        color: null,
        icon: null,
        parentId: null,
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
        categoryId: null,
        isDeleted: false,
        ...over,
    } as FinancialTransaction;
}

async function setup() {
    const categoryRepo = new InMemoryFinancialCategoryRepository();
    const transactionRepo = new InMemoryFinancialTransactionRepository();

    // Base "Otros" fallback category (system-owned).
    await categoryRepo.create(makeCategory({ id: "otros", name: "Otros", ownerUserId: null }));
    // A user category we will delete.
    await categoryRepo.create(makeCategory({ id: "cat-food", name: "Comida" }));

    const service = new FinancialSettingsService(stub, stubInst, categoryRepo, transactionRepo);
    return { service, categoryRepo, transactionRepo };
}

describe("FinancialSettingsService.deleteCategory", () => {
    it("counts the transactions associated with a category", async () => {
        const { service, transactionRepo } = await setup();
        await transactionRepo.create(makeTx({ id: "t1", categoryId: "cat-food" }));
        await transactionRepo.create(makeTx({ id: "t2", categoryId: "cat-food" }));
        await transactionRepo.create(makeTx({ id: "t3", categoryId: "otros" }));

        expect(await service.getCategoryTransactionCount(USER, "cat-food")).toBe(2);
    });

    it("reassigns associated transactions to 'Otros' and deletes the category", async () => {
        const { service, categoryRepo, transactionRepo } = await setup();
        await transactionRepo.create(makeTx({ id: "t1", categoryId: "cat-food" }));
        await transactionRepo.create(makeTx({ id: "t2", categoryId: "cat-food" }));

        const { reassignedCount } = await service.deleteCategory(USER, "cat-food");

        expect(reassignedCount).toBe(2);
        // Category is gone.
        expect(await categoryRepo.findById("cat-food")).toBeNull();
        // Transactions now point to "Otros", none orphaned.
        const txs = await transactionRepo.findByOwnerId(USER);
        expect(txs.every(t => t.categoryId === "otros")).toBe(true);
    });

    it("deletes a category with no transactions (reassignedCount 0)", async () => {
        const { service, categoryRepo } = await setup();
        const { reassignedCount } = await service.deleteCategory(USER, "cat-food");
        expect(reassignedCount).toBe(0);
        expect(await categoryRepo.findById("cat-food")).toBeNull();
    });

    it("refuses to delete a base/system category (not owned by the user)", async () => {
        const { service, categoryRepo } = await setup();
        await expect(service.deleteCategory(USER, "otros")).rejects.toThrow(/not found or access denied/i);
        // The base category survives.
        expect(await categoryRepo.findById("otros")).not.toBeNull();
    });

    it("refuses to delete a category owned by another user", async () => {
        const { service, categoryRepo } = await setup();
        await categoryRepo.create(makeCategory({ id: "cat-other", name: "Ajena", ownerUserId: OTHER_USER }));
        await expect(service.deleteCategory(USER, "cat-other")).rejects.toThrow(/not found or access denied/i);
    });

    it("does not touch another user's transactions when reassigning", async () => {
        const { service, transactionRepo } = await setup();
        await transactionRepo.create(makeTx({ id: "t1", categoryId: "cat-food" }));
        // A different user happens to reference the same category id (should be untouched).
        await transactionRepo.create(makeTx({ id: "t2", categoryId: "cat-food", ownerUserId: OTHER_USER }));

        await service.deleteCategory(USER, "cat-food");

        const otherTxs = await transactionRepo.findByOwnerId(OTHER_USER);
        expect(otherTxs.find(t => t.id === "t2")?.categoryId).toBe("cat-food");
    });
});
