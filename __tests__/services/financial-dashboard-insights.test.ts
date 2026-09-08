import { FinancialDashboardService } from "@/application/services/financial-dashboard-service";
import { FinancialTransaction, FinancialCategory } from "@/domain/entities/financial";
import {
    IFinancialTransactionRepository,
    IFinancialCategoryRepository,
    IFinancialInstitutionRepository,
} from "@/domain/repositories/financial";

/**
 * The blocks the redesigned "Resumen" screen added on top of the original six:
 * merchant and income-source breakdowns, the card-settlement split inside the
 * category breakdown, the data-health counters, and the previous-period
 * comparison. Kept apart from `financial-dashboard-service.test.ts` so neither
 * file has to be read whole to work on the other.
 */
describe("FinancialDashboardService — insight blocks", () => {
    let transactionRepo: jest.Mocked<IFinancialTransactionRepository>;
    let categoryRepo: jest.Mocked<IFinancialCategoryRepository>;
    let institutionRepo: jest.Mocked<IFinancialInstitutionRepository>;
    let service: FinancialDashboardService;

    const mockUserId = "user-123";

    const baseTransaction: Omit<FinancialTransaction, "id"> = {
        ownerUserId: mockUserId,
        amount: 100,
        currency: "USD",
        date: "2026-05-15T10:00:00Z",
        type: "EXPENSE",
        status: "CONFIRMED",
        categoryId: null,
        institutionId: null,
        merchant: "Test Merchant",
        description: "Test Transaction",
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
        transactionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findById: jest.fn(),
            findByOwnerId: jest.fn(),
            findByFingerprint: jest.fn(),
            findRecent: jest.fn(),
            findPaginated: jest.fn(),
            findForDashboard: jest.fn(),
        } as any;

        // Mirrors the SQL narrowing (`findForDashboard`) so each test can keep
        // describing its scenario with one raw transaction list.
        transactionRepo.findForDashboard.mockImplementation(
            async (userId: string, filter?: { startDate?: Date; endDate?: Date; statuses?: string[] }) => {
                const all: FinancialTransaction[] = await transactionRepo.findByOwnerId(userId);
                const statuses = filter?.statuses ?? ["CONFIRMED", "REVIEWED", "MANUAL"];
                return (all ?? []).filter((t) => {
                    if (!statuses.includes(t.status)) return false;
                    if (filter?.startDate && new Date(t.date) < filter.startDate) return false;
                    if (filter?.endDate && new Date(t.date) > filter.endDate) return false;
                    return true;
                });
            },
        );

        categoryRepo = { findAllBaseAndUser: jest.fn() } as any;
        categoryRepo.findAllBaseAndUser.mockResolvedValue([]);

        institutionRepo = { findByOwnerId: jest.fn() } as any;
        institutionRepo.findByOwnerId.mockResolvedValue([]);

        service = new FinancialDashboardService(transactionRepo, categoryRepo, institutionRepo);
    });

    describe("getCategoryBreakdown — card settlements", () => {
        it("reports the card-settlement portion of each category's total", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "PAYMENT", amount: 400, categoryId: "cat-pay" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 100, categoryId: "cat-1" },
            ]);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-pay", name: "Pago de Tarjetas" } as FinancialCategory,
                { id: "cat-1", name: "Alimentación" } as FinancialCategory,
            ]);

            const breakdown = await service.getCategoryBreakdown(mockUserId);

            expect(breakdown.find((b) => b.categoryId === "cat-pay")!.paymentTotal).toBe(400);
            expect(breakdown.find((b) => b.categoryId === "cat-1")!.paymentTotal).toBe(0);
        });

        it("treats an expense linked to the card it pays as a settlement too", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                {
                    ...baseTransaction,
                    id: "1",
                    type: "EXPENSE",
                    amount: 250,
                    categoryId: "cat-1",
                    bankCardPaymentId: "card-9",
                },
            ]);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-1", name: "Alimentación" } as FinancialCategory,
            ]);

            const breakdown = await service.getCategoryBreakdown(mockUserId);

            expect(breakdown[0].paymentTotal).toBe(250);
        });
    });

    describe("getMerchantBreakdown", () => {
        it("aggregates spending by merchant, most spent first", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 100, merchant: "Uber" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 50, merchant: "Uber" },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 400, merchant: "Supermaxi" },
            ]);

            const breakdown = await service.getMerchantBreakdown(mockUserId);

            expect(breakdown.map((m) => m.merchant)).toEqual(["Supermaxi", "Uber"]);
            expect(breakdown[0]).toMatchObject({ total: 400, count: 1, percentage: 72.73 });
            expect(breakdown[1]).toMatchObject({ total: 150, count: 2 });
        });

        it("ignores income, transfers and withdrawals", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 100, merchant: "Uber" },
                { ...baseTransaction, id: "2", type: "INCOME", amount: 900, merchant: "Empleador" },
                { ...baseTransaction, id: "3", type: "TRANSFER", amount: 800, merchant: "Ahorro" },
                { ...baseTransaction, id: "4", type: "WITHDRAWAL", amount: 700, merchant: "Cajero" },
            ]);

            const breakdown = await service.getMerchantBreakdown(mockUserId);

            expect(breakdown).toHaveLength(1);
            expect(breakdown[0].merchant).toBe("Uber");
        });

        it("leaves card settlements out — they are debt, not spending", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "PAYMENT", amount: 900, merchant: "Visa 9620" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 100, merchant: "Uber" },
            ]);

            const breakdown = await service.getMerchantBreakdown(mockUserId);

            expect(breakdown.map((m) => m.merchant)).toEqual(["Uber"]);
        });

        it("groups nameless transactions under a single bucket", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 30, merchant: null },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 20, merchant: "   " },
            ]);

            const breakdown = await service.getMerchantBreakdown(mockUserId);

            expect(breakdown).toEqual([
                expect.objectContaining({ merchant: "Sin comercio", total: 50, count: 2 }),
            ]);
        });

        it("reports the credit-card portion of each merchant's total", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 80, merchant: "Uber", paidWithCredit: true },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 20, merchant: "Uber", paidWithCredit: false },
            ]);

            const breakdown = await service.getMerchantBreakdown(mockUserId);

            expect(breakdown[0]).toMatchObject({ total: 100, creditTotal: 80 });
        });
    });

    describe("getIncomeSourceBreakdown", () => {
        it("groups income by category, most received first", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "INCOME", amount: 3000, categoryId: "cat-salary" },
                { ...baseTransaction, id: "2", type: "DEPOSIT", amount: 500, categoryId: "cat-salary" },
                { ...baseTransaction, id: "3", type: "REFUND", amount: 100, categoryId: "cat-refund" },
            ]);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-salary", name: "Sueldo" } as FinancialCategory,
                { id: "cat-refund", name: "Reembolsos" } as FinancialCategory,
            ]);

            const breakdown = await service.getIncomeSourceBreakdown(mockUserId);

            expect(breakdown.map((s) => s.sourceName)).toEqual(["Sueldo", "Reembolsos"]);
            expect(breakdown[0]).toMatchObject({ total: 3500, count: 2, percentage: 97.22 });
        });

        it("falls back to the merchant when the income has no category", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "INCOME", amount: 620, categoryId: null, merchant: "Freelance" },
            ]);

            const breakdown = await service.getIncomeSourceBreakdown(mockUserId);

            expect(breakdown[0]).toMatchObject({ sourceId: null, sourceName: "Freelance", total: 620 });
        });

        it("ignores everything that is not income", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "INCOME", amount: 100, merchant: "Sueldo" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 900, merchant: "Uber" },
                { ...baseTransaction, id: "3", type: "TRANSFER", amount: 900, merchant: "Ahorro" },
            ]);

            const breakdown = await service.getIncomeSourceBreakdown(mockUserId);

            expect(breakdown).toHaveLength(1);
            expect(breakdown[0].sourceName).toBe("Sueldo");
        });
    });

    describe("KPI data-health counters", () => {
        it("counts flagged duplicates and uncategorized transactions in range", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 10, categoryId: "cat-1", possibleDuplicate: true },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 10, categoryId: null },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 10, categoryId: null },
                { ...baseTransaction, id: "4", type: "EXPENSE", amount: 10, categoryId: "cat-1" },
            ]);

            const kpis = await service.getKPIs(mockUserId);

            expect(kpis.possibleDuplicateCount).toBe(1);
            expect(kpis.uncategorizedCount).toBe(2);
        });
    });

    describe("getUncategorizedTransactions", () => {
        it("lists exactly what the uncategorized counter counts", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", categoryId: null },
                { ...baseTransaction, id: "2", categoryId: "cat-1" },
                { ...baseTransaction, id: "3", categoryId: null },
            ]);

            const [orphans, kpis] = await Promise.all([
                service.getUncategorizedTransactions(mockUserId),
                service.getKPIs(mockUserId),
            ]);

            expect(orphans.map((t) => t.id)).toEqual(["1", "3"]);
            expect(orphans).toHaveLength(kpis.uncategorizedCount);
        });

        it("treats an empty-string category as no category", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", categoryId: "" },
            ]);

            const orphans = await service.getUncategorizedTransactions(mockUserId);

            expect(orphans).toHaveLength(1);
        });

        it("ignores transactions outside the range and outside the active statuses", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "in", categoryId: null, date: "2026-06-10T10:00:00Z" },
                { ...baseTransaction, id: "out-of-range", categoryId: null, date: "2026-04-10T10:00:00Z" },
                { ...baseTransaction, id: "rejected", categoryId: null, date: "2026-06-11T10:00:00Z", status: "REJECTED" },
            ]);

            const orphans = await service.getUncategorizedTransactions(
                mockUserId,
                new Date("2026-06-01T00:00:00.000Z"),
                new Date("2026-06-30T23:59:59.999Z"),
            );

            expect(orphans.map((t) => t.id)).toEqual(["in"]);
        });

        it("returns the most recent first", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "old", categoryId: null, date: "2026-05-01T10:00:00Z" },
                { ...baseTransaction, id: "new", categoryId: null, date: "2026-05-20T10:00:00Z" },
                { ...baseTransaction, id: "mid", categoryId: null, date: "2026-05-10T10:00:00Z" },
            ]);

            const orphans = await service.getUncategorizedTransactions(mockUserId);

            expect(orphans.map((t) => t.id)).toEqual(["new", "mid", "old"]);
        });
    });

    describe("getDashboardOverview — previous period", () => {
        const june = { start: new Date("2026-06-01T00:00:00.000Z"), end: new Date("2026-06-30T23:59:59.999Z") };

        it("compares against the same-length range immediately before", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                // May (previous window)
                { ...baseTransaction, id: "p1", type: "EXPENSE", amount: 200, categoryId: "cat-1", date: "2026-05-10T10:00:00Z" },
                { ...baseTransaction, id: "p2", type: "EXPENSE", amount: 100, categoryId: null, date: "2026-05-20T10:00:00Z" },
                // June (current window)
                { ...baseTransaction, id: "c1", type: "EXPENSE", amount: 500, categoryId: "cat-1", date: "2026-06-10T10:00:00Z" },
            ]);

            const overview = await service.getDashboardOverview(mockUserId, june.start, june.end);

            expect(overview.previous).not.toBeNull();
            expect(overview.previous!.totalExpenses).toBe(300);
            expect(overview.previous!.categoryTotals["cat-1"]).toBe(200);
            expect(overview.previous!.categoryTotals["UNCATEGORIZED"]).toBe(100);
        });

        it("returns one daily expense entry per day of the previous range", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "p1", type: "EXPENSE", amount: 40, date: "2026-05-03T10:00:00Z" },
            ]);
            const start = new Date("2026-05-06T00:00:00.000Z");
            const end = new Date("2026-05-10T23:59:59.999Z"); // 5-day window → previous is May 1–5

            const overview = await service.getDashboardOverview(mockUserId, start, end);

            expect(overview.previous!.dailyExpenses).toHaveLength(5);
            expect(overview.previous!.dailyExpenses[2]).toBe(40); // May 3rd
            expect(overview.previous!.dailyExpenses.reduce((a, b) => a + b, 0)).toBe(40);
        });

        it("skips the comparison — and the extra read — when the range is open", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([]);

            const overview = await service.getDashboardOverview(mockUserId);

            expect(overview.previous).toBeNull();
            expect(transactionRepo.findForDashboard).toHaveBeenCalledTimes(1);
        });

        it("carries the merchant and income blocks", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue([
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 100, merchant: "Uber", date: "2026-06-10T10:00:00Z" },
                { ...baseTransaction, id: "2", type: "INCOME", amount: 900, merchant: "Sueldo", date: "2026-06-11T10:00:00Z" },
            ]);

            const overview = await service.getDashboardOverview(mockUserId, june.start, june.end);

            expect(overview.merchantBreakdown[0].merchant).toBe("Uber");
            expect(overview.incomeSourceBreakdown[0].sourceName).toBe("Sueldo");
        });
    });
});
