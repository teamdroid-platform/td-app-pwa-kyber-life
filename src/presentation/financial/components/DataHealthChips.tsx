"use client";

import Link from "next/link";
import { Inbox, Copy, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FinancialKPIs } from "@/application/services/financial-dashboard-service";
import { cn } from "@/lib/utils";

interface DataHealthChipsProps {
    kpis: FinancialKPIs | null;
    /** Opens the modal that lets the user categorize the orphan transactions. */
    onFixUncategorized?: () => void;
}

interface Chip {
    key: string;
    count: number;
    title: string;
    caption: string;
    icon: LucideIcon;
    accent: string;
    /** Only set where the transactions list can actually filter for it. */
    href?: string;
    /** Set instead of `href` when the chip opens something in place. */
    onClick?: () => void;
}

/**
 * What still needs a human: transactions the scanner left unconfirmed, rows it
 * suspects are duplicates, and spending with no category — which silently drops
 * out of every category chart above.
 *
 * The pending chip links to the transactions list, which filters by `status`.
 * The uncategorized one opens its own modal instead — that list has no filter
 * for "has no category", which is exactly why these go unnoticed. Duplicates
 * have neither, so that chip reports the number without promising a
 * destination that does not exist.
 */
export function DataHealthChips({ kpis, onFixUncategorized }: DataHealthChipsProps) {
    if (!kpis) return null;

    const chips: Chip[] = [
        {
            key: "pending",
            count: kpis.pendingTransactionsCount,
            title: kpis.pendingTransactionsCount === 1 ? "Pendiente por revisar" : "Pendientes por revisar",
            caption: "Detectadas por el escáner, sin confirmar",
            icon: Inbox,
            accent: "text-amber-600 dark:text-amber-400",
            href: "/financial/transactions?status=DETECTED",
        },
        {
            key: "duplicates",
            count: kpis.possibleDuplicateCount,
            title: kpis.possibleDuplicateCount === 1 ? "Posible duplicado" : "Posibles duplicados",
            caption: "Misma cifra y fecha que otra transacción",
            icon: Copy,
            accent: "text-rose-600 dark:text-rose-400",
        },
        {
            key: "uncategorized",
            count: kpis.uncategorizedCount,
            title: "Sin categoría",
            caption: onFixUncategorized ? "Toca para asignarles una" : "No aparecen en el gasto por categoría",
            icon: Tag,
            accent: "text-indigo-600 dark:text-indigo-400",
            onClick: onFixUncategorized,
        },
    ].filter((chip) => chip.count > 0);

    if (chips.length === 0) {
        return (
            <p className="px-1 text-[12px] text-muted-foreground">
                Nada pendiente: todo el periodo está confirmado y categorizado.
            </p>
        );
    }

    return (
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {chips.map((chip) => {
                const body = (
                    <>
                        <span className={cn("text-[20px] font-bold leading-none tabular-nums", chip.accent)}>
                            {chip.count}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                            <span className="flex items-center gap-1.5 text-[13px] font-medium">
                                <chip.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                {chip.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{chip.caption}</span>
                        </span>
                    </>
                );

                const className =
                    "flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/20 px-4 py-3 transition-colors";
                const interactive = "hover:border-border hover:bg-muted/40 active:scale-[0.99]";

                return (
                    <li key={chip.key} className="sm:flex-1">
                        {chip.href ? (
                            <Link href={chip.href} className={cn(className, interactive)}>
                                {body}
                            </Link>
                        ) : chip.onClick ? (
                            <button
                                type="button"
                                onClick={chip.onClick}
                                className={cn(className, interactive, "w-full text-left")}
                            >
                                {body}
                            </button>
                        ) : (
                            <div className={className}>{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
