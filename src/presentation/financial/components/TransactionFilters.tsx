"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, X, ChevronDown, Filter } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FinancialCategory, FinancialInstitution } from "@/domain/entities/financial";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { defaultHubCustomRange, STANDARD_PERIOD_PRESETS } from "@/lib/date-range";
import { PeriodFilter } from "@/components/ui/period-filter";

// ─── Date Preset Helpers ─────────────────────────────────────

type DatePreset = "today" | "week" | "month" | "all" | "custom";


function getPresetRange(preset: Exclude<DatePreset, "custom">): { from: string; to: string; range?: string } {
    const now = new Date();
    const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const toStr = toDate.toISOString();

    switch (preset) {
        case "today": {
            const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            return { from: from.toISOString(), to: toStr };
        }
        case "week": {
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset, 0, 0, 0);
            return { from: from.toISOString(), to: toStr };
        }
        case "month": {
            const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            return { from: from.toISOString(), to: toStr };
        }
        case "all": {
            return { from: "", to: "", range: "all" };
        }
    }
}

/** Convert an ISO string to a local YYYY-MM-DD for <input type="date"> */
function toLocalDateValue(iso: string): string {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDefaultCustomDates() {
    // Billing cycle that contains today (22nd of one month → 21st of the next).
    const { start, end } = defaultHubCustomRange();
    return { from: start, to: end };
}

// ─── Component ───────────────────────────────────────────────

export interface TransactionFiltersProps {
    categories?: FinancialCategory[];
    institutions?: FinancialInstitution[];
}

export function TransactionFilters({ categories = [], institutions = [] }: TransactionFiltersProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // ── Text search ──────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
    const initialCategoryId = searchParams.get("categoryId") || "all";
    const [categoryId, setCategoryId] = useState<string>(initialCategoryId);
    
    const initialInstitutionId = searchParams.get("institutionId") || "all";
    const [institutionId, setInstitutionId] = useState<string>(initialInstitutionId);
    
    const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // ── Date filter ──────────────────────────────────────────
    const urlDateFrom = searchParams.get("dateFrom") || "";
    const urlDateTo = searchParams.get("dateTo") || "";
    const [dateFrom, setDateFrom] = useState(urlDateFrom);
    const [dateTo, setDateTo] = useState(urlDateTo);
    const [activePreset, setActivePreset] = useState<DatePreset | null>(
        searchParams.get("range") === "all" ? "all" : "custom"
    );

    // ── Custom date inputs (local YYYY-MM-DD) ────────────────
    const defaultCustom = getDefaultCustomDates();
    const [customFrom, setCustomFrom] = useState(urlDateFrom ? toLocalDateValue(urlDateFrom) : defaultCustom.from);
    const [customTo, setCustomTo] = useState(urlDateTo ? toLocalDateValue(urlDateTo) : defaultCustom.to);

    // Debounce search update
    useEffect(() => {
        const timer = setTimeout(() => {
            const currentQuery = searchParams.get("query") || "";
            if (searchQuery !== currentQuery) {
                const params = new URLSearchParams(searchParams.toString());
                if (searchQuery) {
                    params.set("query", searchQuery);
                } else {
                    params.delete("query");
                }
                router.push(`${pathname}?${params.toString()}`);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, pathname, router, searchParams]);

    const handleCategoryChange = useCallback((val: string) => {
        setCategoryId(val);
        const params = new URLSearchParams(searchParams.toString());
        if (val && val !== "all") {
            params.set("categoryId", val);
        } else {
            params.delete("categoryId");
        }
        router.push(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    const handleInstitutionChange = useCallback((val: string) => {
        setInstitutionId(val);
        const params = new URLSearchParams(searchParams.toString());
        if (val && val !== "all") {
            params.set("institutionId", val);
        } else {
            params.delete("institutionId");
        }
        router.push(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    // ── Date Filter Actions ──────────────────────────────────

    const applyDateFilter = useCallback((from: string, to: string, range?: string) => {
        setDateFrom(from);
        setDateTo(to);
        const params = new URLSearchParams(searchParams.toString());
        if (from) {
            params.set("dateFrom", from);
        } else {
            params.delete("dateFrom");
        }
        if (to) {
            params.set("dateTo", to);
        } else {
            params.delete("dateTo");
        }
        if (range) {
            params.set("range", range);
        } else {
            params.delete("range");
        }
        router.push(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    const handlePresetClick = (preset: Exclude<DatePreset, "custom">) => {
        setActivePreset(preset);
        const { from, to, range } = getPresetRange(preset);
        applyDateFilter(from, to, range);
    };

    /**
     * Applies as soon as a complete range is picked — same behaviour as the
     * dashboards' filters, so there is no separate "Aplicar" step.
     */
    const handleCustomRangeChange = (nextFrom: string, nextTo: string) => {
        setCustomFrom(nextFrom);
        setCustomTo(nextTo);
        if (!nextFrom || !nextTo) return;
        setActivePreset("custom");
        applyDateFilter(
            new Date(`${nextFrom}T00:00:00`).toISOString(),
            new Date(`${nextTo}T23:59:59`).toISOString(),
        );
    };

    const clearDateFilter = () => {
        setDateFrom("");
        setDateTo("");
        setActivePreset("all");
        setCustomFrom(defaultCustom.from);
        setCustomTo(defaultCustom.to);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("dateFrom");
        params.delete("dateTo");
        params.set("range", "all");
        router.push(`${pathname}?${params.toString()}`);
    };

    const urlRange = searchParams.get("range");
    const isDefaultRange = !dateFrom && !dateTo && urlRange !== 'all';
    const hasDateFilter = Boolean(dateFrom || dateTo || isDefaultRange);

    const hasAnyFilter = (categoryId && categoryId !== "all")
        || (institutionId && institutionId !== "all")
        || searchParams.has("query")
        || searchParams.has("currency")
        || hasDateFilter;

    const activeFilterNames = [];
    if (searchParams.has("query")) activeFilterNames.push("búsqueda");
    if (categoryId && categoryId !== "all") activeFilterNames.push("categoría");
    if (institutionId && institutionId !== "all") activeFilterNames.push("institución");
    if (hasDateFilter) activeFilterNames.push("fecha");
    if (searchParams.has("currency")) activeFilterNames.push("moneda");

    const activeFiltersText = activeFilterNames.length > 0 
        ? `Filtros para: ${activeFilterNames.join(", ")}` 
        : "Sin filtros aplicados";

    const clearAllFilters = () => {
        setCategoryId("all");
        setInstitutionId("all");
        setSearchQuery("");
        clearDateFilter(); // This already sets range to 'all'
        const params = new URLSearchParams(searchParams.toString());
        params.delete("categoryId");
        params.delete("institutionId");
        params.delete("query");
        params.delete("currency");
        params.delete("dateFrom");
        params.delete("dateTo");
        params.set("range", "all");
        router.push(`${pathname}?${params.toString()}`);
    };

    // ── Build label for date button ──────────────────────────


    return (
        <div className="flex flex-col gap-3 w-full mb-4">
            {/* Mobile Accordion Toggle */}
            <div
                className={cn(
                    "sm:hidden flex items-center justify-between gap-3 py-3 px-4 rounded-2xl border border-border-base bg-bg-primary cursor-pointer transition-colors active:scale-[0.99]",
                    isExpanded ? "border-border" : "hover:bg-bg-hover",
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        <Filter className="w-4 h-4" />
                    </span>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[15px] font-medium text-foreground/90 leading-tight">
                            Filtros de búsqueda
                        </span>
                        <span className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                            {activeFiltersText}
                        </span>
                    </div>
                </div>
                <ChevronDown className={cn("w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
            </div>

            {/* ── Content (Hidden on mobile by default) ───────────────── */}
            <div className={cn(
                "flex-col sm:flex-row gap-3 w-full items-stretch sm:items-center bg-bg-primary border border-border-base p-3 sm:p-2 rounded-2xl shadow-sm transition-all duration-300",
                isExpanded ? "flex animate-in fade-in slide-in-from-top-2" : "hidden sm:flex"
            )}>
                <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <Input
                        placeholder="Buscar transacciones, instituciones o categorías..."
                        className="pl-9 h-10 rounded-xl bg-muted/40 border-border/40 focus-visible:ring-1 focus-visible:ring-offset-0 transition-colors sm:h-9 sm:rounded-lg sm:bg-transparent sm:border-transparent sm:shadow-none sm:hover:bg-white/5 sm:focus-visible:ring-0"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="h-6 w-px bg-border-base hidden sm:block shrink-0" />

                {/* Mobile: structured inline fields (no popovers) */}
                <div className="flex flex-col gap-3 sm:hidden">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5 min-w-0">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Categoría
                            </label>
                            <Select value={categoryId} onValueChange={handleCategoryChange}>
                                <SelectTrigger className="w-full h-10 rounded-xl bg-muted/40 border-border/40">
                                    <SelectValue placeholder="Todas" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    {categories.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 min-w-0">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Institución
                            </label>
                            <Select value={institutionId} onValueChange={handleInstitutionChange}>
                                <SelectTrigger className="w-full h-10 rounded-xl bg-muted/40 border-border/40">
                                    <SelectValue placeholder="Todas" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    {institutions.map(i => (
                                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Período
                        </label>
                        {/* Presets and the custom range share one control: the custom
                            entry shows the dates themselves and opens the calendar. */}
                        <PeriodFilter
                            value={activePreset ?? "custom"}
                            onChange={(preset) => handlePresetClick(preset as Exclude<DatePreset, "custom">)}
                            presets={STANDARD_PERIOD_PRESETS}
                            customId="custom"
                            customStart={customFrom}
                            customEnd={customTo}
                            onCustomRangeChange={handleCustomRangeChange}
                        />
                    </div>

                    {hasAnyFilter && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl text-muted-foreground"
                            onClick={clearAllFilters}
                        >
                            <X className="h-3.5 w-3.5" />
                            Limpiar filtros
                        </Button>
                    )}
                </div>

                {/* Desktop: compact popover buttons */}
                <div className="hidden sm:flex gap-2 w-auto shrink-0 pl-1">
                    {/* Advanced Filters Dropdown (Category & Institution) */}
                    <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" className="gap-2 hover:bg-white/5">
                                <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground truncate">Filtros</span>
                                {((categoryId && categoryId !== "all" ? 1 : 0) + (institutionId && institutionId !== "all" ? 1 : 0)) > 0 && (
                                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary/20 text-[10px] font-medium text-accent-primary">
                                        {(categoryId && categoryId !== "all" ? 1 : 0) + (institutionId && institutionId !== "all" ? 1 : 0)}
                                    </span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-4 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    Categoría
                                </label>
                                <Select value={categoryId} onValueChange={handleCategoryChange}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        {categories.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    Institución
                                </label>
                                <Select value={institutionId} onValueChange={handleInstitutionChange}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        {institutions.map(i => (
                                            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Date Range Filter: presets + custom range in one control */}
                    <div className="flex items-center gap-1">
                        <PeriodFilter
                            value={activePreset ?? "custom"}
                            onChange={(preset) => handlePresetClick(preset as Exclude<DatePreset, "custom">)}
                            presets={STANDARD_PERIOD_PRESETS}
                            customId="custom"
                            customStart={customFrom}
                            customEnd={customTo}
                            onCustomRangeChange={handleCustomRangeChange}
                            className="h-9 w-auto min-w-[170px] border-transparent bg-transparent hover:bg-white/5"
                        />
                        {hasDateFilter && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={clearDateFilter}
                                aria-label="Limpiar filtro de fecha"
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>

                    {hasAnyFilter && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={clearAllFilters}
                        >
                            Limpiar filtros
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
