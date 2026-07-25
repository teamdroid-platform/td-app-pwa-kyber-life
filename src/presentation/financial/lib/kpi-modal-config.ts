import type { LucideIcon } from "lucide-react";
import { Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import type { FinancialKPIs } from "@/application/services/financial-dashboard-service";
import type { BreakdownRow, BreakdownTone } from "@/presentation/financial/components/KpiBreakdownModal";

export type KpiModalKind = "balance" | "ingresos" | "gastos";

export interface KpiModalConfig {
    title: string;
    description: string;
    icon: LucideIcon;
    iconClassName: string;
    rows: BreakdownRow[];
    total: { label: string; amount: number; tone: BreakdownTone; showSign?: boolean };
    note?: string;
}

function currency(n: number): string {
    return `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds the content for a KpiBreakdownModal from the raw (untoggled) KPIs —
 * shared by every dashboard that lets a user tap a Balance/Ingresos/Gastos
 * tile to see "how was this number calculated".
 *
 * `includeCredit` mirrors the "Incluir gastos con tarjeta" toggle: when ON, the
 * balance detail counts the credit-card-paid expenses (so the total and the
 * note match the toggled hero card); when OFF, they are shown as deferred.
 */
export function buildKpiModalConfig(kind: KpiModalKind, kpis: FinancialKPIs, includeCredit = false): KpiModalConfig {
    const realExpenses = Math.max(0, kpis.totalExpenses - kpis.totalExpensesCredit);

    if (kind === "balance") {
        const hasCredit = kpis.totalExpensesCredit > 0;
        const creditCounts = includeCredit && hasCredit;
        const balanceAmount = creditCounts
            ? Math.round((kpis.netBalance - kpis.totalExpensesCredit) * 100) / 100
            : kpis.netBalance;

        const rows: BreakdownRow[] = [{ label: "Ingresos", amount: kpis.totalIncome, tone: "positive" as BreakdownTone }];
        if (kpis.totalTransfersFunding > 0) {
            rows.push({ label: "Fondeo desde ahorros", amount: kpis.totalTransfersFunding, tone: "positive", hint: "Transferencias que regresan dinero a tu balance disponible" });
        }
        rows.push({ label: "Gastos reales", amount: realExpenses, tone: "negative" });
        if (creditCounts) {
            rows.push({ label: "Gastos con tarjeta", amount: kpis.totalExpensesCredit, tone: "negative", hint: "Incluidos en el balance mientras el filtro de tarjeta esté activo" });
        }
        if (kpis.totalTransfersSavings > 0) {
            rows.push({ label: "Ahorro apartado", amount: kpis.totalTransfersSavings, tone: "negative", hint: "Transferencias a ahorros e inversiones" });
        }
        return {
            title: "Detalle del balance",
            description: "Cómo se calculó tu saldo disponible",
            icon: Wallet,
            iconClassName: balanceAmount < 0 ? "bg-accent-danger/10 text-accent-danger" : "bg-emerald-500/10 text-emerald-500",
            rows,
            total: { label: "Balance", amount: balanceAmount, tone: (balanceAmount < 0 ? "negative" : "positive") as BreakdownTone, showSign: true },
            note: !hasCredit
                ? undefined
                : creditCounts
                    ? `Incluye ${currency(kpis.totalExpensesCredit)} en gastos pagados con tarjeta de crédito.`
                    : `No incluye ${currency(kpis.totalExpensesCredit)} en gastos pagados con tarjeta de crédito — se reflejarán cuando registres el pago de la tarjeta.`,
        };
    }

    if (kind === "ingresos") {
        const rows: BreakdownRow[] = [{ label: "Ingresos", amount: kpis.totalIncome, tone: "positive" as BreakdownTone }];
        if (kpis.totalTransfersFunding > 0) {
            rows.push({ label: "Fondeo desde ahorros", amount: kpis.totalTransfersFunding, tone: "positive", hint: "Transferencias que regresan dinero a tu balance disponible" });
        }
        return {
            title: "Detalle de ingresos",
            description: "Todo el dinero que entró a tu balance disponible",
            icon: ArrowDownCircle,
            iconClassName: "bg-accent-success/10 text-accent-success",
            rows,
            total: { label: "Total ingresado", amount: kpis.totalIncome + kpis.totalTransfersFunding, tone: "positive" as BreakdownTone, showSign: false },
        };
    }

    // gastos
    const rows: BreakdownRow[] = [{ label: "Gastos reales", amount: realExpenses, tone: "negative" as BreakdownTone, hint: "Ya afectan tu balance disponible" }];
    if (kpis.totalExpensesCredit > 0) {
        rows.push({ label: "Gastos con tarjeta", amount: kpis.totalExpensesCredit, tone: "pending", hint: "Pendientes de reflejarse cuando pagues la tarjeta" });
    }
    return {
        title: "Detalle de gastos",
        description: "Gastos reales vs. pagados con tarjeta de crédito",
        icon: ArrowUpCircle,
        iconClassName: "bg-accent-danger/10 text-accent-danger",
        rows,
        total: { label: "Total gastado", amount: kpis.totalExpenses, tone: "negative" as BreakdownTone, showSign: false },
    };
}
