"use client";

import { useMemo } from "react";
import type { CategoryBreakdown, PreviousPeriodComparison } from "@/application/services/financial-dashboard-service";
import { withCategoryDeltas } from "../lib/dashboard-insights";
import { excludeCardPaymentsFromCategoryBreakdown } from "../lib/credit-toggle";
import { InsightBarList, DeltaChip, type InsightBarItem } from "./insight-bars";
import { Switch } from "@/components/ui/switch";

interface CategoryDeltaBarsProps {
    data: CategoryBreakdown[];
    previous: PreviousPeriodComparison | null;
    limit: number;
    /** When true, card settlements count as spending. Off by default. */
    includePayments: boolean;
    onIncludePaymentsChange: (value: boolean) => void;
}

function formatCurrency(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Spending by category, ranked, each bar carrying how it moved against the
 * equivalent previous range.
 *
 * Replaces the donut. A donut answers "what share", which is the question the
 * user asks least; the one that changes behaviour is "did this go up?", and a
 * ranked bar with a delta answers both at once. Card settlements are excluded
 * by default — see {@link excludeCardPaymentsFromCategoryBreakdown}.
 */
export function CategoryDeltaBars({
    data,
    previous,
    limit,
    includePayments,
    onIncludePaymentsChange,
}: CategoryDeltaBarsProps) {
    const rows = useMemo(() => {
        const scoped = includePayments ? data : excludeCardPaymentsFromCategoryBreakdown(data);
        return withCategoryDeltas(scoped, previous, includePayments).slice(0, limit);
    }, [data, previous, includePayments, limit]);

    const items: InsightBarItem[] = useMemo(() => {
        const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
        return rows.map((row) => ({
            key: row.categoryId ?? "uncategorized",
            label: row.categoryName,
            value: formatCurrency(row.total),
            fraction: row.total / max,
            trailing: <DeltaChip deltaPct={row.deltaPct} />,
            caption:
                row.previousTotal !== null
                    ? `${row.count} mov. · antes ${formatCurrency(row.previousTotal)}`
                    : `${row.count} mov.`,
        }));
    }, [rows]);

    const hasSettlements = data.some((c) => c.paymentTotal > 0);

    return (
        <div className="flex flex-col gap-3">
            {hasSettlements && (
                <div className="flex items-center gap-2.5">
                    <Switch
                        checked={includePayments}
                        onChange={onIncludePaymentsChange}
                        label="Incluir pagos de tarjeta en el gasto por categoría"
                    />
                    <button
                        type="button"
                        onClick={() => onIncludePaymentsChange(!includePayments)}
                        className="text-left text-[12px] leading-snug text-muted-foreground transition-colors hover:text-foreground/80"
                    >
                        Incluir pagos de tarjeta
                    </button>
                </div>
            )}

            <InsightBarList
                items={items}
                emptyLabel="Sin gastos categorizados en el periodo"
            />

            {includePayments && hasSettlements && (
                <p className="px-2 text-[11px] leading-snug text-muted-foreground">
                    Los pagos de tarjeta saldan compras que ya contaron como gasto el día que las hiciste.
                </p>
            )}
        </div>
    );
}
