"use client";

import type { TransactionTypeCounts } from "@/application/services/financial-settings-service";
import { TYPE_BUCKET_ORDER, TYPE_BUCKET_META } from "../../lib/transaction-type-buckets";
import { cn } from "@/lib/utils";

interface TransactionCountSummaryProps {
    counts?: TransactionTypeCounts;
    /** True while the counts are still loading in the background. */
    loading?: boolean;
    className?: string;
}

/**
 * Compact, space-saving breakdown of an entity's transactions: a small
 * colored icon + number per non-empty type bucket, plus a total pill. Shows a
 * subtle skeleton while loading so cards render immediately.
 */
export function TransactionCountSummary({ counts, loading, className }: TransactionCountSummaryProps) {
    if (loading && !counts) {
        return <div className={cn("h-4 w-24 rounded bg-muted/50 animate-pulse", className)} aria-hidden />;
    }

    const total = counts?.total ?? 0;
    if (total === 0) {
        return <span className={cn("text-[11px] text-muted-foreground/70", className)}>Sin transacciones</span>;
    }

    return (
        <div className={cn("flex items-center gap-x-2 gap-y-1 flex-wrap", className)}>
            {/* Show every type bucket, even when a type has 0. */}
            {TYPE_BUCKET_ORDER.map((b) => {
                const meta = TYPE_BUCKET_META[b];
                const Icon = meta.icon;
                const n = counts![b] ?? 0;
                return (
                    <span
                        key={b}
                        title={`${meta.label}: ${n}`}
                        className={cn(
                            "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
                            n === 0 && "opacity-40",
                        )}
                        style={{ color: meta.color }}
                    >
                        <Icon className="w-3 h-3 shrink-0" />
                        {n}
                    </span>
                );
            })}
            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                {total} total
            </span>
        </div>
    );
}
