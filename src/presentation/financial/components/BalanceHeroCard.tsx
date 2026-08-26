"use client";

import { Wallet, ChevronDown, Sparkles, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(value: number): string {
    return `$${Math.abs(value).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface BalanceHeroCardProps {
    /** Formatted balance string, already including its sign (e.g. "-$1.116,48"). */
    value: string;
    /** True when the balance is negative — flips the card to the danger palette. */
    negative: boolean;
    /** Amount spent with a credit card in the period — surfaced in the pill. */
    creditSpent: number;
    /** Opens the balance breakdown modal when set (renders the affordance chip). */
    onDetails?: () => void;
}

/**
 * Mobile-only hero card for the financial overview. Shows the net balance as a
 * prominent gradient panel (red when negative, emerald when positive) with a
 * status pill and a stylized wallet illustration glowing from the right.
 */
export function BalanceHeroCard({ value, negative, creditSpent, onDetails }: BalanceHeroCardProps) {
    const hasCredit = creditSpent > 0;
    return (
        <div
            role={onDetails ? "button" : undefined}
            tabIndex={onDetails ? 0 : undefined}
            onClick={onDetails}
            onKeyDown={onDetails ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetails(); } } : undefined}
            className={cn(
                "relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-sm shadow-slate-200/50 backdrop-blur-sm transition-transform",
                "dark:border-white/10 dark:shadow-lg dark:shadow-black/30",
                onDetails && "cursor-pointer active:scale-[0.985]",
                negative
                    ? "dark:bg-gradient-to-r dark:from-[#0d101d] dark:from-45% dark:to-[#26101c]"
                    : "dark:bg-gradient-to-r dark:from-[#0d101d] dark:from-45% dark:to-[#0e2620]",
            )}
        >
            {/* Top subtle accent line */}
            <div
                className={cn(
                    "absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent to-transparent",
                    negative ? "via-rose-500/30" : "via-emerald-500/30"
                )}
                aria-hidden="true"
            />
            {/* Warm glow behind the wallet, on the right */}
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute -right-4 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-3xl",
                    negative ? "bg-rose-500/10 dark:bg-rose-600/20" : "bg-emerald-500/10 dark:bg-emerald-600/20",
                )}
            />
            {/* Sparkle field around the illustration */}
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-28 top-4 h-3 w-3 text-emerald-600/30 dark:text-white/40" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-14 top-10 h-2.5 w-2.5 text-emerald-600/20 dark:text-white/25" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-6 top-4 h-2 w-2 text-emerald-600/25 dark:text-white/30" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-24 bottom-4 h-2 w-2 text-emerald-600/15 dark:text-white/20" />

            <div className="relative flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                    <p className="text-sm font-medium text-text-secondary dark:text-white/85">
                        Balance actual
                    </p>
                    <div className="flex items-center gap-2.5">
                        <h2
                            className={cn(
                                "truncate text-[2rem] font-bold leading-none tracking-tight tabular-nums",
                                negative ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                            )}
                        >
                            {value}
                        </h2>
                        {onDetails && (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-sm",
                                    negative ? "bg-rose-500" : "bg-emerald-500",
                                )}
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                            </span>
                        )}
                    </div>
                    <span
                        className={cn(
                            "flex w-fit max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold border",
                            hasCredit
                                ? "border-amber-500/20 bg-amber-50 text-amber-800 dark:border-transparent dark:bg-amber-500/15 dark:text-amber-300"
                                : "border-slate-200/80 bg-slate-100/80 text-slate-600 dark:border-transparent dark:bg-white/10 dark:text-white/60",
                        )}
                    >
                        <CreditCard className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                            {hasCredit
                                ? `${formatCurrency(creditSpent)} en tarjeta de crédito`
                                : "Sin gastos con tarjeta de crédito"}
                        </span>
                    </span>
                </div>

                {/* Stylized wallet illustration */}
                <div className="relative shrink-0">
                    <div className="flex h-16 w-16 rotate-6 items-center justify-center rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25 dark:border-white/10 dark:from-indigo-500/90 dark:to-violet-700/90 dark:shadow-indigo-950/50">
                        <Wallet className="h-7 w-7 text-white" />
                    </div>
                    <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[13px] font-bold text-amber-950 shadow-md">
                        $
                    </div>
                </div>
            </div>
        </div>
    );
}
