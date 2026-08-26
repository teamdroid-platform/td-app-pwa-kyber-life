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
                "relative overflow-hidden rounded-3xl px-5 py-4 shadow-lg shadow-black/30 transition-transform",
                onDetails && "cursor-pointer active:scale-[0.985]",
                negative
                    ? "bg-gradient-to-r from-[#0d101d] from-45% to-[#26101c]"
                    : "bg-gradient-to-r from-[#0d101d] from-45% to-[#0e2620]",
            )}
        >
            {/* Warm glow behind the wallet, on the right */}
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute -right-4 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-3xl",
                    negative ? "bg-rose-600/20" : "bg-emerald-600/20",
                )}
            />
            {/* Sparkle field around the illustration */}
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-28 top-4 h-3 w-3 text-white/40" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-14 top-10 h-2.5 w-2.5 text-white/25" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-6 top-4 h-2 w-2 text-white/30" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-24 bottom-4 h-2 w-2 text-white/20" />

            <div className="relative flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                    <p className="text-sm font-medium text-white/85">
                        Balance actual
                    </p>
                    <div className="flex items-center gap-2.5">
                        <h2
                            className={cn(
                                "truncate text-[2rem] font-bold leading-none tracking-tight tabular-nums",
                                negative ? "text-rose-400" : "text-emerald-400",
                            )}
                        >
                            {value}
                        </h2>
                        {onDetails && (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-md",
                                    negative ? "bg-rose-500" : "bg-emerald-500",
                                )}
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                            </span>
                        )}
                    </div>
                    <span
                        className={cn(
                            "flex w-fit max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold",
                            hasCredit ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-white/60",
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
                    <div className="flex h-16 w-16 rotate-6 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/90 to-violet-700/90 shadow-lg shadow-indigo-950/50">
                        <Wallet className="h-7 w-7 text-white/90" />
                    </div>
                    <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[13px] font-bold text-amber-950 shadow-md">
                        $
                    </div>
                </div>
            </div>
        </div>
    );
}
