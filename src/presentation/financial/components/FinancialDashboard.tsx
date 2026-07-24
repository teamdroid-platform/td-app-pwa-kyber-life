"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedTrendChart } from "./UnifiedTrendChart";
import { CategoryPieChart } from "./CategoryPieChart";
import { InstitutionBarChart } from "./InstitutionBarChart";
import { useFinancialDashboard } from "../hooks/useFinancialDashboard";
import { useFinancialRealtime } from "../hooks/useFinancialRealtime";
import { Filter, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { defaultHubCustomRange } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { BalanceHeroCard } from "./BalanceHeroCard";
import { QuickSummary } from "./QuickSummary";
import { KpiBreakdownModal } from "./KpiBreakdownModal";
import { buildKpiModalConfig, type KpiModalKind } from "../lib/kpi-modal-config";
import {
    excludeCreditFromKpis,
    excludeCreditFromCategoryBreakdown,
    excludeCreditFromInstitutionBreakdown,
    excludeCreditFromDailyBreakdown,
} from "../lib/credit-toggle";
function formatCurrency(value: number): string {
    return `$${Math.abs(value).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Human-readable label of the active query range, shown under "Rango de búsqueda". */
function formatRangeLabel(filterType: string, startISO?: string, endISO?: string): string {
    if (filterType === "all" || !startISO || !endISO) return "Todo el tiempo";
    const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    const start = fmt(startISO);
    const end = fmt(endISO);
    return start === end ? start : `${start} – ${end}`;
}

export function FinancialDashboard() {
    const [filterType, setFilterType] = useState<"all" | "today" | "week" | "month" | "custom">("custom");
    const [customStartDate, setCustomStartDate] = useState<string>(() => defaultHubCustomRange().start);
    const [customEndDate, setCustomEndDate] = useState<string>(() => defaultHubCustomRange().end);
    const [categoryLimit, setCategoryLimit] = useState<number>(5);
    const [institutionLimit, setInstitutionLimit] = useState<number>(5);
    // Off by default: amounts and charts show only real (cash) spending until
    // the user opts into seeing credit-card-paid transactions too.
    const [showCredit, setShowCredit] = useState(false);
    // Mobile-only: filters collapsed by default (accordion), matching the
    // transactions list screen's "Filtros de Búsqueda" pattern.
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    // Tapping a Balance/Ingresos/Gastos tile opens a modal breaking down the
    // values behind that number.
    const [openKpiModal, setOpenKpiModal] = useState<KpiModalKind | null>(null);

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        if (filterType === "all") return { startDate: undefined, endDate: undefined };

        if (filterType === "today") {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            return { startDate: d.toISOString(), endDate: end.toISOString() };
        }

        if (filterType === "week") {
            const start = new Date(now);
            start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // start of week (Monday)
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            return { startDate: start.toISOString(), endDate: end.toISOString() };
        }

        if (filterType === "month") {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            return { startDate: start.toISOString(), endDate: end.toISOString() };
        }

        if (filterType === "custom") {
            return {
                startDate: customStartDate ? new Date(customStartDate + "T00:00:00").toISOString() : undefined,
                endDate: customEndDate ? new Date(customEndDate + "T23:59:59").toISOString() : undefined
            };
        }

        return {};
    }, [filterType, customStartDate, customEndDate]);

    const { kpis: rawKpis, monthly, typeBreakdown, categoryBreakdown: rawCategoryBreakdown, institutionBreakdown: rawInstitutionBreakdown, dailyBreakdown: rawDailyBreakdown, loading, refetching, refresh } =
        useFinancialDashboard(startDate, endDate);

    const kpis = useMemo(() => (rawKpis && !showCredit ? excludeCreditFromKpis(rawKpis) : rawKpis), [rawKpis, showCredit]);
    const categoryBreakdown = useMemo(
        () => (showCredit ? rawCategoryBreakdown : excludeCreditFromCategoryBreakdown(rawCategoryBreakdown)),
        [rawCategoryBreakdown, showCredit],
    );
    const institutionBreakdown = useMemo(
        () => (showCredit ? rawInstitutionBreakdown : excludeCreditFromInstitutionBreakdown(rawInstitutionBreakdown)),
        [rawInstitutionBreakdown, showCredit],
    );
    const dailyBreakdown = useMemo(
        () => (showCredit ? rawDailyBreakdown : excludeCreditFromDailyBreakdown(rawDailyBreakdown)),
        [rawDailyBreakdown, showCredit],
    );

    // Always shows the full detail (real + credit), regardless of the toggle.
    const kpiModalConfig = useMemo(
        () => (openKpiModal && rawKpis ? buildKpiModalConfig(openKpiModal, rawKpis) : null),
        [openKpiModal, rawKpis],
    );

    const totalCategoryExpenses = useMemo(() => {
        if (!categoryBreakdown) return 0;
        return categoryBreakdown.reduce((sum, item) => sum + item.total, 0);
    }, [categoryBreakdown]);

    const displayedCategoryBreakdown = useMemo(() => {
        if (!categoryBreakdown) return [];
        const filtered = categoryBreakdown.filter(c => c.categoryName && c.categoryName.toLowerCase() !== "sin categoría");
        return filtered.slice(0, categoryLimit);
    }, [categoryBreakdown, categoryLimit]);

    const displayedInstitutionBreakdown = useMemo(() => {
        if (!institutionBreakdown) return [];
        const filtered = institutionBreakdown.filter(i =>
            i.institutionName && i.institutionName.toLowerCase() !== "unknown"
        );
        return filtered.slice(0, institutionLimit);
    }, [institutionBreakdown, institutionLimit]);

    // ── Realtime: auto-refresh dashboard when transactions change ──
    const subscriptions = useMemo(
        () => [
            { table: "financial_transactions", event: "*" as const },
        ],
        [],
    );

    const callbacks = useMemo(
        () => ({
            onChange: () => {
                refresh();
            },
        }),
        [refresh],
    );

    const { isPollingFallback } = useFinancialRealtime({
        channelName: "dashboard-realtime",
        subscriptions,
        callbacks,
        onPollFallback: refresh,
    });

    if (loading && !kpis) {
        return (
            <div className="flex h-[50vh] w-full items-center justify-center">
                <RobotLoader text="Cargando resumen" />
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Filter Controls & Status */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 sm:pb-4">
                <div className="flex flex-col gap-3 flex-1 w-full">
                    {/* Mobile Accordion Toggle */}
                    <div
                        className={cn(
                            "sm:hidden flex items-center justify-between gap-3 py-3 px-4 rounded-2xl border border-border-base bg-bg-primary cursor-pointer transition-colors active:scale-[0.99]",
                            filtersExpanded ? "border-border" : "hover:bg-bg-hover",
                        )}
                        onClick={() => setFiltersExpanded((v) => !v)}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                <Filter className="w-4 h-4" />
                            </span>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[15px] font-medium text-foreground/90 leading-tight">
                                    Rango de búsqueda
                                </span>
                                <span className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                                    {formatRangeLabel(filterType, startDate, endDate)}
                                </span>
                            </div>
                        </div>
                        <ChevronDown className={cn("w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-300", filtersExpanded && "rotate-180")} />
                    </div>

                    {/* Filter content: collapsible on mobile, always visible on sm+ */}
                    <div className={cn(
                        "flex-col xl:flex-row items-start xl:items-center gap-4 w-full",
                        filtersExpanded ? "flex animate-in fade-in slide-in-from-top-4" : "hidden sm:flex",
                    )}>
                        {/* Mobile Filter (Select) */}
                        <div className="w-full sm:hidden">
                            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                                <SelectTrigger className="w-full bg-muted/40 border-border/40 rounded-xl h-10 font-medium">
                                    <SelectValue placeholder="Seleccionar período" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todo el tiempo</SelectItem>
                                    <SelectItem value="today">Hoy</SelectItem>
                                    <SelectItem value="week">Semana</SelectItem>
                                    <SelectItem value="month">Mes</SelectItem>
                                    <SelectItem value="custom">Personalizado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Desktop Filter (Tabs) */}
                        <div className="hidden sm:flex items-center p-1 bg-muted/40 border border-border/40 rounded-xl w-full">
                            {(
                                [
                                    { id: 'all', label: 'Todo el tiempo' },
                                    { id: 'today', label: 'Hoy' },
                                    { id: 'week', label: 'Semana' },
                                    { id: 'month', label: 'Mes' },
                                    { id: 'custom', label: 'Personalizado' }
                                ] as const
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setFilterType(tab.id as any)}
                                    className={`
                                        flex-1 relative px-4 py-1.5 text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap
                                        ${filterType === tab.id
                                            ? 'text-foreground bg-background shadow-sm ring-1 ring-border/50'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}
                                    `}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {filterType === "custom" && (
                            <div className="flex items-center gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center gap-2 w-full bg-muted/20 p-1 rounded-xl border border-border/40">
                                    <Input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="h-8 text-xs bg-background border-border/50 rounded-lg focus-visible:ring-1 focus-visible:ring-offset-0"
                                    />
                                    <span className="text-muted-foreground/50 text-xs font-medium">a</span>
                                    <Input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="h-8 text-xs bg-background border-border/50 rounded-lg focus-visible:ring-1 focus-visible:ring-offset-0"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>



            {refetching ? (
                <div className="flex h-[45vh] w-full items-center justify-center">
                    <RobotLoader text="Actualizando datos" />
                </div>
            ) : (
            <>
            {/* KPI section: hero balance panel + quick summary (all breakpoints) */}
            <div className="space-y-4">
                <BalanceHeroCard
                    value={`${(kpis?.netBalance ?? 0) >= 0 ? "+" : "-"}${formatCurrency(kpis?.netBalance ?? 0)}`}
                    negative={(kpis?.netBalance ?? 0) < 0}
                    creditSpent={rawKpis?.totalExpensesCredit ?? 0}
                    onDetails={rawKpis ? () => setOpenKpiModal("balance") : undefined}
                />
                <QuickSummary
                    kpis={kpis}
                    dailyBreakdown={dailyBreakdown}
                    showCredit={showCredit}
                    onToggleCredit={setShowCredit}
                    onOpenModal={rawKpis ? (kind) => setOpenKpiModal(kind) : undefined}
                />
            </div>

            {kpiModalConfig && (
                <KpiBreakdownModal
                    open={!!openKpiModal}
                    onOpenChange={(o) => !o && setOpenKpiModal(null)}
                    title={kpiModalConfig.title}
                    description={kpiModalConfig.description}
                    icon={kpiModalConfig.icon}
                    iconClassName={kpiModalConfig.iconClassName}
                    rows={kpiModalConfig.rows}
                    total={kpiModalConfig.total}
                    note={kpiModalConfig.note}
                />
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="lg:col-span-2">
                    <UnifiedTrendChart data={dailyBreakdown} />
                </div>

                <Card className="flex flex-col bg-bg-primary">
                    <CardHeader className="flex flex-row items-start justify-between pb-2 gap-4">
                        <div>
                            <CardTitle>Por categoría de gasto</CardTitle>
                            <CardDescription>Distribución detallada de tus gastos</CardDescription>
                        </div>
                        <Select value={categoryLimit.toString()} onValueChange={(v) => setCategoryLimit(Number(v))}>
                            <SelectTrigger className="w-[90px] h-8 text-xs bg-muted/40 border-border/40 rounded-lg">
                                <SelectValue placeholder="Top" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">Top 5</SelectItem>
                                <SelectItem value="10">Top 10</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <CategoryPieChart data={displayedCategoryBreakdown} grandTotal={totalCategoryExpenses} />
                    </CardContent>
                </Card>

                <Card className="flex flex-col bg-bg-primary">
                    <CardHeader className="flex flex-row items-start justify-between pb-2 gap-4">
                        <div>
                            <CardTitle>Por institución</CardTitle>
                            <CardDescription>Volumen total movido por banco o institución</CardDescription>
                        </div>
                        <Select value={institutionLimit.toString()} onValueChange={(v) => setInstitutionLimit(Number(v))}>
                            <SelectTrigger className="w-[90px] h-8 text-xs bg-muted/40 border-border/40 rounded-lg">
                                <SelectValue placeholder="Top" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">Top 5</SelectItem>
                                <SelectItem value="10">Top 10</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <InstitutionBarChart data={displayedInstitutionBreakdown} />
                    </CardContent>
                </Card>
            </div>
            </>
            )}
        </div>
    );
}
