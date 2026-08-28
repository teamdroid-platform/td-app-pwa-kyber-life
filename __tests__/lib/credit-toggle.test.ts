import {
    excludeCreditFromKpis,
    excludeCreditFromCategoryBreakdown,
    excludeCreditFromInstitutionBreakdown,
    excludeCreditFromDailyBreakdown,
} from "@/presentation/financial/lib/credit-toggle";
import type {
    FinancialKPIs,
    CategoryBreakdown,
    InstitutionBreakdown,
    DailyBreakdown,
} from "@/application/services/financial-dashboard-service";

describe("credit-toggle", () => {
    describe("excludeCreditFromKpis", () => {
        it("subtracts the credit portion from totalExpenses and leaves other fields untouched", () => {
            const kpis: FinancialKPIs = {
                totalIncome: 1000,
                totalExpenses: 400,
                totalExpensesCredit: 300,
                totalTransfers: 50,
                totalTransfersSavings: 20,
                totalTransfersFunding: 10,
                totalWithdrawals: 60,
                netBalance: 900,
                transactionCount: 5,
                avgTransactionAmount: 100,
                pendingTransactionsCount: 0,
                currency: "USD",
            };

            const result = excludeCreditFromKpis(kpis);

            expect(result.totalExpenses).toBe(100);
            expect(result.totalExpensesCredit).toBe(0);
            expect(result.totalIncome).toBe(1000);
            expect(result.netBalance).toBe(900);
            expect(result.totalTransfersSavings).toBe(20);
        });
    });

    describe("excludeCreditFromCategoryBreakdown", () => {
        it("subtracts credit totals, drops categories left with nothing, and recomputes percentages", () => {
            const data: CategoryBreakdown[] = [
                { categoryId: "1", categoryName: "Alimentación", total: 80, creditTotal: 0, count: 2, percentage: 40 },
                { categoryId: "2", categoryName: "Pago de Tarjetas", total: 120, creditTotal: 120, count: 1, percentage: 60 },
            ];

            const result = excludeCreditFromCategoryBreakdown(data);

            expect(result).toHaveLength(1);
            expect(result[0].categoryName).toBe("Alimentación");
            expect(result[0].total).toBe(80);
            expect(result[0].creditTotal).toBe(0);
            expect(result[0].percentage).toBe(100);
        });

        it("recomputes percentages proportionally when some categories keep a real remainder", () => {
            const data: CategoryBreakdown[] = [
                { categoryId: "1", categoryName: "Alimentación", total: 100, creditTotal: 0, count: 1, percentage: 50 },
                { categoryId: "2", categoryName: "Entretenimiento", total: 100, creditTotal: 50, count: 1, percentage: 50 },
            ];

            const result = excludeCreditFromCategoryBreakdown(data);

            expect(result).toHaveLength(2);
            const entretenimiento = result.find((c) => c.categoryName === "Entretenimiento");
            expect(entretenimiento!.total).toBe(50);
            // 100 real + 50 real = 150 total; 50/150 ≈ 33.33%
            expect(entretenimiento!.percentage).toBeCloseTo(33.33, 1);
        });
    });

    describe("excludeCreditFromInstitutionBreakdown", () => {
        it("subtracts credit totals and drops institutions left with nothing", () => {
            const data: InstitutionBreakdown[] = [
                { institutionId: "1", institutionName: "Banco A", total: 500, creditTotal: 500, count: 1, percentage: 100 },
            ];

            const result = excludeCreditFromInstitutionBreakdown(data);

            expect(result).toHaveLength(0);
        });
    });

    describe("excludeCreditFromDailyBreakdown", () => {
        it("subtracts the credit portion from expenses and adds it back to net", () => {
            const data: DailyBreakdown[] = [
                { date: "2026-05-15", income: 200, expenses: 150, expensesCredit: 100, withdrawals: 0, other: 0, net: 50 },
            ];

            const result = excludeCreditFromDailyBreakdown(data);

            expect(result[0].expenses).toBe(50);
            expect(result[0].expensesCredit).toBe(0);
            expect(result[0].net).toBe(150);
        });
    });
});
