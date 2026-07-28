"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RangeCalendar, formatRangeLabel } from "@/components/ui/range-calendar";
import { cn } from "@/lib/utils";

export interface PeriodOption<T extends string = string> {
    id: T;
    label: string;
}

export interface PeriodFilterProps<T extends string = string> {
    /** Currently selected preset id, or the custom-range id. */
    value: T;
    onChange: (value: T) => void;
    /** Preset options, excluding the custom range (it is appended automatically). */
    presets: PeriodOption<T>[];
    /** Id that represents "a custom date range". */
    customId: T;
    customStart: string;
    customEnd: string;
    /** Fired with a complete range; also selects the custom option. */
    onCustomRangeChange: (start: string, end: string) => void;
    className?: string;
    triggerClassName?: string;
}

/**
 * Period filter in a **single** control: the presets and the custom date range
 * live in the same dropdown, so the filters no longer need a separate date
 * field next to the period select.
 *
 * The custom entry isn't labelled "Personalizado" — it shows the actual range
 * (e.g. "22 jun – 21 jul 2026"), and expanding it reveals the calendar to
 * adjust it right there.
 */
export function PeriodFilter<T extends string = string>({
    value,
    onChange,
    presets,
    customId,
    customStart,
    customEnd,
    onCustomRangeChange,
    className,
    triggerClassName,
}: PeriodFilterProps<T>) {
    const [open, setOpen] = React.useState(false);
    const [showCalendar, setShowCalendar] = React.useState(false);

    const rangeLabel = formatRangeLabel(customStart, customEnd) ?? "Rango personalizado";
    const isCustom = value === customId;
    const triggerLabel = isCustom ? rangeLabel : (presets.find((p) => p.id === value)?.label ?? rangeLabel);

    const handleOpenChange = (next: boolean) => {
        // Reopening always starts from the list, not from a left-over calendar.
        if (next) setShowCalendar(false);
        setOpen(next);
    };

    const selectPreset = (id: T) => {
        onChange(id);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Período: ${triggerLabel}`}
                    className={cn(
                        "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/40 px-3 text-sm transition-colors hover:bg-muted/60",
                        className,
                        triggerClassName,
                    )}
                >
                    <span className="truncate">{triggerLabel}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-[240px] p-1.5">
                {!showCalendar ? (
                    <div className="flex flex-col">
                        {presets.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => selectPreset(p.id)}
                                className={cn(
                                    "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                                    value === p.id && "text-accent-primary font-medium",
                                )}
                            >
                                {p.label}
                                {value === p.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                        ))}

                        {/* The custom range shows the dates themselves, not "Personalizado". */}
                        <button
                            type="button"
                            onClick={() => setShowCalendar(true)}
                            className={cn(
                                "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                                isCustom && "text-accent-primary font-medium",
                            )}
                        >
                            <span className="truncate">{rangeLabel}</span>
                            {isCustom ? (
                                <Check className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-muted-foreground" />
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="p-1.5">
                        <RangeCalendar
                            start={customStart}
                            end={customEnd}
                            onChange={(from, to) => {
                                setShowCalendar(false);
                                setOpen(false);
                                onCustomRangeChange(from, to);
                            }}
                        />
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
