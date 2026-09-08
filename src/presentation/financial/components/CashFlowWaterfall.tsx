"use client";

import { useMemo } from "react";
import { CreditCard, Banknote } from "lucide-react";
import type { FinancialKPIs } from "@/application/services/financial-dashboard-service";
import { buildCashFlowSteps, type CashFlowKind } from "../lib/dashboard-insights";
import { cn } from "@/lib/utils";

interface CashFlowWaterfallProps {
    kpis: FinancialKPIs | null;
}

function formatSigned(value: number): string {
    const sign = value < 0 ? "−" : "+";
    return `${sign}$${Math.abs(value).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPlain(value: number): string {
    return `$${Math.abs(value).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Colour by the job the step does, not by its position. The tones are one step
 * deeper than the app's accent tokens: the lighter originals sit above the
 * legible lightness band on the dark `--bg-primary` surface.
 */
const STEP_COLOR: Record<CashFlowKind, string> = {
    in: "#059669",
    out: "#ef4444",
    transfer: "#d97706",
    total: "#6366f1",
};

/**
 * The period's balance as a cascade: each row is one movement, drawn as a
 * floating segment between the running total before it and after it.
 *
 * Laid out as rows rather than the usual vertical bars because that is the only
 * shape that survives a phone: six vertical bars on a 360px screen leave 50px
 * each, too narrow for a label or a figure. Rows keep the full width for the
 * scale at every breakpoint and give each step room for its own number.
 */
export function CashFlowWaterfall({ kpis }: CashFlowWaterfallProps) {
    const steps = useMemo(() => (kpis ? buildCashFlowSteps(kpis) : []), [kpis]);

    const scale = useMemo(() => {
        if (steps.length === 0) return null;
        const values = [0, ...steps.map((s) => s.running)];
        const max = Math.max(...values);
        const min = Math.min(...values);
        const span = max - min || 1;
        // 4% of headroom on each side so a segment touching the extreme still
        // shows its rounded end instead of being clipped by the track.
        const pad = span * 0.04;
        const lo = min - pad;
        const hi = max + pad;
        return {
            /** Position of a value along the track, as a 0–100 percentage. */
            at: (value: number) => ((value - lo) / (hi - lo)) * 100,
        };
    }, [steps]);

    if (!kpis || !scale || steps.length === 0) {
        return (
            <p className="flex min-h-[160px] items-center justify-center text-center text-sm text-muted-foreground">
                Sin movimientos en el periodo
            </p>
        );
    }

    const zeroAt = scale.at(0);

    return (
        <div className="flex flex-col gap-3">
            {kpis.totalExpensesCredit > 0 && (
                <p className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-3 py-2 text-[12px] leading-snug text-rose-600 dark:text-rose-300">
                    <CreditCard className="h-3.5 w-3.5 shrink-0" />
                    <span>
                        <strong className="font-semibold tabular-nums">{formatPlain(kpis.totalExpensesCredit)}</strong>{" "}
                        con tarjeta — diferido, todavía no sale de tu balance.
                    </span>
                </p>
            )}

            <ol className="flex flex-col gap-0.5">
                {steps.map((step) => {
                    const isTotal = step.kind === "total";
                    const from = isTotal ? 0 : step.running - step.amount;
                    const left = Math.min(scale.at(from), scale.at(step.running));
                    const width = Math.abs(scale.at(step.running) - scale.at(from));
                    const color = STEP_COLOR[step.kind];

                    return (
                        <li
                            key={step.key}
                            className={cn(
                                "rounded-xl px-2 py-2 transition-colors hover:bg-muted/40",
                                isTotal && "mt-1 border-t border-border/60 pt-3 hover:bg-transparent",
                            )}
                        >
                            <div className="flex items-baseline justify-between gap-3">
                                <span
                                    className={cn(
                                        "min-w-0 flex-1 truncate text-[13px]",
                                        isTotal ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                                    )}
                                >
                                    {step.label}
                                </span>
                                <span
                                    className={cn(
                                        "shrink-0 tabular-nums",
                                        isTotal ? "text-[15px] font-bold" : "text-[13px] font-semibold",
                                    )}
                                    style={{ color }}
                                >
                                    {isTotal ? formatSigned(step.running) : formatSigned(step.amount)}
                                </span>
                            </div>

                            <div className="relative mt-1.5 h-2.5 w-full rounded-full bg-muted/40">
                                {/* Where the balance sits at zero — the reference every segment is read against. */}
                                <span
                                    aria-hidden
                                    className="absolute inset-y-[-3px] w-px bg-border"
                                    style={{ left: `${zeroAt}%` }}
                                />
                                <span
                                    className="absolute inset-y-0 rounded-full"
                                    style={{
                                        left: `${left}%`,
                                        width: `${Math.max(1.5, width)}%`,
                                        backgroundColor: color,
                                        opacity: isTotal ? 1 : 0.92,
                                    }}
                                />
                            </div>

                            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                {isTotal ? step.note : `${step.note} · queda ${formatSigned(step.running)}`}
                            </p>
                        </li>
                    );
                })}
            </ol>

            {kpis.totalWithdrawals > 0 && (
                <p className="flex items-center gap-2 px-2 text-[11px] leading-snug text-muted-foreground">
                    <Banknote className="h-3.5 w-3.5 shrink-0" />
                    <span>
                        <strong className="font-medium tabular-nums text-foreground/80">
                            {formatPlain(kpis.totalWithdrawals)}
                        </strong>{" "}
                        en retiros: el efectivo cambia de forma, no sale de tu balance.
                    </span>
                </p>
            )}
        </div>
    );
}
