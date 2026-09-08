"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InsightBarItem {
    key: string;
    label: string;
    /** Formatted figure shown at the end of the label line. */
    value: string;
    /** Bar length as a fraction of the widest item, 0–1. */
    fraction: number;
    /** Small muted note or delta chip after the value. */
    trailing?: ReactNode;
    /** Second line under the label, for counts or shares. */
    caption?: string;
    /** Bar colour. Falls back to the expense red. */
    color?: string;
}

interface InsightBarListProps {
    items: InsightBarItem[];
    /** Shown in place of the list when there is nothing to draw. */
    emptyLabel: string;
    className?: string;
}

/**
 * The ranked bar list behind the category, merchant and income cards.
 *
 * Built label-over-bar rather than in columns: at 360px a three-column row
 * leaves the bar about 90px wide, which is too short to compare anything. The
 * stacked layout gives the bar the full width at every breakpoint, so the same
 * markup works on a phone and on a desktop card.
 *
 * The bars are a single colour on purpose — the name beside each one already
 * identifies it, so spending a hue per row would add a rainbow that carries no
 * information and, with the app's category palette, is not distinguishable
 * under protanopia.
 */
export function InsightBarList({ items, emptyLabel, className }: InsightBarListProps) {
    if (items.length === 0) {
        return (
            <p className="flex min-h-[120px] items-center justify-center text-center text-sm text-muted-foreground">
                {emptyLabel}
            </p>
        );
    }

    return (
        <ul className={cn("flex flex-col gap-1", className)}>
            {items.map((item) => {
                const color = item.color ?? "var(--color-accent-danger)";
                return (
                    <li
                        key={item.key}
                        className="rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
                    >
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">
                                {item.label}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                <span className="text-[13px] font-semibold tabular-nums">{item.value}</span>
                                {item.trailing}
                            </span>
                        </div>

                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                            <div
                                className="h-full rounded-full"
                                style={{
                                    width: `${Math.max(2, item.fraction * 100)}%`,
                                    backgroundColor: color,
                                }}
                            />
                        </div>

                        {item.caption && (
                            <p className="mt-1 text-[11px] text-muted-foreground">{item.caption}</p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

interface DeltaChipProps {
    /** Percentage change vs. the previous period; `null` when incomparable. */
    deltaPct: number | null;
}

/**
 * "+12%" against the equivalent previous range.
 *
 * More spending is amber and less is green — the sign and the arrow carry the
 * meaning too, so the colour is never the only thing saying which way it went.
 */
export function DeltaChip({ deltaPct }: DeltaChipProps) {
    if (deltaPct === null) {
        return (
            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                nuevo
            </span>
        );
    }

    if (deltaPct === 0) {
        return (
            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                =
            </span>
        );
    }

    const rising = deltaPct > 0;
    return (
        <span
            className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                rising
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            )}
            title={`${rising ? "Más" : "Menos"} que el periodo anterior`}
        >
            {rising ? "▲" : "▼"} {Math.abs(deltaPct)}%
        </span>
    );
}
