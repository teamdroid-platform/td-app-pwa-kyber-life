"use client";

import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar, LabelList } from 'recharts';
import { ChevronDown, BarChart2, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, Scale, PieChart as PieChartIcon, BarChart3 as BarChartIcon, type LucideIcon } from "lucide-react";
import type { FinancialTransaction, FinancialTransactionType } from "@/domain/entities/financial";
import { computeNetBalance, sumCreditExpenses, DASHBOARD_ACTIVE_STATUSES } from "@/domain/services/financial-balance";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { MobileCarousel } from "@/presentation/components/dashboard/MobileCarousel";
import { formatAxisCurrency } from "@/lib/date-bucketing";
import { CreditToggle } from "./CreditToggle";
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";

// ─── Type visual metadata ────────────────────────────────────

interface TypeMeta {
    sign: "positive" | "negative" | "neutral" | "withdrawal";
}

const TYPE_META: Record<FinancialTransactionType, TypeMeta> = {
    INCOME: { sign: "positive" },
    DEPOSIT: { sign: "positive" },
    REFUND: { sign: "positive" },
    EXPENSE: { sign: "negative" },
    PAYMENT: { sign: "negative" },
    WITHDRAWAL: { sign: "withdrawal" },
    FEE: { sign: "negative" },
    TAX: { sign: "negative" },
    TRANSFER: { sign: "neutral" },
    OTHER: { sign: "neutral" },
};

// ─── Helpers ─────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat("es-EC", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

// ─── Component ───────────────────────────────────────────────

interface TransactionSummaryProps {
    transactions: FinancialTransaction[];
}

type ViewMode = 'day' | 'week' | 'month';

export function TransactionSummary({ transactions }: TransactionSummaryProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDesktopExpanded, setIsDesktopExpanded] = useState(false);
    
    // Default null avoids hydration mismatch; we determine it on mount
    const [userChartPreference, setUserChartPreference] = useState<"donut" | "bar" | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    // Off by default: amounts and charts show only real (cash) spending until
    // the user opts into seeing credit-card-paid transactions too.
    const [showCredit, setShowCredit] = useState(false);
    // On touch there is no "mouse leave" to close the tooltip, so make it dismissable.
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss();

    // Only "active" transactions are real money. The list itself shows everything
    // that isn't deleted or archived — pending scanner detections, rejected and
    // duplicate rows included — but those must never move the totals, or this
    // summary drifts from the financial overview, which counts exactly these
    // three statuses.
    const countableTransactions = useMemo(
        () => transactions.filter((t) => (DASHBOARD_ACTIVE_STATUSES as readonly string[]).includes(t.status)),
        [transactions],
    );

    const effectiveTransactions = useMemo(
        () => (showCredit ? countableTransactions : countableTransactions.filter((t) => !t.paidWithCredit)),
        [countableTransactions, showCredit],
    );

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const activeChartType = userChartPreference || "bar";

    const {
        balance,
        primaryCurrency,
        chartData,
        totalIncome,
        totalExpense,
        totalOther,
        totalWithdrawal
    } = useMemo(() => {
        if (effectiveTransactions.length === 0) {
            return {
                balance: 0,
                primaryCurrency: "USD",
                chartData: [],
                totalIncome: 0,
                totalExpense: 0,
                totalOther: 0,
                totalWithdrawal: 0
            };
        }

        // Dominant currency
        const currencyCounts: Record<string, number> = {};
        effectiveTransactions.forEach((t) => {
            currencyCounts[t.currency] = (currencyCounts[t.currency] ?? 0) + 1;
        });
        const dominant = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

        let incomeSum = 0;
        let expenseSum = 0;
        let otherSum = 0;
        let withdrawalSum = 0;

        const chartDataMap: Record<string, { date: string, income: number, expense: number, other: number, withdrawal: number, timestamp: number }> = {};

        effectiveTransactions.forEach((t) => {
            const d = new Date(t.date);
            let dateStr = "";
            let timestamp = d.getTime();

            if (viewMode === 'day') {
                dateStr = d.toLocaleDateString("es-EC", { day: '2-digit', month: 'short' });
            } else if (viewMode === 'week') {
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const startOfWeek = new Date(d);
                startOfWeek.setDate(diff);
                dateStr = startOfWeek.toLocaleDateString("es-EC", { day: '2-digit', month: 'short' });
                timestamp = startOfWeek.getTime();
            } else if (viewMode === 'month') {
                dateStr = d.toLocaleDateString("es-EC", { month: 'short' });
                dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
                const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
                timestamp = startOfMonth.getTime();
            }

            if (!chartDataMap[dateStr]) {
                chartDataMap[dateStr] = { date: dateStr, income: 0, expense: 0, other: 0, withdrawal: 0, timestamp };
            }

            const { sign } = TYPE_META[t.type];
            if (sign === "positive") {
                incomeSum += t.amount;
                chartDataMap[dateStr].income += t.amount;
            } else if (sign === "negative") {
                expenseSum += t.amount;
                chartDataMap[dateStr].expense += t.amount;
            } else if (sign === "withdrawal") {
                withdrawalSum += t.amount;
                chartDataMap[dateStr].withdrawal += t.amount;
            } else {
                otherSum += t.amount;
                chartDataMap[dateStr].other += t.amount;
            }
        });

        // Ordenar cronológicamente para el gráfico
        const chartData = Object.values(chartDataMap).sort((a, b) => a.timestamp - b.timestamp);

        // Balance defers credit-card-paid expenses by default. With the "Incluir
        // TC" toggle ON, the user wants those expenses to count against the
        // balance too, so subtract them; OFF keeps them deferred (excluded).
        const finalBalance = Math.round(
            (computeNetBalance(effectiveTransactions) - (showCredit ? sumCreditExpenses(countableTransactions) : 0)) * 100,
        ) / 100;

        return {
            balance: finalBalance,
            primaryCurrency: dominant,
            chartData,
            totalIncome: incomeSum,
            totalExpense: expenseSum,
            totalOther: otherSum,
            totalWithdrawal: withdrawalSum
        };
    }, [effectiveTransactions, viewMode, countableTransactions, showCredit]);

    if (transactions.length === 0) return null;

    const totalTransactionsSum = totalIncome + totalExpense + totalOther + totalWithdrawal;

    const pieData = [
        { name: "Ingresos", value: totalIncome, fill: "#10b981", icon: TrendingUp },
        { name: "Gastos", value: totalExpense, fill: "#f43f5e", icon: TrendingDown },
        { name: "Transferencias", value: totalOther, fill: "#f59e0b", icon: ArrowRightLeft },
        { name: "Retiros", value: totalWithdrawal, fill: "#0284c7", icon: Wallet },
    ].filter(d => d.value > 0).map(d => ({
        ...d,
        percentage: totalTransactionsSum > 0 ? (d.value / totalTransactionsSum) * 100 : 0
    }));

    const balanceStr = (balance > 0 ? "+" : balance < 0 ? "-" : "") + formatCurrency(Math.abs(balance), primaryCurrency);
    // Adaptar el radio interno dinámicamente según el tamaño del texto para que los bordes sean lo más gruesos posibles sin solaparse
    const innerRadiusPercent = Math.min(85, Math.max(50, 35 + (balanceStr.length * 3.5)));
    const dynamicInnerRadius = `${innerRadiusPercent}%`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
        if (percent < 0.05) return null; // No mostrar etiquetas en secciones muy pequeñas
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
        const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

        return (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold drop-shadow-md">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderCustomXAxisTick = ({ x, y, payload }: any) => {
        const item = pieData.find(d => d.name === payload.value);
        if (!item) return null;
        const Icon = item.icon;
        return (
            <g transform={`translate(${x},${y})`}>
                <foreignObject x={-12} y={5} width={24} height={24}>
                    <Icon className="w-4 h-4 mx-auto" style={{ color: item.fill }} />
                </foreignObject>
            </g>
        );
    };

    // Balance accent color by sign; used for its own chip.
    const balanceColor = balance > 0 ? "#10b981" : balance < 0 ? "#f43f5e" : "#64748b";

    // A single tinted "box" (chip): icon + uppercase label + bold amount.
    const renderChip = (key: string, Icon: LucideIcon, label: string, value: string, color: string) => (
        <div
            key={key}
            className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 shrink-0"
            style={{ backgroundColor: `${color}14`, borderColor: `${color}33` }}
        >
            <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}26`, color }}
            >
                <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {label}
                </span>
                <span className="text-xs font-bold tracking-tight text-foreground/90 tabular-nums whitespace-nowrap">
                    {value}
                </span>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-3" ref={containerRef} onPointerDown={handlePointerDown}>
            {/* ═══════════════ MOBILE ACCORDION TOGGLE ═══════════════ */}
            <div
                className={cn(
                    "sm:hidden relative flex items-center justify-between py-3 px-4 rounded-[1.25rem] border border-border/50 dark:border-white/10 bg-gradient-to-b from-black/[0.02] dark:from-white/[0.04] to-transparent shadow-lg shadow-black/5 dark:shadow-black/20 cursor-pointer transition-all active:scale-[0.98]",
                    isExpanded ? "bg-black/[0.02] dark:bg-white/[0.02] border-border dark:border-white/15" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 dark:via-white/20 to-transparent rounded-t-[1.25rem]" aria-hidden="true" />
                <div className="flex items-center gap-3 relative z-10">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-accent-primary/20 to-accent-primary/5 border border-accent-primary/20 text-accent-primary shadow-inner">
                        <BarChart2 className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex flex-col justify-center gap-1.5">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-bold tracking-tight leading-none text-foreground/90">Balance</span>
                            <span className={cn(
                                "text-lg font-bold tracking-tight leading-none",
                                balance > 0 ? "text-emerald-600 dark:text-emerald-400" : balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground/90"
                            )}>
                                {balanceStr}
                            </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium leading-none uppercase tracking-wider">
                            Resumen Visual <span className="opacity-60 normal-case tracking-normal ml-1">({transactions.length} reg)</span>
                        </p>
                    </div>
                </div>
                <div className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 border border-border/50 dark:border-white/10 shadow-sm">
                    <ChevronDown className={cn("w-4 h-4 text-foreground/70 transition-transform duration-300", isExpanded && "rotate-180")} />
                </div>
            </div>

            {/* ═══════════════ DESKTOP ACCORDION TRIGGER ═══════════════ */}
            <div
                className={cn(
                    "hidden sm:block relative py-4 px-5 rounded-2xl border cursor-pointer transition-all group",
                    isDesktopExpanded
                        ? "border-white/15 bg-background/60 shadow-md"
                        : "border-border/50 dark:border-white/10 bg-gradient-to-b from-black/[0.02] dark:from-white/[0.04] to-transparent shadow-lg shadow-black/5 dark:shadow-black/20 hover:border-white/15 hover:bg-background/40"
                )}
                onClick={() => setIsDesktopExpanded(!isDesktopExpanded)}
                role="button"
                aria-expanded={isDesktopExpanded}
            >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 dark:via-white/20 to-transparent rounded-t-2xl" aria-hidden="true" />
                <div className="relative z-10 flex items-center gap-4">
                    {/* Identity */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-accent-primary/20 to-accent-primary/5 border border-accent-primary/20 text-accent-primary">
                            <BarChart2 className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-base font-bold tracking-tight text-foreground/90 leading-tight whitespace-nowrap">Resumen Visual</span>
                            <span className="text-xs text-muted-foreground font-medium leading-tight whitespace-nowrap">{transactions.length} transacciones</span>
                        </div>
                    </div>
                    {/* Boxes: balance + per-type, right-aligned on the same row */}
                    <div className="flex flex-1 items-center justify-end gap-2 flex-wrap min-w-0">
                        {renderChip("balance", Scale, "Balance", balanceStr, balanceColor)}
                        {pieData.map((item) => renderChip(item.name, item.icon, item.name, formatCurrency(item.value, primaryCurrency), item.fill))}
                    </div>
                    {/* Chevron */}
                    <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-black/5 dark:bg-white/5 border border-border/50 dark:border-white/10 shadow-sm transition-colors group-hover:bg-black/10 dark:group-hover:bg-white/10">
                        <ChevronDown className={cn("w-4 h-4 text-foreground/70 transition-transform duration-300", isDesktopExpanded && "rotate-180")} />
                    </div>
                </div>
            </div>

            {/* ═══════════════ MOBILE CONTENT (unchanged behavior) ═══════════════ */}
            <div className={cn(
                "sm:hidden relative overflow-hidden rounded-2xl border border-white/5 bg-background/40 backdrop-blur-xl shadow-sm p-5 flex-col transition-all duration-300",
                isExpanded ? "flex animate-in fade-in slide-in-from-top-4" : "hidden"
            )}>
                {/* Charts row */}
                <MobileCarousel className="order-2 w-full">

                    {/* ── LEFT SIDE: BALANCE NETO (DONUT CHART OR BAR CHART) ── */}
                    <div className="relative z-10 flex flex-col items-center justify-center lg:w-auto lg:shrink-0 lg:border-r lg:border-white/5 lg:pr-8 w-full sm:w-auto">

                        {/* Credit toggle + chart type */}
                        <div className="flex items-center justify-between gap-2 w-full mb-4">
                            <CreditToggle checked={showCredit} onChange={setShowCredit} />
                            <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-full shrink-0">
                                <button
                                    onClick={() => setUserChartPreference('donut')}
                                    className={cn(
                                        "p-1.5 rounded-full transition-all text-muted-foreground hover:text-foreground",
                                        activeChartType === 'donut' && "bg-foreground text-background shadow-sm hover:text-background"
                                    )}
                                    aria-label="Ver gráfico de dona"
                                >
                                    <PieChartIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setUserChartPreference('bar')}
                                    className={cn(
                                        "p-1.5 rounded-full transition-all text-muted-foreground hover:text-foreground",
                                        activeChartType === 'bar' && "bg-foreground text-background shadow-sm hover:text-background"
                                    )}
                                    aria-label="Ver gráfico de barras"
                                >
                                    <BarChartIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        <div className={cn("relative flex-shrink-0 mx-auto", activeChartType === 'donut' ? "w-44 h-44" : "w-full h-44 sm:w-56")}>
                            <ResponsiveContainer width="100%" height="100%">
                                {activeChartType === 'donut' ? (
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={dynamicInnerRadius}
                                            outerRadius="100%"
                                            paddingAngle={2}
                                            dataKey="value"
                                            stroke="none"
                                            labelLine={false}
                                            label={renderCustomizedLabel}
                                            animationDuration={400}
                                            animationBegin={0}
                                            animationEasing="ease-out"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            active={tooltipActive}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-bg-primary border border-border/50 rounded-lg shadow-lg p-2 text-xs flex items-center gap-2 z-50">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill }} />
                                                            <span className="text-muted-foreground">{payload[0].name}:</span>
                                                            <span className="font-semibold text-foreground">
                                                                {formatCurrency(payload[0].value as number, primaryCurrency)}
                                                            </span>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                    </PieChart>
                                ) : (
                                    <BarChart data={pieData} margin={{ top: 20, right: 10, left: 10, bottom: 6 }} barCategoryGap="20%">
                                        <XAxis dataKey="name" tick={renderCustomXAxisTick} axisLine={false} tickLine={false} height={36} interval={0} />
                                        <YAxis type="number" hide domain={[0, 'dataMax + 10']} />
                                        <Tooltip
                                            active={tooltipActive}
                                            cursor={{ fill: 'transparent' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    return (
                                                        <div className="bg-bg-primary border border-border/50 rounded-lg shadow-lg p-2 text-xs flex flex-col gap-1 z-50">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.fill }} />
                                                                <span className="text-muted-foreground">{data.name}:</span>
                                                            </div>
                                                            <span className="font-semibold text-foreground">
                                                                {formatCurrency(data.value as number, primaryCurrency)} ({data.percentage.toFixed(1)}%)
                                                            </span>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Bar dataKey="percentage" radius={[4, 4, 0, 0]} maxBarSize={64}>
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                            <LabelList dataKey="percentage" position="top" formatter={(val: any) => `${Number(val || 0).toFixed(0)}%`} className="text-[10px] font-bold fill-foreground" />
                                        </Bar>
                                    </BarChart>
                                )}
                            </ResponsiveContainer>

                            {/* Centered text only for donut chart */}
                            {activeChartType === 'donut' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1 px-2">
                                    <span className={cn(
                                        "text-base sm:text-lg font-bold tracking-tighter drop-shadow-sm leading-none mb-1 whitespace-nowrap",
                                        balance > 0 ? "bg-gradient-to-br from-emerald-400 to-emerald-600 bg-clip-text text-transparent" : (balance < 0 ? "bg-gradient-to-br from-red-400 to-red-600 bg-clip-text text-transparent" : "text-muted-foreground")
                                    )}>
                                        {balanceStr}
                                    </span>
                                    <span className="text-[10px] font-medium text-muted-foreground/80">
                                        {effectiveTransactions.length} trx
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT SIDE: BREAKDOWN CHART ── */}
                    <div className="relative z-10 flex flex-col w-full flex-1 sm:h-44 lg:h-44 justify-between">
                        {/* Header (Credit toggle + view Select) */}
                        <div className="flex justify-between items-start sm:items-center mb-4 sm:mb-2 gap-2">
                            <CreditToggle checked={showCredit} onChange={setShowCredit} />
                            <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                                <SelectTrigger className="h-7 w-[110px] text-xs bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                                    <SelectValue placeholder="Vista" />
                                </SelectTrigger>
                                <SelectContent className="bg-background/95 backdrop-blur-xl border-white/10">
                                    <SelectItem value="day" className="text-xs">Por día</SelectItem>
                                    <SelectItem value="week" className="text-xs">Por semana</SelectItem>
                                    <SelectItem value="month" className="text-xs">Por mes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Chart Area */}
                        <div className="w-full -ml-4 h-[180px] sm:h-auto sm:flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorWithdrawal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <YAxis
                                        tickFormatter={formatAxisCurrency}
                                        width={52}
                                        tick={{ fontSize: 10, fill: '#878787' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#878787', fontSize: 10 }}
                                        dy={10}
                                        minTickGap={20}
                                    />
                                    <Tooltip
                                        active={tooltipActive}
                                        content={({ active, payload, label }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-bg-primary border border-border/50 rounded-lg shadow-lg p-3 text-xs flex flex-col gap-1 z-50">
                                                        <span className="font-medium text-foreground mb-1">{label}</span>
                                                        {totalIncome > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                <span className="text-muted-foreground">Ingresos:</span>
                                                                <span className="font-semibold text-foreground">
                                                                    {formatCurrency((payload.find(p => p.dataKey === 'income')?.value as number) || 0, primaryCurrency)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {totalExpense > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                                <span className="text-muted-foreground">Gastos:</span>
                                                                <span className="font-semibold text-foreground">
                                                                    {formatCurrency((payload.find(p => p.dataKey === 'expense')?.value as number) || 0, primaryCurrency)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {totalWithdrawal > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0284c7" }} />
                                                                <span className="text-muted-foreground">Retiros:</span>
                                                                <span className="font-semibold text-foreground">
                                                                    {formatCurrency((payload.find(p => p.dataKey === 'withdrawal')?.value as number) || 0, primaryCurrency)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {totalOther > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                                <span className="text-muted-foreground">Transferencias:</span>
                                                                <span className="font-semibold text-foreground">
                                                                    {formatCurrency((payload.find(p => p.dataKey === 'other')?.value as number) || 0, primaryCurrency)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    {totalIncome > 0 && <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />}
                                    {totalExpense > 0 && <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />}
                                    {totalWithdrawal > 0 && <Area type="monotone" dataKey="withdrawal" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#colorWithdrawal)" />}
                                    {totalOther > 0 && <Area type="monotone" dataKey="other" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorOther)" />}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </MobileCarousel>

                {/* ── Mobile per-type totals ── */}
                {pieData.length > 0 && (
                    <div className="relative z-10 mb-5 pb-4 border-b border-white/5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2.5 order-1 w-full">
                        {pieData.map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.name} className="flex items-center gap-1 min-w-0 shrink-0">
                                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.fill }} />
                                    <span className="text-[11px] font-bold tracking-tight text-foreground/90 tabular-nums whitespace-nowrap">
                                        {formatCurrency(item.value, primaryCurrency)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>

            {/* ═══════════════ DESKTOP COLLAPSIBLE CONTENT ═══════════════ */}
            <div className={cn(
                "hidden sm:block relative overflow-hidden transition-all duration-300",
                isDesktopExpanded
                    ? "max-h-[600px] opacity-100 animate-in fade-in slide-in-from-top-2"
                    : "max-h-0 opacity-0 pointer-events-none"
            )}>
                <div className="rounded-2xl border border-white/5 bg-background/40 backdrop-blur-xl shadow-sm p-6">
                    <div className="flex w-full flex-row gap-6 items-stretch">

                        {/* ── LEFT: BALANCE NETO (DONUT OR BAR CHART) ── */}
                        <div className="relative z-10 flex flex-col items-center justify-center w-1/2 border-r border-white/5 pr-6">
                            {/* Credit toggle + chart type */}
                            <div className="flex items-center justify-between gap-2 w-full mb-4">
                                <CreditToggle checked={showCredit} onChange={setShowCredit} />
                                <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-full shrink-0">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setUserChartPreference('donut'); }}
                                        className={cn(
                                            "p-1.5 rounded-full transition-all text-muted-foreground hover:text-foreground",
                                            activeChartType === 'donut' && "bg-foreground text-background shadow-sm hover:text-background"
                                        )}
                                        aria-label="Ver gráfico de dona"
                                    >
                                        <PieChartIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setUserChartPreference('bar'); }}
                                        className={cn(
                                            "p-1.5 rounded-full transition-all text-muted-foreground hover:text-foreground",
                                            activeChartType === 'bar' && "bg-foreground text-background shadow-sm hover:text-background"
                                        )}
                                        aria-label="Ver gráfico de barras"
                                    >
                                        <BarChartIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className={cn("relative flex-shrink-0 mx-auto", activeChartType === 'donut' ? "w-52 h-52" : "w-full h-52")}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {activeChartType === 'donut' ? (
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={dynamicInnerRadius}
                                                outerRadius="100%"
                                                paddingAngle={2}
                                                dataKey="value"
                                                stroke="none"
                                                labelLine={false}
                                                label={renderCustomizedLabel}
                                                animationDuration={400}
                                                animationBegin={0}
                                                animationEasing="ease-out"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`dcell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                active={tooltipActive}
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        return (
                                                            <div className="bg-bg-primary border border-border/50 rounded-lg shadow-lg p-2 text-xs flex items-center gap-2 z-50">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill }} />
                                                                <span className="text-muted-foreground">{payload[0].name}:</span>
                                                                <span className="font-semibold text-foreground">
                                                                    {formatCurrency(payload[0].value as number, primaryCurrency)}
                                                                </span>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                        </PieChart>
                                    ) : (
                                        <BarChart data={pieData} margin={{ top: 20, right: 10, left: 10, bottom: 6 }} barCategoryGap="20%">
                                            <XAxis dataKey="name" tick={renderCustomXAxisTick} axisLine={false} tickLine={false} height={36} interval={0} />
                                            <YAxis type="number" hide domain={[0, 'dataMax + 10']} />
                                            <Tooltip
                                                active={tooltipActive}
                                                cursor={{ fill: 'transparent' }}
                                                content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                        const data = payload[0].payload;
                                                        return (
                                                            <div className="bg-bg-primary border border-border/50 rounded-lg shadow-lg p-2 text-xs flex flex-col gap-1 z-50">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.fill }} />
                                                                    <span className="text-muted-foreground">{data.name}:</span>
                                                                </div>
                                                                <span className="font-semibold text-foreground">
                                                                    {formatCurrency(data.value as number, primaryCurrency)} ({data.percentage.toFixed(1)}%)
                                                                </span>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Bar dataKey="percentage" radius={[4, 4, 0, 0]} maxBarSize={64}>
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`dcell-bar-${index}`} fill={entry.fill} />
                                                ))}
                                                <LabelList dataKey="percentage" position="top" formatter={(val: any) => `${Number(val || 0).toFixed(0)}%`} className="text-[10px] font-bold fill-foreground" />
                                            </Bar>
                                        </BarChart>
                                    )}
                                </ResponsiveContainer>

                                {/* Centered text only for donut */}
                                {activeChartType === 'donut' && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1 px-2">
                                        <span className={cn(
                                            "text-lg font-bold tracking-tighter drop-shadow-sm leading-none mb-1 whitespace-nowrap",
                                            balance > 0 ? "bg-gradient-to-br from-emerald-400 to-emerald-600 bg-clip-text text-transparent" : (balance < 0 ? "bg-gradient-to-br from-red-400 to-red-600 bg-clip-text text-transparent" : "text-muted-foreground")
                                        )}>
                                            {balanceStr}
                                        </span>
                                        <span className="text-[10px] font-medium text-muted-foreground/80">
                                            {effectiveTransactions.length} trx
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── RIGHT: BREAKDOWN CHART ── */}
                        <div className="relative z-10 flex flex-col w-1/2 justify-between">
                            <div className="flex justify-between items-center mb-2 gap-2">
                                <CreditToggle checked={showCredit} onChange={setShowCredit} />
                                <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                                    <SelectTrigger className="h-7 w-[110px] text-xs bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                                        <SelectValue placeholder="Vista" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background/95 backdrop-blur-xl border-white/10">
                                        <SelectItem value="day" className="text-xs">Por día</SelectItem>
                                        <SelectItem value="week" className="text-xs">Por semana</SelectItem>
                                        <SelectItem value="month" className="text-xs">Por mes</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="w-full -ml-4 flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="dColorIncome" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="dColorExpense" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="dColorOther" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="dColorWithdrawal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <YAxis
                                            tickFormatter={formatAxisCurrency}
                                            width={52}
                                            tick={{ fontSize: 10, fill: '#878787' }}
                                            axisLine={false}
                                            tickLine={false}
                                            domain={[0, 'auto']}
                                        />
                                        <XAxis
                                            dataKey="date"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#878787', fontSize: 10 }}
                                            dy={10}
                                            minTickGap={20}
                                        />
                                        <Tooltip
                                            active={tooltipActive}
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-bg-primary border border-border/50 rounded-lg shadow-lg p-3 text-xs flex flex-col gap-1 z-50">
                                                            <span className="font-medium text-foreground mb-1">{label}</span>
                                                            {totalIncome > 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                                    <span className="text-muted-foreground">Ingresos:</span>
                                                                    <span className="font-semibold text-foreground">
                                                                        {formatCurrency((payload.find(p => p.dataKey === 'income')?.value as number) || 0, primaryCurrency)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {totalExpense > 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                                    <span className="text-muted-foreground">Gastos:</span>
                                                                    <span className="font-semibold text-foreground">
                                                                        {formatCurrency((payload.find(p => p.dataKey === 'expense')?.value as number) || 0, primaryCurrency)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {totalWithdrawal > 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0284c7" }} />
                                                                    <span className="text-muted-foreground">Retiros:</span>
                                                                    <span className="font-semibold text-foreground">
                                                                        {formatCurrency((payload.find(p => p.dataKey === 'withdrawal')?.value as number) || 0, primaryCurrency)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {totalOther > 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                                    <span className="text-muted-foreground">Transferencias:</span>
                                                                    <span className="font-semibold text-foreground">
                                                                        {formatCurrency((payload.find(p => p.dataKey === 'other')?.value as number) || 0, primaryCurrency)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        {totalIncome > 0 && <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#dColorIncome)" />}
                                        {totalExpense > 0 && <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#dColorExpense)" />}
                                        {totalWithdrawal > 0 && <Area type="monotone" dataKey="withdrawal" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#dColorWithdrawal)" />}
                                        {totalOther > 0 && <Area type="monotone" dataKey="other" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#dColorOther)" />}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

        </div>
    );
}
