import type {
    FinancialKPIs,
    CategoryBreakdown,
    InstitutionBreakdown,
    DailyBreakdown,
} from "@/application/services/financial-dashboard-service";

/**
 * Strip the credit-card-paid portion out of already-fetched dashboard data,
 * for the "Incluir gastos con tarjeta" toggle. Every breakdown already
 * carries its credit-card sub-total (added for the real/credit split), so
 * this is a pure client-side transform — no refetch needed to flip the view.
 * Only EXPENSE-type amounts can be `paidWithCredit`, so income, transfers,
 * withdrawals and the balance itself are untouched.
 */
export function excludeCreditFromKpis(kpis: FinancialKPIs): FinancialKPIs {
    return {
        ...kpis,
        totalExpenses: round2(kpis.totalExpenses - kpis.totalExpensesCredit),
        totalExpensesCredit: 0,
    };
}

/**
 * Apply the credit-card-paid expenses to the balance, for when the "Incluir
 * gastos con tarjeta" toggle is ON. By default those expenses are deferred, so
 * `netBalance` excludes them; with the toggle on the user wants to see the
 * balance as if the card were already paid, so subtract the credit portion from
 * it. `totalExpenses` already includes credit in the raw KPIs, so it's left as-is.
 */
export function includeCreditInKpis(kpis: FinancialKPIs): FinancialKPIs {
    return {
        ...kpis,
        netBalance: round2(kpis.netBalance - kpis.totalExpensesCredit),
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
