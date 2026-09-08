import {
    buildCashFlowSteps,
    withCategoryDeltas,
    buildPaceSeries,
} from "@/presentation/financial/lib/dashboard-insights";
import type {
    FinancialKPIs,
    CategoryBreakdown,
    DailyBreakdown,
    PreviousPeriodComparison,
} from "@/application/services/financial-dashboard-service";

function makeKpis(over: Partial<FinancialKPIs> = {}): FinancialKPIs {
    return {
        totalIncome: 3937.83,
        totalExpenses: 4643.72,
        totalExpensesCredit: 658.84,
        totalExpensesSettlement: 1955.0,
        totalTransfers: 2839.08,
        totalTransfersSavings: 2339.08,
        totalTransfersFunding: 500.0,
        totalWithdrawals: 111.56,
        netBalance: -1997.69,
        transactionCount: 42,
        avgTransactionAmount: 100,
        pendingTransactionsCount: 3,
        possibleDuplicateCount: 1,
        uncategorizedCount: 4,
        currency: "USD",
        ...over,
    };
}

function makeCategory(over: Partial<CategoryBreakdown> = {}): CategoryBreakdown {
    return {
        categoryId: "cat-1",
        categoryName: "Vivienda",
        total: 669,
        creditTotal: 0,
        paymentTotal: 0,
        count: 1,
        percentage: 100,
        ...over,
    };
}

function makeDay(date: string, expenses: number, settlement = 0): DailyBreakdown {
    return {
        date,
        income: 0,
        expenses,
        expensesCredit: 0,
        expensesSettlement: settlement,
        withdrawals: 0,
        other: 0,
        net: -expenses,
    };
}

describe("buildCashFlowSteps", () => {
    it("lands exactly on the net balance", () => {
        const steps = buildCashFlowSteps(makeKpis());
        const total = steps[steps.length - 1];

        expect(total.kind).toBe("total");
        expect(total.running).toBeCloseTo(-1997.69, 2);
    });

    it("splits real consumption apart from the card settlement", () => {
        const steps = buildCashFlowSteps(makeKpis());

        // 4643.72 total expenses − 658.84 deferred to credit − 1955.00 settled debt
        expect(steps.find((s) => s.key === "consumption")!.amount).toBeCloseTo(-2029.88, 2);
        expect(steps.find((s) => s.key === "settlement")!.amount).toBeCloseTo(-1955.0, 2);
    });

    it("leaves withdrawals out of the running total — cash changes form, it does not leave", () => {
        const steps = buildCashFlowSteps(makeKpis());

        expect(steps.some((s) => s.key === "withdrawals")).toBe(false);
    });

    it("drops steps that moved nothing, but always keeps income and the total", () => {
        const steps = buildCashFlowSteps(
            makeKpis({
                totalExpenses: 0,
                totalExpensesCredit: 0,
                totalExpensesSettlement: 0,
                totalTransfersSavings: 0,
                totalTransfersFunding: 0,
                netBalance: 3937.83,
            }),
        );

        expect(steps.map((s) => s.key)).toEqual(["income", "total"]);
    });

    it("keeps every running total consistent with the step before it", () => {
        const steps = buildCashFlowSteps(makeKpis());
        let running = 0;
        for (const step of steps.filter((s) => s.kind !== "total")) {
            running = Math.round((running + step.amount) * 100) / 100;
            expect(step.running).toBeCloseTo(running, 2);
        }
    });
});

describe("withCategoryDeltas", () => {
    const previous: PreviousPeriodComparison = {
        startDate: "2026-05-01T00:00:00.000Z",
        endDate: "2026-05-31T23:59:59.999Z",
        totalExpenses: 900,
        categoryTotals: { "cat-1": 597, "cat-2": 100 },
        categoryPaymentTotals: { "cat-pay": 1720 },
        dailyExpenses: [],
    };

    it("attaches the percentage change against the same category last period", () => {
        const rows = withCategoryDeltas([makeCategory({ total: 669 })], previous, false);

        expect(rows[0].previousTotal).toBe(597);
        expect(rows[0].deltaPct).toBe(12); // 669 / 597 − 1
    });

    it("reports no delta for a category that did not exist last period", () => {
        const rows = withCategoryDeltas([makeCategory({ categoryId: "cat-new" })], previous, false);

        expect(rows[0].previousTotal).toBeNull();
        expect(rows[0].deltaPct).toBeNull();
    });

    it("compares against the settled amount too once payments are included", () => {
        const payments = makeCategory({
            categoryId: "cat-pay",
            categoryName: "Pago de Tarjetas",
            total: 1955,
            paymentTotal: 1955,
        });

        const rows = withCategoryDeltas([payments], previous, true);

        expect(rows[0].previousTotal).toBe(1720);
    });

    it("falls back to no delta at all when there is no previous period", () => {
        const rows = withCategoryDeltas([makeCategory()], null, false);

        expect(rows[0].deltaPct).toBeNull();
    });

    it("keys uncategorized spending to the same bucket the service uses", () => {
        const uncategorized = makeCategory({ categoryId: null, categoryName: "Sin categoría", total: 50 });
        const prev: PreviousPeriodComparison = { ...previous, categoryTotals: { UNCATEGORIZED: 25 } };

        const rows = withCategoryDeltas([uncategorized], prev, false);

        expect(rows[0].previousTotal).toBe(25);
        expect(rows[0].deltaPct).toBe(100);
    });
});

describe("buildPaceSeries", () => {
    const start = "2026-06-01T00:00:00.000Z";
    const end = "2026-06-30T23:59:59.999Z";
    const previous: PreviousPeriodComparison = {
        startDate: "2026-05-02T00:00:00.000Z",
        endDate: "2026-05-31T23:59:59.999Z",
        totalExpenses: 3120,
        categoryTotals: {},
        categoryPaymentTotals: {},
        dailyExpenses: new Array(30).fill(104),
    };

    it("returns nothing without a bounded range", () => {
        expect(buildPaceSeries([], previous, undefined, undefined, new Date(end))).toBeNull();
    });

    it("returns nothing without a previous period to compare against", () => {
        expect(buildPaceSeries([], null, start, end, new Date(end))).toBeNull();
    });

    it("accumulates consumption day by day, settlements excluded", () => {
        const daily = [
            makeDay("2026-06-01", 100),
            makeDay("2026-06-02", 1050, 1000), // 1000 of it settles card debt
            makeDay("2026-06-03", 50),
        ];

        const series = buildPaceSeries(daily, previous, start, end, new Date("2026-06-03T12:00:00Z"))!;

        expect(series.points[0].current).toBe(100);
        expect(series.points[1].current).toBe(150);
        expect(series.points[2].current).toBe(200);
        expect(series.spent).toBe(200);
    });

    it("projects the elapsed pace forward to the end of the range", () => {
        const daily = [makeDay("2026-06-01", 100), makeDay("2026-06-02", 100), makeDay("2026-06-03", 100)];

        const series = buildPaceSeries(daily, previous, start, end, new Date("2026-06-03T12:00:00Z"))!;

        // 300 in 3 days → 100/day → 3000 over 30 days
        expect(series.projected).toBe(3000);
        expect(series.points[series.points.length - 1].projected).toBe(3000);
    });

    it("stops the current line at today and leaves the rest of the range empty", () => {
        const daily = [makeDay("2026-06-01", 100)];

        const series = buildPaceSeries(daily, previous, start, end, new Date("2026-06-01T12:00:00Z"))!;

        expect(series.points).toHaveLength(30);
        expect(series.points[0].current).toBe(100);
        expect(series.points[1].current).toBeNull();
        expect(series.points[29].previous).toBe(3120);
    });

    it("treats a range already in the past as fully elapsed, with no projection", () => {
        const daily = [makeDay("2026-06-30", 500)];

        const series = buildPaceSeries(daily, previous, start, end, new Date("2026-08-15T00:00:00Z"))!;

        expect(series.points[29].current).toBe(500);
        expect(series.projected).toBeNull();
    });

    it("measures the gap against the previous period's final total", () => {
        const daily = [makeDay("2026-06-01", 156)];

        const series = buildPaceSeries(daily, previous, start, end, new Date("2026-06-01T12:00:00Z"))!;

        // projected 156 × 30 = 4680 vs 3120 → +50%
        expect(series.previousTotal).toBe(3120);
        expect(series.deltaPct).toBe(50);
    });
});
