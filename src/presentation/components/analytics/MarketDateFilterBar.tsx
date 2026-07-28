"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PeriodFilter } from "@/components/ui/period-filter";
import { formatRangeLabel } from "@/components/ui/range-calendar";
import { defaultHubCustomRange } from "@/lib/date-range";

/** Presets for the period control; it appends the custom range itself. */
const MARKET_PRESETS = [
    { id: "all" as const, label: "Todo el tiempo" },
    { id: "today" as const, label: "Hoy" },
    { id: "week" as const, label: "Semana" },
    { id: "month" as const, label: "Mes" },
];

export type FilterType = "all" | "today" | "week" | "month" | "custom";

const getDateRange = (type: FilterType): { start?: string, end?: string } => {
    const now = new Date();
    
    if (type === "today") {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    if (type === "week") {
        const start = new Date(now);
        const day = now.getDay() || 7; 
        if (day !== 1) start.setDate(start.getDate() - (day - 1));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    if (type === "month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    return {};
};

export function MarketDateFilterBar() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [filterType, setFilterType] = useState<FilterType>("month");
    const [customStartDate, setCustomStartDate] = useState<string>("");
    const [customEndDate, setCustomEndDate] = useState<string>("");

    // Initialize from URL
    useEffect(() => {
        const type = searchParams.get("filter") as FilterType;
        const validTypes = ["all", "today", "week", "month", "custom"];
        const start = searchParams.get("startDate");
        const end = searchParams.get("endDate");

        // No (valid) filter in the URL → default to the current month and hydrate it.
        if (!type || !validTypes.includes(type)) {
            const range = getDateRange("month");
            setFilterType("month");
            const params = new URLSearchParams(searchParams);
            params.set("filter", "month");
            if (range.start) params.set("startDate", range.start);
            if (range.end) params.set("endDate", range.end);
            router.replace(`?${params.toString()}`, { scroll: false });
            return;
        }

        setFilterType(type);

        if (start) {
            const d = new Date(start);
            if (!isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                setCustomStartDate(`${yyyy}-${mm}-${dd}`);
            } else {
                setCustomStartDate(start.substring(0, 10));
            }
        }
        if (end) {
            const d = new Date(end);
            if (!isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                setCustomEndDate(`${yyyy}-${mm}-${dd}`);
            } else {
                setCustomEndDate(end.substring(0, 10));
            }
        }

        // Hydrate missing dates (fixes bookmarks without dates).
        if (type !== "all" && (!start || !end)) {
            if (type === "custom") {
                const def = defaultHubCustomRange();
                setCustomStartDate(def.start);
                setCustomEndDate(def.end);
                const params = new URLSearchParams(searchParams);
                params.set("startDate", new Date(def.start + "T00:00:00").toISOString());
                params.set("endDate", new Date(def.end + "T23:59:59.999").toISOString());
                router.replace(`?${params.toString()}`, { scroll: false });
            } else {
                const range = getDateRange(type);
                if (range.start && range.end) {
                    const params = new URLSearchParams(searchParams);
                    params.set("startDate", range.start);
                    params.set("endDate", range.end);
                    router.replace(`?${params.toString()}`, { scroll: false });
                }
            }
        }
    }, [searchParams, router]);

    const updateFilter = (type: FilterType, start?: string, end?: string) => {
        const params = new URLSearchParams(searchParams);
        params.set("filter", type);
        
        if (type === "custom") {
            if (start) {
                // If it's already an ISO string, keep it, otherwise convert from YYYY-MM-DD
                const startIso = start.includes('T') ? start : new Date(start + 'T00:00:00').toISOString();
                params.set("startDate", startIso);
            }
            if (end) {
                const endIso = end.includes('T') ? end : new Date(end + 'T23:59:59.999').toISOString();
                params.set("endDate", endIso);
            }
        } else if (type === "all") {
            params.delete("startDate");
            params.delete("endDate");
        } else {
            const range = getDateRange(type);
            if (range.start) params.set("startDate", range.start);
            if (range.end) params.set("endDate", range.end);
        }

        router.push(`?${params.toString()}`, { scroll: false });
    };

    const handleTypeChange = (type: FilterType) => {
        setFilterType(type);
        
        if (type !== "custom") {
            updateFilter(type);
        } else {
            // For custom, reuse existing dates or fall back to the default 22..21 cycle.
            if (!customStartDate || !customEndDate) {
                const def = defaultHubCustomRange();
                setCustomStartDate(def.start);
                setCustomEndDate(def.end);
                updateFilter("custom", def.start, def.end);
            } else {
                updateFilter("custom", customStartDate, customEndDate);
            }
        }
    };

    /** The picker emits a complete range, so both ends move together. */
    const handleCustomRangeChange = (from: string, to: string) => {
        setCustomStartDate(from);
        setCustomEndDate(to);
        updateFilter("custom", from, to);
    };

    return (
        <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 flex-1 w-full mb-6">
            {/* Mobile Filter (Select) */}
            <div className="w-full sm:hidden">
                <PeriodFilter
                    value={filterType}
                    onChange={(v) => handleTypeChange(v as FilterType)}
                    presets={MARKET_PRESETS}
                    customId={"custom" as FilterType}
                    customStart={customStartDate}
                    customEnd={customEndDate}
                    onCustomRangeChange={handleCustomRangeChange}
                    className="bg-bg-2 text-text-1"
                />
            </div>

            {/* Desktop Filter (Tabs) */}
            <div className="hidden sm:flex items-center p-1 bg-bg-2 border border-border/40 rounded-xl w-full">
                {(
                    [
                        { id: 'all', label: 'Todo el tiempo' },
                        { id: 'today', label: 'Hoy' },
                        { id: 'week', label: 'Semana' },
                        { id: 'month', label: 'Mes' },
                        { id: 'custom', label: formatRangeLabel(customStartDate, customEndDate) ?? 'Personalizado' }
                    ] as const
                ).map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTypeChange(tab.id as FilterType)}
                        className={`
                            flex-1 relative px-4 py-1.5 text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap
                            ${filterType === tab.id
                                ? 'text-text-1 bg-bg-1 shadow-sm ring-1 ring-border/50'
                                : 'text-text-3 hover:text-text-1 hover:bg-bg-3/50'}
                        `}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {filterType === "custom" && (
                <div className="w-full sm:w-auto sm:min-w-[280px] animate-in fade-in slide-in-from-top-1">
                    <DateRangePicker
                        start={customStartDate}
                        end={customEndDate}
                        onChange={handleCustomRangeChange}
                        className="bg-bg-2 text-xs"
                    />
                </div>
            )}
        </div>
    );
}
