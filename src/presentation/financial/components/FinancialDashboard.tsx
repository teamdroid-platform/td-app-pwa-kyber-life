"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedTrendChart } from "./UnifiedTrendChart";
import { CategoryPieChart } from "./CategoryPieChart";
import { InstitutionBarChart } from "./InstitutionBarChart";
import { useFinancialDashboard } from "../hooks/useFinancialDashboard";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PeriodFilter } from "@/components/ui/period-filter";
import { formatRangeLabel as formatDayRangeLabel } from "@/components/ui/range-calendar";
import { useFinancialRealtime } from "../hooks/useFinancialRealtime";
import { Filter, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { defaultHubCustomRange, STANDARD_PERIOD_PRESETS } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { BalanceHeroCard } from "./BalanceHeroCard";
import { BalanceModeSwitch, balanceValue } from "./BalanceModeSwitch";
import { QuickSummary } from "./QuickSummary";
import { KpiBreakdownModal } from "./KpiBreakdownModal";
import { buildKpiModalConfig, type KpiModalKind, type KpiBreakdownInputs } from "../lib/kpi-modal-config";
import { getBalanceSetAction } from "@/app/actions/balance";
import type { BalanceSet } from "@/application/services/balance-service";
import type { BalanceMode } from "@/domain/entities/balance";
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

const DASHBOARD_TABS = [
    ...STANDARD_PERIOD_PRESETS,
    { id: "custom" as const, label: "Personalizado" },
];

export function FinancialDashboard() {
    const [filterType, setFilterType] = useState<"all" | "today" | "week" | "month" | "custom">("custom");
    const [customStartDate, setCustomStartDate] = useState<string>(() => defaultHubCustomRange().start);
    const [customEndDate, setCustomEndDate] = useState<string>(() => defaultHubCustomRange().end);
    const [categoryLimit, setCategoryLimit] = useState<number>(5);
    const [institutionLimit, setInstitutionLimit] = useState<number>(5);
    // Mobile-only: filters collapsed by default (accordion), matching the
    // transactions list screen's "Filtros de Búsqueda" pattern.
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    // Tapping a Balance/Ingresos/Gastos tile opens a modal breaking down the
    // values behind that number.
    const [openKpiModal, setOpenKpiModal] = useState<KpiModalKind | null>(null);

    // Only the hand-typed dates are debounced: a date input emits every partial
    // value while typing (year 0002, 0202, …) and each one would refetch. The
    // preset tabs are deliberate clicks, so they still apply instantly.
    const debouncedStartDate = useDebouncedValue(customStartDate);
    const debouncedEndDate = useDebouncedValue(customEndDate);

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
                startDate: debouncedStartDate ? new Date(debouncedStartDate + "T00:00:00").toISOString() : undefined,
                endDate: debouncedEndDate ? new Date(debouncedEndDate + "T23:59:59").toISOString() : undefined
            };
        }

        return {};
    }, [filterType, debouncedStartDate, debouncedEndDate]);

    const { kpis: rawKpis, monthly, typeBreakdown, categoryBreakdown: rawCategoryBreakdown, institutionBreakdown: rawInstitutionBreakdown, dailyBreakdown: rawDailyBreakdown, loading, refetching, refresh } =
        useFinancialDashboard(startDate, endDate);

    // Los tres balances, cargados aparte de los KPIs: el selector los necesita
    // los tres a la vez, y no vuelve al servidor al cambiar de modo. El modo
    // arranca en `null` y se resuelve al de ajustes (`defaultMode`) en cuanto
    // llega la respuesta — a propósito no se recuerda entre cargas.
    const [balances, setBalances] = useState<BalanceSet | null>(null);
    const [balanceMode, setBalanceMode] = useState<BalanceMode | null>(null);

    useEffect(() => {
        let cancelled = false;
        getBalanceSetAction(startDate, endDate).then((result) => {
            if (cancelled || !result.success) return;
            setBalances(result.data);
            setBalanceMode((current) => current ?? result.data.defaultMode);
        });
        return () => { cancelled = true; };
    }, [startDate, endDate]);

    // Los KPIs y los tres desgloses muestran siempre el gasto real (sin
    // tarjeta): el balance con tarjeta ahora lo resuelve el selector de modo,
    // así que no hace falta un segundo control que exprese lo mismo.
    const kpis = useMemo(
        () => (rawKpis ? excludeCreditFromKpis(rawKpis) : rawKpis),
        [rawKpis],
    );

    // El balance activo del hero: el del modo elegido en cuanto los tres
    // balances llegaron; mientras tanto, el `netBalance` de siempre, para que
    // el número no parpadee a "0,00" en la primera carga.
    const activeBalance = balances && balanceMode
        ? balanceValue(balances, balanceMode)
        : (kpis?.netBalance ?? 0);

    const categoryBreakdown = useMemo(
        () => excludeCreditFromCategoryBreakdown(rawCategoryBreakdown),
        [rawCategoryBreakdown],
    );
    const institutionBreakdown = useMemo(
        () => excludeCreditFromInstitutionBreakdown(rawInstitutionBreakdown),
        [rawInstitutionBreakdown],
    );
    const dailyBreakdown = useMemo(
        () => excludeCreditFromDailyBreakdown(rawDailyBreakdown),
        [rawDailyBreakdown],
    );

    // El desglose de "balance" debe explicar el número que lo abrió, no el
    // netBalance crudo (que es PERIOD sin scope): PERIOD y PERIOD_WITH_CREDIT
    // comparten el mismo period.value de entrada y solo difieren en si el
    // consumo con tarjeta se resta aquí (includeCredit). TOTAL no tiene un
    // desglose de ingresos/gastos que mostrar — ver el onDetails del hero.
    const balanceBreakdownInputs: KpiBreakdownInputs | null = useMemo(
        () => (balances
            ? {
                totalIncome: balances.period.income,
                totalExpenses: balances.period.expenses,
                totalExpensesCredit: balances.withCredit.creditDeferred,
                totalTransfersFunding: balances.period.funding,
                totalTransfersSavings: balances.period.savings,
                netBalance: balances.period.value,
            }
            : null),
        [balances],
    );

    const kpiModalConfig = useMemo(() => {
        if (!openKpiModal) return null;
        if (openKpiModal === "balance") {
            // TOTAL no ofrece esta afinidad (ver onDetails más abajo); si el modo
            // cambia a TOTAL mientras el modal ya está abierto, se cierra solo.
            if (!balanceBreakdownInputs || balanceMode === "TOTAL" || !balanceMode) return null;
            return buildKpiModalConfig("balance", balanceBreakdownInputs, balanceMode === "PERIOD_WITH_CREDIT");
        }
        return rawKpis ? buildKpiModalConfig(openKpiModal, rawKpis) : null;
    }, [openKpiModal, rawKpis, balanceBreakdownInputs, balanceMode]);

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
                // Los tres balances también quedan obsoletos con la edición: sin
                // esto, el hero seguiría mostrando el número de antes del cambio.
                getBalanceSetAction(startDate, endDate).then((result) => {
                    if (result.success) setBalances(result.data);
                });
            },
        }),
        [refresh, startDate, endDate],
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
                        {/* Mobile: presets and the custom range in one control */}
                        <div className="w-full sm:hidden">
                            <PeriodFilter
                                value={filterType}
                                onChange={(v) => setFilterType(v as typeof filterType)}
                                presets={STANDARD_PERIOD_PRESETS}
                                customId="custom"
                                customStart={customStartDate}
                                customEnd={customEndDate}
                                onCustomRangeChange={(from, to) => {
                                    setCustomStartDate(from);
                                    setCustomEndDate(to);
                                    setFilterType("custom");
                                }}
                            />
                        </div>

                        {/* Desktop Filter (Tabs) — the custom tab shows the range itself */}
                        <div className="hidden sm:flex items-center p-1 bg-muted/40 border border-border/40 rounded-xl w-full">
                            {DASHBOARD_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setFilterType(tab.id)}
                                    className={`
                                        flex-1 relative px-4 py-1.5 text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap
                                        ${filterType === tab.id
                                            ? 'text-foreground bg-background shadow-sm ring-1 ring-border/50'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}
                                    `}
                                >
                                    {tab.id === "custom"
                                        ? (formatDayRangeLabel(customStartDate, customEndDate) ?? tab.label)
                                        : tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Desktop only: adjust the range once "custom" is active. */}
                        {filterType === "custom" && (
                            <div className="hidden sm:block w-full sm:w-auto sm:min-w-[260px] animate-in fade-in slide-in-from-top-1">
                                <DateRangePicker
                                    start={customStartDate}
                                    end={customEndDate}
                                    onChange={(from, to) => {
                                        setCustomStartDate(from);
                                        setCustomEndDate(to);
                                    }}
                                />
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
                    value={`${activeBalance >= 0 ? "+" : "-"}${formatCurrency(activeBalance)}`}
                    negative={activeBalance < 0}
                    // TOTAL ignora el rango, así que el gasto con tarjeta del
                    // periodo no es un dato relevante para él — ahí la pill
                    // muestra la deuda de tarjeta en pie (no se resta del
                    // total, solo se exhibe al lado). Los dos modos de periodo
                    // muestran el gasto con tarjeta del rango, tomado de
                    // `withCredit.creditDeferred` y no de los KPIs: es la misma
                    // cifra que el modal desglosa y la única que respeta las
                    // cuentas y tarjetas excluidas en la configuración. Los KPIs
                    // solo cubren el hueco mientras los balances cargan.
                    creditAmount={balanceMode === "TOTAL"
                        ? (balances?.total.creditDebt ?? 0)
                        : (balances?.withCredit.creditDeferred ?? rawKpis?.totalExpensesCredit ?? 0)}
                    creditKind={balanceMode === "TOTAL" ? "debt" : "spent"}
                    onDetails={balanceMode && balanceMode !== "TOTAL" ? () => setOpenKpiModal("balance") : undefined}
                    modeSwitch={balances && balanceMode ? (
                        <BalanceModeSwitch
                            balances={balances}
                            mode={balanceMode}
                            onModeChange={setBalanceMode}
                            rangeLabel={formatRangeLabel(filterType, startDate, endDate)}
                            size="hero"
                        />
                    ) : undefined}
                />
                <QuickSummary
                    kpis={kpis}
                    dailyBreakdown={dailyBreakdown}
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
