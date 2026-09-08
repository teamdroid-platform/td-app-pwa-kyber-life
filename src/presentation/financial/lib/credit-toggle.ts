import type {
    FinancialKPIs,
    CategoryBreakdown,
    InstitutionBreakdown,
    DailyBreakdown,
    MerchantBreakdown,
} from "@/application/services/financial-dashboard-service";

/**
 * Strip the credit-card-paid portion out of already-fetched dashboard data, so
 * KPIs and charts show only real (cash) spending by default. Every breakdown
 * already carries its credit-card sub-total (added for the real/credit
 * split), so this is a pure client-side transform — no refetch needed. Only
 * EXPENSE-type amounts can be `paidWithCredit`, so income, transfers,
 * withdrawals and the balance itself are untouched.
 *
 * The balance itself — with or without credit-card spending — is now the
 * `BalanceModeSwitch`'s job; see `BalanceService`.
 */
export function excludeCreditFromKpis(kpis: FinancialKPIs): FinancialKPIs {
    return {
        ...kpis,
        totalExpenses: round2(kpis.totalExpenses - kpis.totalExpensesCredit),
        totalExpensesCredit: 0,
    };
}

export function excludeCreditFromCategoryBreakdown(data: CategoryBreakdown[]): CategoryBreakdown[] {
    const reduced = data
        .map((c) => ({ ...c, total: round2(c.total - c.creditTotal), creditTotal: 0 }))
        .filter((c) => c.total > 0);
    const grandTotal = reduced.reduce((sum, c) => sum + c.total, 0);
    return reduced.map((c) => ({
        ...c,
        percentage: grandTotal > 0 ? round2((c.total / grandTotal) * 100) : 0,
    }));
}

/**
 * Drop the portion of each category that settles credit-card debt instead of
 * buying something.
 *
 * Without this, "Pago de Tarjetas" is the biggest slice of the spending chart
 * while describing no spending at all: the purchase it pays for was already
 * counted the day it happened. The screen keeps the settlements one toggle
 * away, for when the user wants total cash out instead of consumption.
 */
export function excludeCardPaymentsFromCategoryBreakdown(data: CategoryBreakdown[]): CategoryBreakdown[] {
    if (data.every((c) => c.paymentTotal === 0)) return data;

    const reduced = data
        .map((c) => ({ ...c, total: round2(c.total - c.paymentTotal), paymentTotal: 0 }))
        .filter((c) => c.total > 0);
    const grandTotal = reduced.reduce((sum, c) => sum + c.total, 0);
    return reduced.map((c) => ({
        ...c,
        percentage: grandTotal > 0 ? round2((c.total / grandTotal) * 100) : 0,
    }));
}

/**
 * Same rule as the category breakdown, applied to merchants: the two cards sit
 * side by side, so if one showed cash-only totals and the other included
 * deferred credit spending, the same purchase would appear at two different
 * amounts on one screen.
 */
export function excludeCreditFromMerchantBreakdown(data: MerchantBreakdown[]): MerchantBreakdown[] {
    const reduced = data
        .map((m) => ({ ...m, total: round2(m.total - m.creditTotal), creditTotal: 0 }))
        .filter((m) => m.total > 0);
    const grandTotal = reduced.reduce((sum, m) => sum + m.total, 0);
    return reduced.map((m) => ({
        ...m,
        percentage: grandTotal > 0 ? round2((m.total / grandTotal) * 100) : 0,
    }));
}

export function excludeCreditFromInstitutionBreakdown(data: InstitutionBreakdown[]): InstitutionBreakdown[] {
    const reduced = data
        .map((i) => ({ ...i, total: round2(i.total - i.creditTotal), creditTotal: 0 }))
        .filter((i) => i.total > 0);
    const grandTotal = reduced.reduce((sum, i) => sum + i.total, 0);
    return reduced.map((i) => ({
        ...i,
        percentage: grandTotal > 0 ? round2((i.total / grandTotal) * 100) : 0,
    }));
}

export function excludeCreditFromDailyBreakdown(data: DailyBreakdown[]): DailyBreakdown[] {
    return data.map((d) => ({
        ...d,
        expenses: round2(d.expenses - d.expensesCredit),
        net: round2(d.net + d.expensesCredit),
        expensesCredit: 0,
    }));
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
