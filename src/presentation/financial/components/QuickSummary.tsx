"use client";

import { TrendingUp, TrendingDown, ArrowRightLeft, Wallet } from "lucide-react";
import type { FinancialKPIs, DailyBreakdown } from "@/application/services/financial-dashboard-service";
import type { KpiModalKind } from "../lib/kpi-modal-config";
import { SparkStatCard, type SparkStatCardProps } from "@/presentation/components/dashboard/spark-stat-card";

function formatCurrency(value: number): string {
    return `$${Math.abs(value).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface QuickSummaryProps {
    kpis: FinancialKPIs | null;
    dailyBreakdown: DailyBreakdown[];
    /** Opens a KPI breakdown modal (only Ingresos/Gastos have one). */
    onOpenModal?: (kind: KpiModalKind) => void;
}

/**
 * "Resumen rápido": the four KPI cards in a single 4-column grid (all visible at
 * once), each rendered with the shared {@link SparkStatCard} atom.
 */
export function QuickSummary({ kpis, dailyBreakdown, onOpenModal }: QuickSummaryProps) {
    const cards: SparkStatCardProps[] = [
        {
            label: "Ingresos",
            value: formatCurrency(kpis?.totalIncome ?? 0),
            icon: TrendingUp,
            color: "#22c55e",
            tintClassName: "from-emerald-500/[0.16] via-emerald-500/[0.05]",
            badgeClassName: "bg-emerald-500/20 text-emerald-500 dark:text-emerald-400",
            points: dailyBreakdown.map((d) => d.income),
            onClick: onOpenModal ? () => onOpenModal("ingresos") : undefined,
        },
        {
            label: "Gastos",
            value: formatCurrency(kpis?.totalExpenses ?? 0),
            icon: TrendingDown,
            color: "#ef4444",
            tintClassName: "from-rose-500/[0.16] via-rose-500/[0.05]",
            badgeClassName: "bg-rose-500/20 text-rose-500 dark:text-rose-400",
            points: dailyBreakdown.map((d) => d.expenses),
            onClick: onOpenModal ? () => onOpenModal("gastos") : undefined,
        },
        {
            label: "Transferencias",
            value: formatCurrency(kpis?.totalTransfers ?? 0),
            icon: ArrowRightLeft,
            color: "#f59e0b",
            tintClassName: "from-amber-500/[0.16] via-amber-500/[0.05]",
            badgeClassName: "bg-amber-500/25 text-amber-600 dark:text-amber-400",
            points: dailyBreakdown.map((d) => d.other),
        },
        {
            label: "Retiros",
            value: formatCurrency(kpis?.totalWithdrawals ?? 0),
            icon: Wallet,
            color: "#3b82f6",
            tintClassName: "from-blue-500/[0.16] via-blue-500/[0.05]",
            badgeClassName: "bg-blue-500/20 text-blue-500 dark:text-blue-400",
            points: dailyBreakdown.map((d) => d.withdrawals),
        },
    ];

    return (
        <div className="space-y-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Resumen rápido</h2>

            <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {cards.map((card) => (
                    <SparkStatCard key={card.label} {...card} />
                ))}
            </div>
        </div>
    );
}
