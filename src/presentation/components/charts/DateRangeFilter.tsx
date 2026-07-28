"use client";

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PeriodFilter } from "@/components/ui/period-filter";
import { formatRangeLabel } from "@/components/ui/range-calendar";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RangeFilterType } from "@/lib/date-range";

export interface DateRangePreset {
    id: RangeFilterType;
    label: string;
}

export const DEFAULT_PRESETS: DateRangePreset[] = [
    { id: "all", label: "Todo el tiempo" },
    { id: "today", label: "Hoy" },
    { id: "week", label: "Semana" },
    { id: "month", label: "Mes" },
    { id: "custom", label: "Personalizado" },
];

/** Presets for the main dashboard hub. */
export const HUB_PRESETS: DateRangePreset[] = [
    { id: "all", label: "Todos" },
    { id: "today", label: "Hoy" },
    { id: "week", label: "Semana" },
    { id: "month", label: "Mes" },
    { id: "custom", label: "Personalizado" },
];

interface DateRangeFilterProps {
    value: RangeFilterType;
    onChange: (value: RangeFilterType) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    presets?: DateRangePreset[];
    className?: string;
}

/**
 * Controlled date-range filter shared between the financial dashboard and the
 * main dashboard hub: a Select on mobile, a segmented tab bar on desktop, and
 * inline date inputs when "Personalizado" is selected.
 */
/** Presets without the custom entry: the period control appends the range itself. */
const withoutCustom = (presets: DateRangePreset[]) => presets.filter((p) => p.id !== "custom");

export function DateRangeFilter({
    value,
    onChange,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    presets = DEFAULT_PRESETS,
    className,
}: DateRangeFilterProps) {
    // The picker emits a complete range, so both ends are updated together.
    const handleRangeChange = (from: string, to: string) => {
        onCustomStartChange(from);
        onCustomEndChange(to);
    };

    return (
        <div className={cn("flex flex-col w-full", className)}>
            {/* Mobile: one control holding both the presets and the range */}
            <div className="flex flex-col gap-2 w-full sm:hidden h-10">
                <PeriodFilter
                    value={value}
                    onChange={onChange}
                    presets={withoutCustom(presets)}
                    customId={"custom" as RangeFilterType}
                    customStart={customStart}
                    customEnd={customEnd}
                    onCustomRangeChange={handleRangeChange}
                />
            </div>

            {/* Desktop: segmented tabs OR custom date range in the same container */}
            <div className="hidden sm:flex items-center p-1 bg-muted/40 border border-border/40 rounded-xl w-full h-[42px]">
                {value !== "custom" ? (
                    presets.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => onChange(p.id)}
                            className={cn(
                                "flex-1 relative px-4 h-full text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap",
                                value === p.id
                                    ? "text-foreground bg-background shadow-sm ring-1 ring-border/50"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                        >
                            {p.id === "custom" ? (formatRangeLabel(customStart, customEnd) ?? p.label) : p.label}
                        </button>
                    ))
                ) : (
                    <div className="flex items-center gap-2 w-full h-full animate-in fade-in">
                        <button
                            onClick={() => onChange("all")}
                            className="flex items-center justify-center h-full px-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors shrink-0"
                            title="Volver a los filtros predefinidos"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <DateRangePicker
                            start={customStart}
                            end={customEnd}
                            onChange={handleRangeChange}
                            className="h-full flex-1 border-border/50 bg-background text-xs"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
