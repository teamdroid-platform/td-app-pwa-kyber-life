import { buildKpiModalConfig } from "@/presentation/financial/lib/kpi-modal-config";
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
});
