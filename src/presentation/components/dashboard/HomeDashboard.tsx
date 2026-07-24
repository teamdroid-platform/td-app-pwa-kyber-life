"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
    Wallet,
    ShoppingCart,
    Receipt,
    Plus,
    Layers,
    Package,
    ArrowDownCircle,
    ArrowUpCircle,
    CalendarClock,
    TrendingUp,
    CreditCard,
    CircleDollarSign,
    ScanSearch,
    ClipboardList,
    ChevronDown,
    SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { computeDateRange, defaultHubCustomRange, type RangeFilterType } from "@/lib/date-range";
import { DateRangeFilter, HUB_PRESETS } from "@/presentation/components/charts/DateRangeFilter";
import { RankBarChart } from "@/presentation/components/charts/RankBarChart";
import { SpendTrendChart } from "@/presentation/components/charts/SpendTrendChart";
import { UnifiedTrendChart } from "@/presentation/financial/components/UnifiedTrendChart";
import { useFinancialOverview, useMarketOverview } from "./hooks/useHomeDashboard";
import { StatTile } from "./stat-tile";
import { SparkStatCard } from "./spark-stat-card";
import { FrequentProductsCard } from "./frequent-products-card";
import { DashboardLoading } from "./DashboardLoading";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { MobileCarousel } from "./MobileCarousel";
import { KpiBreakdownModal } from "@/presentation/financial/components/KpiBreakdownModal";
import { CreditToggle } from "@/presentation/financial/components/CreditToggle";
import { excludeCreditFromKpis, excludeCreditFromCategoryBreakdown, excludeCreditFromDailyBreakdown } from "@/presentation/financial/lib/credit-toggle";
import { buildKpiModalConfig, type KpiModalKind } from "@/presentation/financial/lib/kpi-modal-config";

/**
 * Shared vertical size for every dashboard chart. Kept identical across both
 * columns and both chart rows so the sections stay horizontally aligned and the
 * same size on every screen. Tall enough that trend/bar charts aren't cramped;
 * the mobile carousel shows one chart at a time so the height applies there too.
 */
const CHART_HEIGHT = "h-[460px] sm:h-[390px] lg:h-[400px]";

function ChartSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn(CHART_HEIGHT, "rounded-2xl border border-border-base bg-bg-secondary flex items-center justify-center", className)}>
            <RobotLoader size={64} text="Actualizando datos" />
        </div>
    );
}

function TilesSkeleton() {
    return (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((i) => (
                <div key={i} className="h-[76px] sm:h-[82px] rounded-2xl border border-border-base bg-bg-secondary animate-pulse" />
            ))}
        </div>
    );
}

const currency = (n: number) =>
    `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface ModuleColumnProps {
    icon: ReactNode;
    iconWrapClassName: string;
    title: string;
    subtitle: string;
    filter: ReactNode;
    filtersOpen: boolean;
    children: ReactNode;
}

/** One dashboard column (Finanzas / Supermercado): header, own filter, then a vertical stack of blocks. */
function ModuleColumn({ icon, iconWrapClassName, title, subtitle, filter, filtersOpen, children }: ModuleColumnProps) {
    return (
        <section className="flex flex-col gap-4 sm:gap-5">
            <div className="hidden xl:flex items-center gap-2.5">
                <span className={cn("flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg", iconWrapClassName)}>
                    {icon}
                </span>
                <div className="min-w-0 flex flex-col justify-center">
                    <h2 className="text-base font-bold uppercase tracking-wide text-text-primary sm:text-lg leading-none">{title}</h2>
                    <p className="hidden sm:block truncate text-xs text-text-tertiary mt-1">{subtitle}</p>
                </div>
            </div>
            <div className={cn(
                "py-1 sm:py-2",
                filtersOpen ? "block animate-in fade-in slide-in-from-top-2" : "hidden sm:block",
            )}>
                {filter}
            </div>
            <div className="flex flex-col gap-4 sm:gap-6">{children}</div>
        </section>
    );
}

function BlockTitle({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <h3 className={cn("text-[11px] font-semibold uppercase tracking-widest text-text-tertiary", className)}>{children}</h3>
    );
}

export function HomeDashboard({ userFirstName }: { userFirstName?: string }) {
    const initialCustom = useMemo(() => defaultHubCustomRange(), []);

    // Independent filters per column, matching the reference layout.
    const [finFilterType, setFinFilterType] = useState<RangeFilterType>("custom");
    const [finStart, setFinStart] = useState(initialCustom.start);
    const [finEnd, setFinEnd] = useState(initialCustom.end);

    const [mktFilterType, setMktFilterType] = useState<RangeFilterType>("all");
    const [mktStart, setMktStart] = useState(initialCustom.start);
    const [mktEnd, setMktEnd] = useState(initialCustom.end);

    const [mobileTab, setMobileTab] = useState<"finanzas" | "supermercado">("finanzas");
    // Mobile-only: quick actions collapsed by default (accordion).
    const [actionsOpen, setActionsOpen] = useState(false);
    // Mobile-only: per-tab filters collapsed by default (accordion).
    const [filtersOpen, setFiltersOpen] = useState(false);

    const [categoryLimit, setCategoryLimit] = useState(5);
    const [productLimit, setProductLimit] = useState(5);
    // Off by default: amounts and charts show only real (cash) spending until
    // the user opts into seeing credit-card-paid transactions too.
    const [showCredit, setShowCredit] = useState(false);

    const finRange = useMemo(
        () => computeDateRange(finFilterType, finStart, finEnd),
        [finFilterType, finStart, finEnd],
    );
    const mktRange = useMemo(
        () => computeDateRange(mktFilterType, mktStart, mktEnd),
        [mktFilterType, mktStart, mktEnd],
    );

    const { data: fin, loading: finLoading } = useFinancialOverview(finRange.startDate, finRange.endDate);
    const { data: mkt, loading: mktLoading } = useMarketOverview(mktRange.startDate, mktRange.endDate);

    const effectiveKpis = useMemo(
        () => (fin.kpis && !showCredit ? excludeCreditFromKpis(fin.kpis) : fin.kpis),
        [fin.kpis, showCredit],
    );
    const effectiveCategories = useMemo(
        () => (showCredit ? fin.categories : excludeCreditFromCategoryBreakdown(fin.categories)),
        [fin.categories, showCredit],
    );
    const effectiveDaily = useMemo(
        () => (showCredit ? fin.daily : excludeCreditFromDailyBreakdown(fin.daily)),
        [fin.daily, showCredit],
    );

    const financialCategoryData = useMemo(
        () =>
            effectiveCategories
                .filter((c) => c.categoryName && c.categoryName.toLowerCase() !== "sin categoría")
                .slice(0, categoryLimit)
                .map((c) => ({ name: c.categoryName, value: c.total, color: c.color, percentage: c.percentage })),
        [effectiveCategories, categoryLimit],
    );

    // Market summary metrics derived from the fetched datasets.
    const marketMetrics = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of mkt.daily) {
            const month = d.date.substring(0, 7);
            map.set(month, (map.get(month) || 0) + d.total);
        }
        const monthlyMkt = Array.from(map.entries()).map(([month, total]) => ({ month, total }));
        monthlyMkt.sort((a, b) => a.month.localeCompare(b.month));

        const currentMonthKey = new Date().toISOString().slice(0, 7);
        const currentMonthEntry = monthlyMkt.find(h => h.month === currentMonthKey);
        const currentMonthSpending = currentMonthEntry ? currentMonthEntry.total : 0;

        const pastMonths = monthlyMkt.filter((h) => h.month !== currentMonthKey);
        const validPastMonths = pastMonths.filter((h) => h.total > 0);
        const totalPast = pastMonths.reduce((sum, h) => sum + h.total, 0);
        const averageSpending = validPastMonths.length > 0 ? totalPast / validPastMonths.length : 0;

        const totalSpend = monthlyMkt.reduce((sum, h) => sum + h.total, 0);
        const validMonthsCount = monthlyMkt.filter((h) => h.total > 0).length;

        const previousMonthEntry = pastMonths.length > 0 ? pastMonths[pastMonths.length - 1] : null;
        const lastMonthVsAvg = averageSpending > 0 && previousMonthEntry
            ? ((previousMonthEntry.total - averageSpending) / averageSpending) * 100
            : 0;
        const currentVsAvg = averageSpending > 0 ? ((currentMonthSpending - averageSpending) / averageSpending) * 100 : 0;

        return {
            averageSpending,
            currentMonthSpending,
            lastMonthVsAvg,
            currentVsAvg,
            totalSpend,
            validMonthsCount,
            validPastMonthsCount: validPastMonths.length
        };
    }, [mkt.daily]);

    const frequentProducts = useMemo(
        () => mkt.topProducts.slice(0, productLimit),
        [mkt.topProducts, productLimit],
    );

    // Tiles show the toggled (real-only by default) totals; the breakdown
    // modal always shows the full detail — including the credit-card portion
    // — regardless of the toggle, since that's the "show me everything" view.
    const kpis = effectiveKpis;
    const greeting = userFirstName ? `Hola, ${userFirstName}` : "Panel general";

    // Tapping a "Resumen financiero" tile opens a modal breaking down the
    // values behind that number (e.g. real vs. credit-card expenses).
    const [openKpiModal, setOpenKpiModal] = useState<KpiModalKind | null>(null);

    const kpiModalConfig = useMemo(
        () => (openKpiModal && fin.kpis ? buildKpiModalConfig(openKpiModal, fin.kpis) : null),
        [openKpiModal, fin.kpis],
    );

    const isInitialLoading =
        finLoading &&
        mktLoading &&
        !fin.kpis &&
        fin.daily.length === 0 &&
        fin.categories.length === 0 &&
        mkt.daily.length === 0 &&
        mkt.topProducts.length === 0;


    return (
        <div className="pb-8 sm:pb-12">
            {/* Hero Wrapper */}
            <div className="sticky top-[64px] z-20 bg-bg-primary pt-3 md:pt-4 lg:pt-5 -mt-3 md:-mt-4 lg:-mt-5 px-4 md:px-6 lg:px-8 -mx-4 md:-mx-6 lg:-mx-8 pb-3 sm:pb-4">
                <header className="relative overflow-hidden rounded-3xl border border-border-base bg-gradient-to-br from-bg-secondary via-bg-secondary to-bg-tertiary/40 p-4 sm:p-5 shadow-sm">
                    <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-emerald-500/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-accent-violet/10 blur-3xl" />
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-col gap-1">
                                <p className="text-xs font-semibold uppercase tracking-widest text-accent-primary">KyberLife</p>
                                <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{greeting}</h1>
                                <p className="hidden sm:block text-sm text-text-tertiary">Tu actividad financiera y de compras, en un vistazo.</p>
                            </div>
                            {/* Mobile-only toggles: filters visibility + quick actions accordion */}
                            <div className="flex items-center gap-2 sm:hidden">
                                <button
                                    type="button"
                                    onClick={() => setFiltersOpen((o) => !o)}
                                    aria-expanded={filtersOpen}
                                    aria-label={filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
                                    className={cn(
                                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm transition-transform active:scale-95",
                                        filtersOpen
                                            ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                                            : "border-border-base bg-bg-tertiary text-text-secondary",
                                    )}
                                >
                                    <SlidersHorizontal className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActionsOpen((o) => !o)}
                                    aria-expanded={actionsOpen}
                                    aria-label={actionsOpen ? "Ocultar acciones" : "Mostrar acciones"}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-primary to-accent-primary-hover text-white shadow-lg shadow-accent-primary/25 transition-transform active:scale-95"
                                >
                                    <ChevronDown className={cn("h-5 w-5 transition-transform duration-300", actionsOpen && "rotate-180")} />
                                </button>
                            </div>
                        </div>

                        {/* ACCIONES */}
                        <div className={cn(
                            "flex-col gap-2 sm:gap-4 sm:flex sm:flex-row sm:items-center lg:justify-end w-full lg:w-auto",
                            actionsOpen ? "flex animate-in fade-in slide-in-from-top-2" : "hidden sm:flex",
                        )}>
                            {/* FINANZAS */}
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap">
                                    <Button asChild variant="ghost" className="h-auto p-0 hover:bg-transparent w-full sm:w-auto lg:w-[160px]">
                                        <Link
                                            href="/financial/transactions/new"
                                            className="flex w-full items-center gap-2.5 lg:gap-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 px-3 py-2.5 lg:px-4 lg:py-3 text-white shadow-lg shadow-emerald-500/20 transition-opacity hover:opacity-90"
                                        >
                                            <div className="flex h-8 w-8 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                                                <CircleDollarSign className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                                            </div>
                                            <div className="flex flex-col items-start text-left">
                                                <span className="text-[10px] lg:text-[11px] font-medium leading-tight text-white/90">Nueva</span>
                                                <span className="text-xs lg:text-sm font-bold leading-tight">Transacción</span>
                                            </div>
                                        </Link>
                                    </Button>
                                    <Button asChild variant="ghost" className="h-auto p-0 hover:bg-transparent w-full sm:w-auto lg:w-[160px]">
                                        <Link
                                            href="/financial/scans"
                                            className="flex w-full items-center gap-2.5 lg:gap-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 px-3 py-2.5 lg:px-4 lg:py-3 text-white shadow-lg shadow-emerald-500/20 transition-opacity hover:opacity-90"
                                        >
                                            <div className="flex h-8 w-8 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                                                <ScanSearch className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                                            </div>
                                            <div className="flex flex-col items-start text-left">
                                                <span className="text-[10px] lg:text-[11px] font-medium leading-tight text-white/90">Ver</span>
                                                <span className="text-xs lg:text-sm font-bold leading-tight">Escaneos</span>
                                            </div>
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            {/* SEPARADOR VERTICAL */}
                            <div className="hidden h-10 w-[1px] bg-border-base sm:block" />

                            {/* SUPERMERCADO */}
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap">
                                    <Button asChild variant="ghost" className="h-auto p-0 hover:bg-transparent w-full sm:w-auto lg:w-[160px]">
                                        <Link
                                            href="/market/purchases/new"
                                            className="flex w-full items-center gap-2.5 lg:gap-3 rounded-2xl bg-indigo-500 px-3 py-2.5 lg:px-4 lg:py-3 text-white shadow-lg shadow-indigo-500/20 transition-opacity hover:opacity-90"
                                        >
                                            <div className="flex h-8 w-8 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                                                <ShoppingCart className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                                            </div>
                                            <div className="flex flex-col items-start text-left">
                                                <span className="text-[10px] lg:text-[11px] font-medium leading-tight text-white/90">Nueva</span>
                                                <span className="text-xs lg:text-sm font-bold leading-tight">Compra</span>
                                            </div>
                                        </Link>
                                    </Button>
                                    <Button asChild variant="ghost" className="h-auto p-0 hover:bg-transparent w-full sm:w-auto lg:w-[160px]">
                                        <Link
                                            href="/market/purchases"
                                            className="flex w-full items-center gap-2.5 lg:gap-3 rounded-2xl bg-indigo-500 px-3 py-2.5 lg:px-4 lg:py-3 text-white shadow-lg shadow-indigo-500/20 transition-opacity hover:opacity-90"
                                        >
                                            <div className="flex h-8 w-8 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                                                <ClipboardList className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                                            </div>
                                            <div className="flex flex-col items-start text-left">
                                                <span className="text-[10px] lg:text-[11px] font-medium leading-tight text-white/90">Ver</span>
                                                <span className="text-xs lg:text-sm font-bold leading-tight">Compras</span>
                                            </div>
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>
            </div>

            {isInitialLoading ? (
                <DashboardLoading />
            ) : (
                <>
                    {/* Mobile Tabs */}
                    <div className="flex xl:hidden rounded-xl bg-bg-secondary p-1 mb-4 border border-border-base/50">
                        <button
                            onClick={() => setMobileTab('finanzas')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all",
                                mobileTab === 'finanzas' ? "bg-bg-tertiary text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
                            )}
                        >
                            <Wallet className="h-4 w-4 text-emerald-500" />
                            Finanzas
                        </button>
                        <button
                            onClick={() => setMobileTab('supermercado')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all",
                                mobileTab === 'supermercado' ? "bg-bg-tertiary text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
                            )}
                        >
                            <ShoppingCart className="h-4 w-4 text-indigo-500" />
                            Supermercado
                        </button>
                    </div>

                    {/* Two-column hub */}
                    <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 pt-0 sm:pt-2">
                        {/* ── FINANZAS ── */}
                        <div className={cn(mobileTab === 'finanzas' ? 'block' : 'hidden', 'xl:block')}>
                            <ModuleColumn
                                icon={<Wallet className="h-5 w-5" />}
                                iconWrapClassName="bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/20"
                                title="Finanzas"
                                subtitle="Ingresos, gastos y categorías de tu dinero."
                                filtersOpen={filtersOpen}
                                filter={
                                    <DateRangeFilter
                                        value={finFilterType}
                                        onChange={setFinFilterType}
                                        customStart={finStart}
                                        customEnd={finEnd}
                                        onCustomStartChange={setFinStart}
                                        onCustomEndChange={setFinEnd}
                                        presets={HUB_PRESETS}
                                    />
                                }
                            >
                                {/* Resumen financiero */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <BlockTitle>Resumen financiero</BlockTitle>
                                        <CreditToggle checked={showCredit} onChange={setShowCredit} />
                                    </div>
                                    {finLoading && !kpis ? (
                                        <TilesSkeleton />
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                            <SparkStatCard
                                                label="Balance"
                                                value={currency(kpis?.netBalance ?? 0)}
                                                icon={Wallet}
                                                color={(kpis?.netBalance ?? 0) < 0 ? "#ef4444" : "#22c55e"}
                                                tintClassName={(kpis?.netBalance ?? 0) < 0 ? "from-rose-500/[0.16] via-rose-500/[0.05]" : "from-emerald-500/[0.16] via-emerald-500/[0.05]"}
                                                badgeClassName={(kpis?.netBalance ?? 0) < 0 ? "bg-rose-500/20 text-rose-500 dark:text-rose-400" : "bg-emerald-500/20 text-emerald-500 dark:text-emerald-400"}
                                                points={effectiveDaily.map((d) => d.net)}
                                                onClick={kpis ? () => setOpenKpiModal("balance") : undefined}
                                            />
                                            <SparkStatCard
                                                label="Ingresos"
                                                value={currency(kpis?.totalIncome ?? 0)}
                                                icon={ArrowDownCircle}
                                                color="#22c55e"
                                                tintClassName="from-emerald-500/[0.16] via-emerald-500/[0.05]"
                                                badgeClassName="bg-emerald-500/20 text-emerald-500 dark:text-emerald-400"
                                                points={effectiveDaily.map((d) => d.income)}
                                                onClick={kpis ? () => setOpenKpiModal("ingresos") : undefined}
                                            />
                                            <SparkStatCard
                                                label="Gastos"
                                                value={currency(kpis?.totalExpenses ?? 0)}
                                                icon={ArrowUpCircle}
                                                color="#ef4444"
                                                tintClassName="from-rose-500/[0.16] via-rose-500/[0.05]"
                                                badgeClassName="bg-rose-500/20 text-rose-500 dark:text-rose-400"
                                                points={effectiveDaily.map((d) => d.expenses)}
                                                onClick={kpis ? () => setOpenKpiModal("gastos") : undefined}
                                            />
                                        </div>
                                    )}
                                </div>

                                <MobileCarousel>
                                    {/* Evolución financiera */}
                                    <div className="space-y-2">
                                        <BlockTitle className="hidden sm:block">Evolución financiera</BlockTitle>
                                        {finLoading ? <ChartSkeleton /> : <UnifiedTrendChart data={effectiveDaily} iconLegend className={CHART_HEIGHT} />}
                                    </div>

                                    {/* Top categorías de gasto */}
                                    <div className="space-y-2">
                                        <BlockTitle className="hidden sm:block">Top categorías de gasto</BlockTitle>
                                        {finLoading ? (
                                            <ChartSkeleton />
                                        ) : (
                                            <RankBarChart
                                                title="Gasto por categoría"
                                                description="Distribución de tus gastos"
                                                icon={Layers}
                                                iconClassName="text-emerald-500"
                                                data={financialCategoryData}
                                                emptyMessage="Sin datos"
                                                showPercentage
                                                className={CHART_HEIGHT}
                                                headerAction={
                                                    <Select value={String(categoryLimit)} onValueChange={(v) => setCategoryLimit(Number(v))}>
                                                        <SelectTrigger className="h-8 w-[92px] rounded-lg border-border/40 bg-muted/40 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="5">Top 5</SelectItem>
                                                            <SelectItem value="10">Top 10</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                }
                                            />
                                        )}
                                    </div>
                                </MobileCarousel>
                            </ModuleColumn>
                        </div>

                        {/* ── SUPERMERCADO ── */}
                        <div className={cn(mobileTab === 'supermercado' ? 'block' : 'hidden', 'xl:block')}>
                            <ModuleColumn
                                icon={<ShoppingCart className="h-5 w-5" />}
                                iconWrapClassName="bg-indigo-500 shadow-indigo-500/20"
                                title="Supermercado"
                                subtitle="Tu gasto en compras y los productos que más consumes."
                                filtersOpen={filtersOpen}
                                filter={
                                    <DateRangeFilter
                                        value={mktFilterType}
                                        onChange={setMktFilterType}
                                        customStart={mktStart}
                                        customEnd={mktEnd}
                                        onCustomStartChange={setMktStart}
                                        onCustomEndChange={setMktEnd}
                                        presets={HUB_PRESETS}
                                    />
                                }
                            >
                                {/* Resumen supermercado */}
                                <div className="space-y-2">
                                    <BlockTitle>Resumen supermercado</BlockTitle>
                                    {mktLoading && mkt.daily.length === 0 ? (
                                        <TilesSkeleton />
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                            <StatTile
                                                label={`Gasto Total (${marketMetrics.validMonthsCount} meses)`}
                                                value={currency(marketMetrics.totalSpend)}
                                                icon={Wallet}
                                                accentClassName="text-indigo-500"
                                            />
                                            <StatTile
                                                label={`Promedio (${marketMetrics.validPastMonthsCount} meses)`}
                                                value={currency(marketMetrics.averageSpending)}
                                                icon={TrendingUp}
                                                accentClassName="text-accent-cyan"
                                            />
                                            <StatTile
                                                label="Gasto Mes Actual"
                                                value={currency(marketMetrics.currentMonthSpending)}
                                                icon={CreditCard}
                                                accentClassName="text-accent-primary"
                                            />
                                        </div>
                                    )}
                                </div>

                                <MobileCarousel>
                                    {/* Distribución de gasto en compras */}
                                    <div className="space-y-2">
                                        <BlockTitle className="hidden sm:block">Distribución de gasto en compras</BlockTitle>
                                        {mktLoading ? (
                                            <ChartSkeleton />
                                        ) : (
                                            <SpendTrendChart
                                                data={mkt.daily}
                                                title="Gasto en compras"
                                                description="Evolución de tu gasto en Supermercado"
                                                icon={ShoppingCart}
                                                iconClassName="text-indigo-500"
                                                color="#6366f1"
                                                variant="bar"
                                                className={CHART_HEIGHT}
                                            />
                                        )}
                                    </div>

                                    {/* Top productos frecuentes */}
                                    <div className="space-y-2">
                                        <BlockTitle className="hidden sm:block">Top productos frecuentes</BlockTitle>
                                        {mktLoading ? (
                                            <ChartSkeleton />
                                        ) : (
                                            <FrequentProductsCard
                                                products={frequentProducts}
                                                className={CHART_HEIGHT}
                                                headerAction={
                                                    <Select value={String(productLimit)} onValueChange={(v) => setProductLimit(Number(v))}>
                                                        <SelectTrigger className="h-8 w-[92px] rounded-lg border-border/40 bg-muted/40 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="5">Top 5</SelectItem>
                                                            <SelectItem value="10">Top 10</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                }
                                            />
                                        )}
                                    </div>
                                </MobileCarousel>
                            </ModuleColumn>
                        </div>
                    </div>
                </>
            )}
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
        </div>
    );
}
