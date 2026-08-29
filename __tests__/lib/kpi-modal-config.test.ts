import { buildKpiModalConfig, type KpiBreakdownInputs } from "@/presentation/financial/lib/kpi-modal-config";
import type { FinancialKPIs } from "@/application/services/financial-dashboard-service";

function makeKpis(over: Partial<FinancialKPIs> = {}): FinancialKPIs {
    return {
        totalIncome: 4206.13,
        totalExpenses: 2701.70, // 2473.06 real + 228.64 credit
        totalExpensesCredit: 228.64,
        totalTransfers: 238.84,
        totalTransfersSavings: 238.84,
        totalTransfersFunding: 0,
        totalWithdrawals: 0,
        netBalance: 1494.23,
        transactionCount: 10,
        avgTransactionAmount: 100,
        pendingTransactionsCount: 0,
        currency: "USD",
        ...over,
    };
}

describe("buildKpiModalConfig — balance", () => {
    it("OFF (default): balance excludes credit and the note says it is not included", () => {
        const cfg = buildKpiModalConfig("balance", makeKpis());

        expect(cfg.total.amount).toBe(1494.23);
        expect(cfg.note).toMatch(/No incluye/i);
        expect(cfg.note).toContain("228,64");
        expect(cfg.rows.some((r) => r.label === "Gastos con tarjeta")).toBe(false);
    });

    it("ON: balance subtracts credit, adds a credit row, and the note says it is included", () => {
        const cfg = buildKpiModalConfig("balance", makeKpis(), true);

        // 1494.23 - 228.64 = 1265.59
        expect(cfg.total.amount).toBe(1265.59);
        expect(cfg.note).toMatch(/^Incluye/i);
        expect(cfg.note).toContain("228,64");
        const creditRow = cfg.rows.find((r) => r.label === "Gastos con tarjeta");
        expect(creditRow?.amount).toBe(228.64);
        expect(creditRow?.tone).toBe("negative");
    });

    it("no credit spending: no note and balance unchanged in both states", () => {
        const kpis = makeKpis({ totalExpenses: 2473.06, totalExpensesCredit: 0 });
        expect(buildKpiModalConfig("balance", kpis, false).note).toBeUndefined();
        const on = buildKpiModalConfig("balance", kpis, true);
        expect(on.note).toBeUndefined();
        expect(on.total.amount).toBe(1494.23);
        expect(on.rows.some((r) => r.label === "Gastos con tarjeta")).toBe(false);
    });

    it("PERIOD and PERIOD_WITH_CREDIT share the same netBalance input — the mode only decides whether it's subtracted here", () => {
        // Shape a caller builds from BalanceSet.period / .withCredit.creditDeferred
        // (see FinancialDashboard's balanceBreakdownInputs): netBalance is
        // period.value in BOTH modes; includeCredit is what differs.
        const periodShaped = {
            totalIncome: 5000,
            totalExpenses: 300,
            totalExpensesCredit: 50,
            totalTransfersFunding: 0,
            totalTransfersSavings: 0,
            netBalance: 4700,
        };

        const period = buildKpiModalConfig("balance", periodShaped, false);
        expect(period.total.amount).toBe(4700);

        const withCredit = buildKpiModalConfig("balance", periodShaped, true);
        expect(withCredit.total.amount).toBe(4650);
    });
});

describe("buildKpiModalConfig — traspasos entre cuentas dentro y fuera de la configuración", () => {
    /** `totalTransfersCrossScope` solo existe en el tipo del modal, no en los KPI. */
    function crossScopeKpis(crossScope: number, netBalance: number): KpiBreakdownInputs {
        return { ...makeKpis({ netBalance }), totalTransfersCrossScope: crossScope };
    }

    /** Los renglones tienen que sumar el total que encabeza el modal. */
    function sumRows(cfg: ReturnType<typeof buildKpiModalConfig>): number {
        const total = cfg.rows.reduce(
            (sum, row) => sum + (row.tone === "negative" ? -row.amount : row.amount), 0,
        );
        return Math.round(total * 100) / 100;
    }

    it("suma un renglón cuando entró dinero desde una cuenta que no presupuestas", () => {
        const cfg = buildKpiModalConfig("balance", crossScopeKpis(500, 1994.23));

        const row = cfg.rows.find(r => r.label.startsWith("Traspasos desde"));
        expect(row?.amount).toBe(500);
        expect(row?.tone).toBe("positive");
        expect(sumRows(cfg)).toBe(cfg.total.amount);
    });

    it("resta un renglón cuando salió hacia una de ellas", () => {
        const cfg = buildKpiModalConfig("balance", crossScopeKpis(-500, 994.23));

        const row = cfg.rows.find(r => r.label.startsWith("Traspasos a"));
        expect(row?.amount).toBe(500);
        expect(row?.tone).toBe("negative");
        expect(sumRows(cfg)).toBe(cfg.total.amount);
    });

    it("sin cruces, no aparece ningún renglón de traspasos", () => {
        const cfg = buildKpiModalConfig("balance", makeKpis());

        expect(cfg.rows.some(r => r.label.startsWith("Traspasos"))).toBe(false);
        expect(sumRows(cfg)).toBe(cfg.total.amount);
    });
});
