"use client";

import { useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { DailyBreakdown, PreviousPeriodComparison } from "@/application/services/financial-dashboard-service";
import { buildPaceSeries, type PacePoint } from "../lib/dashboard-insights";
import { cn } from "@/lib/utils";

interface CyclePaceChartProps {
    dailyBreakdown: DailyBreakdown[];
    previous: PreviousPeriodComparison | null;
    startDate?: string;
    endDate?: string;
}

function formatCurrency(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatAxis(value: number): string {
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${Math.round(value)}`;
}

const CURRENT = "#ef4444";
const PREVIOUS = "var(--color-muted-foreground)";

interface PaceTooltipProps {
    active?: boolean;
    payload?: { payload: PacePoint }[];
    label?: number | string;
}

const PaceTooltip = ({ active, payload, label }: PaceTooltipProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
        <div className="z-50 flex flex-col gap-1 rounded-xl border border-border/50 bg-background/90 p-3 shadow-xl backdrop-blur-md">
            <span className="text-xs font-medium text-muted-foreground">Día {label}</span>
            {row.current !== null && (
                <span className="text-sm font-semibold tabular-nums">
                    Este ciclo {formatCurrency(row.current)}
                </span>
            )}
            <span className="text-xs tabular-nums text-muted-foreground">
                Ciclo anterior {formatCurrency(row.previous ?? 0)}
            </span>
        </div>
    );
};

/**
 * Spending pace: what has been consumed day by day this cycle, the same curve
 * for the previous one, and a dotted projection of where today's rhythm lands.
 *
 * It answers the one question a total cannot — "am I on track?" — while the
 * cycle is still running and something can still be done about it.
 */
export function CyclePaceChart({ dailyBreakdown, previous, startDate, endDate }: CyclePaceChartProps) {
    const series = useMemo(
        () => buildPaceSeries(dailyBreakdown, previous, startDate, endDate),
        [dailyBreakdown, previous, startDate, endDate],
    );

    if (!series) {
        return (
            <p className="flex min-h-[180px] items-center justify-center px-4 text-center text-sm leading-snug text-muted-foreground">
                Elige un rango con fecha de inicio y fin para comparar tu ritmo con el periodo anterior.
            </p>
        );
    }

    const { deltaPct, projected, spent, previousTotal } = series;
    const overspending = deltaPct !== null && deltaPct > 0;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[22px] font-bold leading-none tabular-nums">
                    {formatCurrency(projected ?? spent)}
                </span>
                <span className="text-[12px] text-muted-foreground">
                    {projected !== null ? "proyectado al cierre" : "gastado en el periodo"}
                </span>
                {deltaPct !== null && (
                    <span
                        className={cn(
                            "rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                            overspending
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                        )}
                    >
                        {overspending ? "▲" : "▼"} {Math.abs(deltaPct)}% vs. {formatCurrency(previousTotal)}
                    </span>
                )}
            </div>

            <div className="h-[190px] w-full sm:h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series.points} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                        <defs>
                            <linearGradient id="pace-current" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CURRENT} stopOpacity={0.28} />
                                <stop offset="95%" stopColor={CURRENT} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                        <XAxis
                            dataKey="day"
                            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                            minTickGap={24}
                        />
                        <YAxis
                            tickFormatter={formatAxis}
                            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                            width={46}
                        />
                        <Tooltip content={<PaceTooltip />} cursor={{ stroke: "var(--color-border-base)" }} />
                        <Line
                            type="monotone"
                            dataKey="previous"
                            name="Ciclo anterior"
                            stroke={PREVIOUS}
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            dot={false}
                            isAnimationActive={false}
                        />
                        <Area
                            type="monotone"
                            dataKey="current"
                            name="Este ciclo"
                            stroke={CURRENT}
                            strokeWidth={2}
                            fill="url(#pace-current)"
                            connectNulls={false}
                            dot={false}
                            isAnimationActive={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="projected"
                            name="Proyección"
                            stroke={CURRENT}
                            strokeWidth={2}
                            strokeDasharray="2 4"
                            strokeOpacity={0.65}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
                <LegendItem color={CURRENT} label="Este ciclo" />
                <LegendItem color={PREVIOUS} label="Ciclo anterior" dashed />
                {projected !== null && <LegendItem color={CURRENT} label="Proyección" dashed />}
            </div>
        </div>
    );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
    return (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
                aria-hidden
                className="h-0 w-4 shrink-0"
                style={{
                    borderTopWidth: 2,
                    borderTopStyle: dashed ? "dashed" : "solid",
                    borderTopColor: color,
                }}
            />
            {label}
        </span>
    );
}
