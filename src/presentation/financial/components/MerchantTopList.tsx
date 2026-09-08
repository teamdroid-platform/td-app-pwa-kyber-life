"use client";

import { useMemo } from "react";
import type { MerchantBreakdown } from "@/application/services/financial-dashboard-service";
import { InsightBarList, type InsightBarItem } from "./insight-bars";

interface MerchantTopListProps {
    data: MerchantBreakdown[];
    limit: number;
}

function formatCurrency(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Who actually receives the money, ranked.
 *
 * Replaces the institution chart. Which bank a movement passed through is
 * plumbing — it does not change a decision. The merchant does: it is the name
 * the user recognises and the level at which spending can actually be cut.
 */
export function MerchantTopList({ data, limit }: MerchantTopListProps) {
    const items: InsightBarItem[] = useMemo(() => {
        const rows = data.slice(0, limit);
        const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
        return rows.map((row) => ({
            key: row.merchant,
            label: row.merchant,
            value: formatCurrency(row.total),
            fraction: row.total / max,
            color: "var(--color-accent-primary)",
            caption:
                row.count > 1
                    ? `${row.count} movimientos · ${formatCurrency(row.total / row.count)} en promedio`
                    : "1 movimiento",
        }));
    }, [data, limit]);

    return <InsightBarList items={items} emptyLabel="Sin gastos con comercio identificado" />;
}
