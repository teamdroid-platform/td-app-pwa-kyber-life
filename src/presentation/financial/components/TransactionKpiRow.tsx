"use client";

import { useMemo } from "react";
import { Scale, TrendingUp, TrendingDown, ArrowRightLeft, Wallet } from "lucide-react";
import type { FinancialTransaction } from "@/domain/entities/financial";
import { SparkStatCard, type SparkStatCardProps } from "@/presentation/components/dashboard/spark-stat-card";
import { transactionTotals } from "../lib/transaction-totals";

interface TransactionKpiRowProps {
    /** El conjunto filtrado completo, no la página cargada: las cifras son del total. */
    transactions: FinancialTransaction[];
}

function money(value: number, currency: string): string {
    const sign = value < 0 ? "-" : "";
    return `${sign}${new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.abs(value))}`;
}

/**
 * Las cinco cifras del periodo, siempre a la vista en escritorio.
 *
 * En móvil no se monta: ahí sigue el panel plegable, que en media pantalla es
 * la forma correcta de no gastar el alto en cinco tarjetas antes de la primera
 * transacción.
 *
 * Los totales salen de la misma función que usa ese panel, así que las dos
 * vistas no pueden discrepar. El balance no resta los retiros: el efectivo
 * cambia de forma, no sale.
 */
export function TransactionKpiRow({ transactions }: TransactionKpiRowProps) {
    const totals = useMemo(() => transactionTotals(transactions), [transactions]);

    const cards: SparkStatCardProps[] = [
        {
            label: "Balance del periodo",
            value: money(totals.balance, totals.currency),
            icon: Scale,
            color: "#6366f1",
            tintClassName: "from-indigo-500/[0.16] via-indigo-500/[0.05]",
            badgeClassName: "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400",
            points: totals.series.income.map((v, i) => v - (totals.series.expense[i] ?? 0)),
        },
        {
            label: "Ingresos",
            value: money(totals.income, totals.currency),
            icon: TrendingUp,
            color: "#22c55e",
            tintClassName: "from-emerald-500/[0.16] via-emerald-500/[0.05]",
            badgeClassName: "bg-emerald-500/20 text-emerald-500 dark:text-emerald-400",
            points: totals.series.income,
        },
        {
            label: "Gastos",
            value: money(totals.expense, totals.currency),
            icon: TrendingDown,
            color: "#ef4444",
            tintClassName: "from-rose-500/[0.16] via-rose-500/[0.05]",
            badgeClassName: "bg-rose-500/20 text-rose-500 dark:text-rose-400",
            points: totals.series.expense,
        },
        {
            label: "Transferencias",
            value: money(totals.other, totals.currency),
            icon: ArrowRightLeft,
            color: "#f59e0b",
            tintClassName: "from-amber-500/[0.16] via-amber-500/[0.05]",
            badgeClassName: "bg-amber-500/25 text-amber-600 dark:text-amber-400",
            points: totals.series.other,
        },
        {
            label: "Retiros",
            value: money(totals.withdrawal, totals.currency),
            icon: Wallet,
            color: "#3b82f6",
            tintClassName: "from-blue-500/[0.16] via-blue-500/[0.05]",
            badgeClassName: "bg-blue-500/20 text-blue-500 dark:text-blue-400",
            points: totals.series.withdrawal,
        },
    ];

    return (
        // Tres columnas primero y cinco cuando el contenedor da de sí: a 1024 de
        // ancho, cinco tarjetas dejan 190px cada una y "Balance del periodo" no
        // entra sin partirse.
        <div className="grid grid-cols-2 gap-2 @3xl/txlist:grid-cols-3 @3xl/txlist:gap-3 @6xl/txlist:grid-cols-5">
            {cards.map((card) => (
                <SparkStatCard key={card.label} {...card} />
            ))}
        </div>
    );
}
