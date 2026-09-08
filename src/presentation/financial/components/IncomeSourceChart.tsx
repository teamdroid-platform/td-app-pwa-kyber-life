"use client";

import { useMemo } from "react";
import type { IncomeSourceBreakdown } from "@/application/services/financial-dashboard-service";
import { InsightBarList, type InsightBarItem } from "./insight-bars";

interface IncomeSourceChartProps {
    data: IncomeSourceBreakdown[];
    limit: number;
}

function formatCurrency(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Where the money comes from, ranked by amount.
 *
 * Income used to exist on this screen as a single KPI figure, with no way to
 * see whether it was one salary or a dozen scattered payments — which is the
 * difference between stable and fragile.
 */
export function IncomeSourceChart({ data, limit }: IncomeSourceChartProps) {
    const items: InsightBarItem[] = useMemo(() => {
        const rows = data.slice(0, limit);
        const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
        return rows.map((row) => ({
            key: row.sourceId ?? `merchant:${row.sourceName}`,
            label: row.sourceName,
            value: formatCurrency(row.total),
            fraction: row.total / max,
            color: "var(--color-accent-success)",
            trailing: (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                    {Math.round(row.percentage)}%
                </span>
            ),
            caption: row.count > 1 ? `${row.count} movimientos` : "1 movimiento",
        }));
    }, [data, limit]);

    return <InsightBarList items={items} emptyLabel="Sin ingresos registrados en el periodo" />;
}
