import { FinancialDashboardService } from "@/application/services/financial-dashboard-service";
import { FinancialTransaction, FinancialCategory, FinancialInstitution } from "@/domain/entities/financial";
import { IFinancialTransactionRepository, IFinancialCategoryRepository, IFinancialInstitutionRepository } from "@/domain/repositories/financial";

describe("FinancialDashboardService", () => {
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
        accountId: null,
        merchant: "Test Merchant", description: "Test Transaction",
        notes: "Test Description",
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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

        // The dashboards now narrow by range + active status in SQL. Mirror that
        // here on top of whatever `findByOwnerId` is stubbed with, so each test
        // keeps describing its scenario with one raw transaction list.
        transactionRepo.findForDashboard.mockImplementation(async (userId: string, filter?: { startDate?: Date; endDate?: Date; statuses?: string[] }) => {
            const all: FinancialTransaction[] = await transactionRepo.findByOwnerId(userId);
            const statuses = filter?.statuses ?? ["CONFIRMED", "REVIEWED", "MANUAL"];
            return (all ?? []).filter((t) => {
                if (!statuses.includes(t.status)) return false;
                if (filter?.startDate && new Date(t.date) < filter.startDate) return false;
                if (filter?.endDate && new Date(t.date) > filter.endDate) return false;
                return true;
            });
        });

        categoryRepo = {
            findAllBaseAndUser: jest.fn(),
        } as any;
        categoryRepo.findAllBaseAndUser.mockResolvedValue([]);

        institutionRepo = {
            findByOwnerId: jest.fn(),
        } as any;
        institutionRepo.findByOwnerId.mockResolvedValue([]);

        service = new FinancialDashboardService(transactionRepo, categoryRepo, institutionRepo);
    });

    describe("getKPIs", () => {
        it("should calculate KPIs correctly from transactions", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, status: "CONFIRMED" },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 200, status: "CONFIRMED" },
                { ...baseTransaction, id: "4", type: "EXPENSE", amount: 50, status: "DETECTED" }, // Pending
                { ...baseTransaction, id: "5", type: "INCOME", amount: 100, status: "REJECTED" }, // Ignored
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const kpis = await service.getKPIs(mockUserId);

            expect(kpis.totalIncome).toBe(1000);
            expect(kpis.totalExpenses).toBe(500);
            expect(kpis.netBalance).toBe(500);
            expect(kpis.transactionCount).toBe(3); // Only active (CONFIRMED)
            expect(kpis.avgTransactionAmount).toBe(500); // 1500 / 3
            expect(kpis.pendingTransactionsCount).toBe(1); // Only DETECTED
        });

        it("should respect date filters when calculating KPIs", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, date: "2026-05-15T10:00:00Z", status: "CONFIRMED" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, date: "2026-04-15T10:00:00Z", status: "CONFIRMED" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const startDate = new Date("2026-05-01T00:00:00Z");
            const endDate = new Date("2026-05-31T23:59:59Z");

            const kpis = await service.getKPIs(mockUserId, startDate, endDate);

            expect(kpis.totalIncome).toBe(1000);
            expect(kpis.totalExpenses).toBe(0); // April transaction filtered out
            expect(kpis.transactionCount).toBe(1);
        });

        it("should not subtract credit-card-paid expenses from the balance", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, status: "CONFIRMED", paidWithCredit: true },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 100, status: "CONFIRMED", paidWithCredit: false },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const kpis = await service.getKPIs(mockUserId);

            expect(kpis.totalExpenses).toBe(400); // Gastos still include the credit-card purchase
            expect(kpis.netBalance).toBe(900); // Balance only reflects the non-credit expense
        });

        it("should only subtract TRANSFER transactions categorized as savings", async () => {
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-savings", name: "Ahorros e Inversiones", isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as FinancialCategory,
                { id: "cat-other", name: "Transferencias", isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as FinancialCategory,
            ]);
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
                { ...baseTransaction, id: "2", type: "TRANSFER", amount: 200, status: "CONFIRMED", categoryId: "cat-savings" },
                { ...baseTransaction, id: "3", type: "TRANSFER", amount: 50, status: "CONFIRMED", categoryId: "cat-other" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const kpis = await service.getKPIs(mockUserId);

            expect(kpis.totalTransfers).toBe(250); // Both transfers still reported in the KPI total
            expect(kpis.netBalance).toBe(800); // Only the savings transfer reduces the balance (1000 - 200)
            expect(kpis.totalTransfersSavings).toBe(200);
            expect(kpis.totalTransfersFunding).toBe(0);
        });

        it("should add TRANSFER transactions categorized as funding back to the balance", async () => {
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-savings", name: "Ahorros e Inversiones", isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as FinancialCategory,
                { id: "cat-funding", name: "Fondeo ingresos", isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as FinancialCategory,
            ]);
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "TRANSFER", amount: 200, status: "CONFIRMED", categoryId: "cat-savings" },
                { ...baseTransaction, id: "2", type: "TRANSFER", amount: 80, status: "CONFIRMED", categoryId: "cat-funding" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const kpis = await service.getKPIs(mockUserId);

            expect(kpis.totalTransfersSavings).toBe(200);
            expect(kpis.totalTransfersFunding).toBe(80);
            expect(kpis.netBalance).toBe(-120); // -200 (savings) + 80 (funding)
        });

        it("should report the credit-card portion of total expenses", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 300, status: "CONFIRMED", paidWithCredit: true },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 100, status: "CONFIRMED", paidWithCredit: false },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const kpis = await service.getKPIs(mockUserId);

            expect(kpis.totalExpenses).toBe(400);
            expect(kpis.totalExpensesCredit).toBe(300);
        });
    });

    describe("getMonthlyBreakdown", () => {
        it("should correctly group transactions by month", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, date: "2026-05-15T10:00:00Z" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, date: "2026-05-10T10:00:00Z" },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 200, date: "2026-04-15T10:00:00Z" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            // Use fixed date range (midday UTC to avoid timezone shifts)
            const startDate = new Date("2026-04-01T12:00:00Z");
            const endDate = new Date("2026-05-31T12:00:00Z");

            const breakdown = await service.getMonthlyBreakdown(mockUserId, 6, startDate, endDate);

            expect(breakdown).toHaveLength(2); // Apr and May

            const may = breakdown.find(m => m.month === "2026-05");
            expect(may).toBeDefined();
            expect(may!.income).toBe(1000);
            expect(may!.expenses).toBe(300);
            expect(may!.net).toBe(700);

            const apr = breakdown.find(m => m.month === "2026-04");
            expect(apr).toBeDefined();
            expect(apr!.income).toBe(0);
            expect(apr!.expenses).toBe(200);
            expect(apr!.net).toBe(-200);
        });

        it("should correctly group transactions using monthsBack (no dates provided)", async () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date("2026-06-15T12:00:00Z")); // Simulate current date as Jun 2026

            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, date: "2026-06-10T10:00:00Z" }, // current month
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, date: "2026-05-10T10:00:00Z" }, // 1 month ago
                { ...baseTransaction, id: "3", type: "WITHDRAWAL", amount: 100, date: "2026-04-15T10:00:00Z" }, // 2 months ago
                { ...baseTransaction, id: "4", type: "TRANSFER", amount: 50, date: "2026-04-16T10:00:00Z" }, // 2 months ago
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const breakdown = await service.getMonthlyBreakdown(mockUserId, 3); // Last 3 months (Apr, May, Jun)

            expect(breakdown).toHaveLength(3);
            const jun = breakdown.find(m => m.month === "2026-06");
            const may = breakdown.find(m => m.month === "2026-05");
            const apr = breakdown.find(m => m.month === "2026-04");

            expect(jun?.income).toBe(1000);
            expect(may?.expenses).toBe(300);
            expect(apr?.withdrawals).toBe(100);
            expect(apr?.other).toBe(50);

            jest.useRealTimers();
        });
    });

    describe("getTypeBreakdown", () => {
        it("should return aggregated amounts by type", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000 },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300 },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 200 },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const breakdown = await service.getTypeBreakdown(mockUserId);

            expect(breakdown).toHaveLength(2);
            
            const income = breakdown.find(b => b.type === "INCOME");
            expect(income!.total).toBe(1000);
            expect(income!.count).toBe(1);

            const expense = breakdown.find(b => b.type === "EXPENSE");
            expect(expense!.total).toBe(500);
            expect(expense!.count).toBe(2);
        });
    });

    describe("getCategoryBreakdown", () => {
        it("should return aggregated amounts by category", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 300, categoryId: "cat-1" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 200, categoryId: "cat-1" },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 100, categoryId: null },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-1", name: "Food", color: "#FF0000", type: "EXPENSE", isBase: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialCategory
            ]);

            const breakdown = await service.getCategoryBreakdown(mockUserId);

            expect(breakdown).toHaveLength(2);
            
            const cat1 = breakdown.find(b => b.categoryId === "cat-1");
            expect(cat1!.total).toBe(500);
            expect(cat1!.categoryName).toBe("Food");
            expect(cat1!.color).toBe("#FF0000");

            const uncat = breakdown.find(b => b.categoryId === null);
            expect(uncat!.total).toBe(100);
            expect(uncat!.categoryName).toBe("Sin categoría");
        });

        it("should report the credit-card portion of each category's total", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 300, categoryId: "cat-1", paidWithCredit: true },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 200, categoryId: "cat-1", paidWithCredit: false },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-1", name: "Food", color: "#FF0000", type: "EXPENSE", isBase: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialCategory
            ]);

            const breakdown = await service.getCategoryBreakdown(mockUserId);

            const cat1 = breakdown.find(b => b.categoryId === "cat-1");
            expect(cat1!.total).toBe(500);
            expect(cat1!.creditTotal).toBe(300);
        });
    });

    describe("getInstitutionBreakdown", () => {
        it("should return aggregated amounts by institution using absolute values", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 300, institutionId: "inst-1" },
                { ...baseTransaction, id: "2", type: "INCOME", amount: 1000, institutionId: "inst-1" },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 100, institutionId: null },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);
            institutionRepo.findByOwnerId.mockResolvedValue([
                { id: "inst-1", name: "Bank A", ownerUserId: mockUserId, status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialInstitution
            ]);

            const breakdown = await service.getInstitutionBreakdown(mockUserId);

            expect(breakdown).toHaveLength(2);
            
            const inst1 = breakdown.find(b => b.institutionId === "inst-1");
            expect(inst1!.total).toBe(1300); // 300 + 1000 (absolute sum)
            expect(inst1!.institutionName).toBe("Bank A");

            const uninst = breakdown.find(b => b.institutionId === null);
            expect(uninst!.total).toBe(100);
            expect(uninst!.institutionName).toBe("Unknown");
        });

        it("should report the credit-card portion of each institution's total", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 300, institutionId: "inst-1", paidWithCredit: true },
                { ...baseTransaction, id: "2", type: "INCOME", amount: 1000, institutionId: "inst-1" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);
            institutionRepo.findByOwnerId.mockResolvedValue([
                { id: "inst-1", name: "Bank A", ownerUserId: mockUserId, status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialInstitution
            ]);

            const breakdown = await service.getInstitutionBreakdown(mockUserId);

            const inst1 = breakdown.find(b => b.institutionId === "inst-1");
            expect(inst1!.total).toBe(1300);
            expect(inst1!.creditTotal).toBe(300);
        });
    });

    describe("getDailyBreakdown", () => {
        it("should aggregate by daily net changes", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, date: "2026-05-15T10:00:00Z" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, date: "2026-05-15T15:00:00Z" },
                { ...baseTransaction, id: "3", type: "EXPENSE", amount: 200, date: "2026-05-16T10:00:00Z" },
                { ...baseTransaction, id: "4", type: "WITHDRAWAL", amount: 100, date: "2026-05-17T10:00:00Z" },
                { ...baseTransaction, id: "5", type: "TRANSFER", amount: 50, date: "2026-05-18T10:00:00Z" },
                { ...baseTransaction, id: "6", type: "OTHER", amount: 50, date: "2026-05-18T15:00:00Z" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const breakdown = await service.getDailyBreakdown(mockUserId);

            expect(breakdown).toHaveLength(4);
            
            const day15 = breakdown.find(b => b.date === "2026-05-15");
            expect(day15!.income).toBe(1000);
            expect(day15!.expenses).toBe(300);
            expect(day15!.net).toBe(700);

            const day16 = breakdown.find(b => b.date === "2026-05-16");
            expect(day16!.income).toBe(0);
            expect(day16!.expenses).toBe(200);
            expect(day16!.net).toBe(-200);

            const day17 = breakdown.find(b => b.date === "2026-05-17");
            expect(day17!.withdrawals).toBe(100);

            const day18 = breakdown.find(b => b.date === "2026-05-18");
            expect(day18!.other).toBe(100); // 50 TRANSFER + 50 OTHER
        });

        it("should report the credit-card portion of each day's expenses", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "EXPENSE", amount: 300, date: "2026-05-15T10:00:00Z", paidWithCredit: true },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 100, date: "2026-05-15T15:00:00Z", paidWithCredit: false },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const breakdown = await service.getDailyBreakdown(mockUserId);

            const day15 = breakdown.find(b => b.date === "2026-05-15");
            expect(day15!.expenses).toBe(400);
            expect(day15!.expensesCredit).toBe(300);
        });
    });

    describe("getRecentTransactions", () => {
        it("should return the latest transactions and map their related entity names", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, categoryId: "cat-1", institutionId: "inst-1", date: "2026-05-15T10:00:00Z" },
                { ...baseTransaction, id: "2", type: "EXPENSE", amount: 300, categoryId: null, institutionId: null, date: "2026-05-14T10:00:00Z" },
            ];
            transactionRepo.findRecent.mockResolvedValue(transactions);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([
                { id: "cat-1", name: "Food", color: "#FF0000", type: "EXPENSE", isBase: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialCategory
            ]);
            institutionRepo.findByOwnerId.mockResolvedValue([
                { id: "inst-1", name: "Bank A", ownerUserId: mockUserId, status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDeleted: false } as FinancialInstitution
            ]);

            const recent = await service.getRecentTransactions(mockUserId, 1);
            expect(recent).toHaveLength(1);
            expect((recent[0] as any).categoryName).toBe("Food");
            expect((recent[0] as any).categoryColor).toBe("#FF0000");
            expect((recent[0] as any).institutionName).toBe("Bank A");
        });

        it("should respect date filters in recent transactions", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", date: "2026-05-15T10:00:00Z" },
                { ...baseTransaction, id: "2", date: "2026-04-15T10:00:00Z" },
            ];
            transactionRepo.findRecent.mockResolvedValue(transactions);
            categoryRepo.findAllBaseAndUser.mockResolvedValue([]);
            institutionRepo.findByOwnerId.mockResolvedValue([]);

            const startDate = new Date("2026-05-01T00:00:00Z");
            const recent = await service.getRecentTransactions(mockUserId, 5, startDate);
            expect(recent).toHaveLength(1);
            expect(recent[0].id).toBe("1");
        });
    });

    describe("KPIs with scanner repository", () => {
        it("should use scanner pending count if scannerRepo is provided", async () => {
            const scannerRepo = {
                findUnprocessedByOwnerId: jest.fn().mockResolvedValue([
                    { id: "scan-1", date: "2026-05-15T10:00:00Z" },
                    { id: "scan-2", date: "2026-04-15T10:00:00Z" }
                ])
            } as any;
            
            const serviceWithScanner = new FinancialDashboardService(transactionRepo, categoryRepo, institutionRepo, scannerRepo);
            
            // Should get transactions as empty to focus on pending counts
            transactionRepo.findByOwnerId.mockResolvedValue([]);

            const startDate = new Date("2026-05-01T00:00:00Z");
            const kpis = await serviceWithScanner.getKPIs(mockUserId, startDate);
            
            expect(scannerRepo.findUnprocessedByOwnerId).toHaveBeenCalledWith(mockUserId);
            expect(kpis.pendingTransactionsCount).toBe(1); // Only scan-1 is within date
        });

        it("should include withdrawal and transfer in KPI calculation", async () => {
            const transactions: FinancialTransaction[] = [
                { ...baseTransaction, id: "1", type: "WITHDRAWAL", amount: 100, status: "CONFIRMED" },
                { ...baseTransaction, id: "2", type: "TRANSFER", amount: 200, status: "CONFIRMED" },
            ];
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            const kpis = await service.getKPIs(mockUserId);
            expect(kpis.totalWithdrawals).toBe(100);
            expect(kpis.totalTransfers).toBe(200);
            expect(kpis.avgTransactionAmount).toBe(150); // (100 + 200) / 2
        });
    });

    describe("getDashboardOverview", () => {
        const transactions: FinancialTransaction[] = [
            { ...baseTransaction, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
            { ...baseTransaction, id: "2", type: "EXPENSE", amount: 400, status: "CONFIRMED" },
            { ...baseTransaction, id: "3", type: "EXPENSE", amount: 999, status: "REJECTED" }, // ignored
        ];

        it("reads the transactions once for every block", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);

            await service.getDashboardOverview(mockUserId);

            // Previously each of the six blocks issued its own full read.
            expect(transactionRepo.findForDashboard).toHaveBeenCalledTimes(1);
            expect(categoryRepo.findAllBaseAndUser).toHaveBeenCalledTimes(1);
            expect(institutionRepo.findByOwnerId).toHaveBeenCalledTimes(1);
        });

        it("returns every block, consistent with the individual getters", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);
            institutionRepo.findByOwnerId.mockResolvedValue([]);

            const overview = await service.getDashboardOverview(mockUserId);

            expect(overview.kpis.totalIncome).toBe(1000);
            expect(overview.kpis.totalExpenses).toBe(400);
            expect(overview.kpis).toEqual(await service.getKPIs(mockUserId));
            expect(overview.typeBreakdown).toEqual(await service.getTypeBreakdown(mockUserId));
            expect(overview.categoryBreakdown).toEqual(await service.getCategoryBreakdown(mockUserId));
            expect(overview.institutionBreakdown).toEqual(await service.getInstitutionBreakdown(mockUserId));
            expect(overview.dailyBreakdown).toEqual(await service.getDailyBreakdown(mockUserId));
            expect(overview.monthly).toEqual(await service.getMonthlyBreakdown(mockUserId));
        });

        it("pushes the range and the active statuses down to the repository", async () => {
            transactionRepo.findByOwnerId.mockResolvedValue(transactions);
            const start = new Date("2026-06-22T00:00:00.000Z");
            const end = new Date("2026-07-21T23:59:59.999Z");

            await service.getDashboardOverview(mockUserId, start, end);

            expect(transactionRepo.findForDashboard).toHaveBeenCalledWith(mockUserId, {
                startDate: start,
                endDate: end,
            });
        });
    });
});

