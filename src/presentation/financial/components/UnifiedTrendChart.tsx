"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { BarChart3, Activity, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, type LucideIcon } from "lucide-react";
import { DailyBreakdown } from "@/application/services/financial-dashboard-service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RobotLoader } from '@/components/ui/RobotLoader';
import { cn } from "@/lib/utils";
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";
import {
    formatDay,
    formatMonth,
    formatWeek,
    getMonthKey,
    getStartOfWeek,
    suggestViewMode,
    formatChartCurrency as formatCurrency,
    formatAxisCurrency,
} from "@/lib/date-bucketing";

interface UnifiedTrendChartProps {
    data: DailyBreakdown[];
    /** Render a custom legend with the per-type icon + color used by the KPIs. */
    iconLegend?: boolean;
    className?: string;
}

type ViewMode = "day" | "week" | "month";

interface TypeTotals {
    income: number;
    expenses: number;
    withdrawals: number;
    other: number;
}

// Legend entries aligned with the KPI cards (color + icon per transaction type).
const TYPE_LEGEND: { key: keyof TypeTotals; label: string; color: string; Icon: LucideIcon }[] = [
    { key: "income", label: "Ingresos", color: "hsl(142, 71%, 45%)", Icon: TrendingUp },
    { key: "expenses", label: "Gastos", color: "hsl(0, 84%, 60%)", Icon: TrendingDown },
    { key: "other", label: "Transferencias", color: "#f59e0b", Icon: ArrowRightLeft },
    { key: "withdrawals", label: "Retiros", color: "#0284c7", Icon: Wallet },
];

/** Bottom legend: per-type icon + period total (no text labels), tied by color. */
function TypeLegend({ totals }: { totals?: TypeTotals }) {
    return (
        <div className="flex flex-nowrap items-center justify-center gap-x-3 sm:gap-x-5 overflow-x-auto custom-scrollbar px-0.5">
            {TYPE_LEGEND.map(({ key, label, color, Icon }) => (
                <div key={key} className="flex items-center gap-1 sm:gap-1.5 shrink-0" title={label} aria-label={label}>
                    <span className="flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${color}26`, color }}>
                        <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </span>
                    <span className="text-xs sm:text-sm font-bold leading-none whitespace-nowrap" style={{ color }}>
                        {formatCurrency(totals?.[key] || 0)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function UnifiedTrendChart({ data, iconLegend = false, className }: UnifiedTrendChartProps) {
    const [chartType, setChartType] = useState<"bar" | "curve">("curve");
    const [userMode, setUserMode] = useState<ViewMode | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    // On touch the tooltip has no "mouse leave" to close it, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    // Intelligent default granularity based on the dataset span, overridable by
    // the user. Derived (not effect-driven) to avoid cascading renders.
    const suggestedMode = useMemo<ViewMode>(
        () => (data.length > 0 ? suggestViewMode(data[0].date, data[data.length - 1].date) : "month"),
        [data],
    );
    const viewMode = userMode ?? suggestedMode;

    const handleViewChange = (mode: ViewMode) => setUserMode(mode);

    // Per-type totals over the displayed period (for the icon legend).
    const totals = useMemo<TypeTotals>(
        () =>
            data.reduce<TypeTotals>(
                (acc, d) => ({
                    income: acc.income + d.income,
                    expenses: acc.expenses + d.expenses,
                    withdrawals: acc.withdrawals + (d.withdrawals || 0),
                    other: acc.other + (d.other || 0),
                }),
                { income: 0, expenses: 0, withdrawals: 0, other: 0 },
            ),
        [data],
    );

    const chartData = useMemo(() => {
        if (viewMode === "day") {
            return data.map(d => ({
                ...d,
                expensesReal: Math.max(0, d.expenses - (d.expensesCredit || 0)),
                label: formatDay(d.date),
                fullLabel: d.date,
            }));
        }

        const groups: Record<string, { income: number; expenses: number; expensesCredit: number; withdrawals: number; other: number; net: number }> = {};

        for (const d of data) {
            let key = d.date;
            if (viewMode === "week") key = getStartOfWeek(d.date);
            if (viewMode === "month") key = getMonthKey(d.date);

            if (!groups[key]) {
                groups[key] = { income: 0, expenses: 0, expensesCredit: 0, withdrawals: 0, other: 0, net: 0 };
            }
            groups[key].income += d.income;
            groups[key].expenses += d.expenses;
            groups[key].expensesCredit += d.expensesCredit || 0;
            groups[key].withdrawals += d.withdrawals || 0;
            groups[key].other += d.other || 0;
            groups[key].net += d.net;
        }

        return Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, vals]) => ({
                label: viewMode === "week" ? formatWeek(key) : formatMonth(key),
                fullLabel: key,
                income: Math.round(vals.income * 100) / 100,
                expenses: Math.round(vals.expenses * 100) / 100,
                expensesCredit: Math.round(vals.expensesCredit * 100) / 100,
                expensesReal: Math.max(0, Math.round((vals.expenses - vals.expensesCredit) * 100) / 100),
                withdrawals: Math.round(vals.withdrawals * 100) / 100,
                other: Math.round(vals.other * 100) / 100,
                net: Math.round(vals.net * 100) / 100,
            }));
    }, [data, viewMode]);

    // Calculate dynamic minimum width to allow horizontal scrolling.
    // Tighter per-bucket spacing keeps the scroll length manageable; Recharts
    // auto-hides overlapping axis labels so narrower spacing stays legible.
    const minChartWidth = Math.max(100, chartData.length * (viewMode === "day" ? 26 : viewMode === "week" ? 46 : 68));

    // Scroll to end when data changes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [chartData]);

    return (
        <Card ref={containerRef} className={cn("flex flex-col h-full min-h-[320px] sm:min-h-[280px] bg-bg-primary border-border/40 shadow-sm overflow-hidden", className)}>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2 gap-4">
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-emerald-500" />
                    <CardTitle className="text-xl">Evolución de transacciones</CardTitle>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center p-1 bg-muted/40 border border-border/40 rounded-xl">
                        <button
                            onClick={() => setChartType("bar")}
                            className={`p-1.5 rounded-lg transition-all ${chartType === "bar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            title="Gráfico de barras"
                        >
                            <BarChart3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setChartType("curve")}
                            className={`p-1.5 rounded-lg transition-all ${chartType === "curve" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            title="Gráfico de curvas"
                        >
                            <Activity className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="w-full sm:w-[150px]">
                        <Select value={viewMode} onValueChange={handleViewChange}>
                            <SelectTrigger className="w-full bg-muted/40 border-border/40 rounded-xl h-9 text-sm">
                                <SelectValue placeholder="Vista" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="day">Diario</SelectItem>
                                <SelectItem value="week">Semanal</SelectItem>
                                <SelectItem value="month">Mensual</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            {iconLegend && (
                <div className="px-4 sm:px-6 pb-2 pt-1">
                    <TypeLegend totals={totals} />
                </div>
            )}
            <CardContent className="flex-1 p-0 pb-4 flex flex-col min-h-0">
                {chartData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                        <RobotLoader text="Sin datos" showDots={false} size={64} />
                    </div>
                ) : (
                    <div
                        className="flex-1 w-full overflow-x-auto overflow-y-hidden custom-scrollbar min-h-0"
                        ref={scrollRef}
                        onPointerDown={handlePointerDown}
                    >
                        <div style={{ minWidth: minChartWidth, height: "100%" }} className="px-2">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === "bar" ? (
                                    <BarChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <pattern id="hatch-expenses-credit" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                                                <rect width="6" height="6" fill="hsl(0, 84%, 60%)" fillOpacity={0.35} />
                                                <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(0, 84%, 60%)" strokeWidth="2" />
                                            </pattern>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: 'currentColor' }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground font-medium"
                                            dy={10}
                                        />
                                        <YAxis
                                            domain={[0, 'auto']}
                                            tickFormatter={formatAxisCurrency}
                                            tick={{ fontSize: 11, fill: 'currentColor' }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground font-medium"
                                            width={58}
                                            dx={0}
                                        />
                                        <Tooltip
                                            active={tooltipActive}
                                            cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
                                            formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                            contentStyle={{
                                                backgroundColor: "var(--color-bg-secondary)",
                                                borderColor: "var(--color-border-base)",
                                                borderRadius: "12px",
                                                color: "var(--color-text-primary)",
                                                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                                                padding: "10px 14px",
                                                border: "1px solid rgba(255,255,255,0.05)"
                                            }}
                                            itemStyle={{ paddingTop: "4px", fontSize: "13px", fontWeight: 500 }}
                                            labelStyle={{ color: "var(--color-text-secondary)", marginBottom: "4px", fontSize: "12px", fontWeight: 500 }}
                                        />

                                        <Bar dataKey="income" name="Ingresos" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="expensesReal" name="Gastos" stackId="expenses" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="expensesCredit" name="Gastos (tarjeta, pendiente)" stackId="expenses" fill="url(#hatch-expenses-credit)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="withdrawals" name="Retiros" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="other" name="Transferencias" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                ) : (
                                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorWithdrawals" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: 'currentColor' }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground font-medium"
                                            dy={10}
                                        />
                                        <YAxis
                                            domain={[0, 'auto']}
                                            tickFormatter={formatAxisCurrency}
                                            tick={{ fontSize: 11, fill: 'currentColor' }}
                                            tickLine={false}
                                            axisLine={false}
                                            className="text-muted-foreground font-medium"
                                            width={58}
                                            dx={0}
                                        />
                                        <Tooltip
                                            active={tooltipActive}
                                            formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                                            contentStyle={{
                                                backgroundColor: "var(--color-bg-secondary)",
                                                borderColor: "var(--color-border-base)",
                                                borderRadius: "12px",
                                                color: "var(--color-text-primary)",
                                                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                                                padding: "10px 14px",
                                                border: "1px solid rgba(255,255,255,0.05)"
                                            }}
                                            itemStyle={{ paddingTop: "4px", fontSize: "13px", fontWeight: 500 }}
                                            labelStyle={{ color: "var(--color-text-secondary)", marginBottom: "4px", fontSize: "12px", fontWeight: 500 }}
                                        />

                                        <Area type="monotone" dataKey="income" name="Ingresos" stroke="hsl(142, 71%, 45%)" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="expenses" name="Gastos" stroke="hsl(0, 84%, 60%)" fillOpacity={1} fill="url(#colorExpenses)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="withdrawals" name="Retiros" stroke="#0284c7" fillOpacity={1} fill="url(#colorWithdrawals)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="other" name="Transferencias" stroke="#f59e0b" fillOpacity={1} fill="url(#colorOther)" strokeWidth={2} />
                                    </AreaChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
