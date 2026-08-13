import { FinancialSettingsService } from "@/application/services/financial-settings-service";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import {
    IFinancialInstitutionTypeRepository,
    IFinancialInstitutionRepository,
    IFinancialCategoryRepository,
} from "@/domain/repositories/financial";
import { FinancialTransaction } from "@/domain/entities/financial";

const USER = "user-1";
const stub = {} as unknown as IFinancialInstitutionTypeRepository;
const stubInst = {} as unknown as IFinancialInstitutionRepository;
const stubCat = {} as unknown as IFinancialCategoryRepository;

function tx(over: Partial<FinancialTransaction> & { id: string }): FinancialTransaction {
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
        institutionId: null,
        isDeleted: false,
        ...over,
    } as FinancialTransaction;
}

async function setup(txs: FinancialTransaction[]) {
    const transactionRepo = new InMemoryFinancialTransactionRepository();
    for (const t of txs) await transactionRepo.create(t);
    const service = new FinancialSettingsService(stub, stubInst, stubCat, transactionRepo);
    return service;
}

describe("FinancialSettingsService transaction stats", () => {
    it("groups category counts by type bucket + total", async () => {
        const service = await setup([
            tx({ id: "1", categoryId: "food", type: "EXPENSE" }),
            tx({ id: "2", categoryId: "food", type: "PAYMENT" }), // also expense bucket
            tx({ id: "3", categoryId: "food", type: "INCOME" }),
            tx({ id: "4", categoryId: "salary", type: "INCOME" }),
        ]);

        const stats = await service.getCategoryTransactionStats(USER);
        expect(stats["food"]).toEqual({ income: 1, expense: 2, transfer: 0, withdrawal: 0, total: 3 });
        expect(stats["salary"]).toEqual({ income: 1, expense: 0, transfer: 0, withdrawal: 0, total: 1 });
    });

    it("groups institution counts and excludes DELETED/ARCHIVED and null keys", async () => {
        const service = await setup([
            tx({ id: "1", institutionId: "uber", type: "EXPENSE" }),
            tx({ id: "2", institutionId: "uber", type: "TRANSFER" }),
            tx({ id: "3", institutionId: "uber", type: "EXPENSE", status: "DELETED" }),
            tx({ id: "4", institutionId: "uber", type: "EXPENSE", status: "ARCHIVED" }),
            tx({ id: "5", institutionId: null, type: "EXPENSE" }), // no institution → ignored
        ]);

        const stats = await service.getInstitutionTransactionStats(USER);
        expect(stats["uber"]).toEqual({ income: 0, expense: 1, transfer: 1, withdrawal: 0, total: 2 });
        expect(Object.keys(stats)).toEqual(["uber"]);
    });

    it("returns an empty map when there are no transactions", async () => {
        const service = await setup([]);
        expect(await service.getCategoryTransactionStats(USER)).toEqual({});
        expect(await service.getInstitutionTransactionStats(USER)).toEqual({});
    });
});
