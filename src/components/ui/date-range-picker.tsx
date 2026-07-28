"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RangeCalendar, formatRangeLabel } from "@/components/ui/range-calendar";
import { cn } from "@/lib/utils";

export interface DateRangePickerProps {
    /** Range start as `YYYY-MM-DD` (empty when unset). */
    start: string;
    /** Range end as `YYYY-MM-DD` (empty when unset). */
    end: string;
    /** Fired once the range is complete (both ends picked). */
    onChange: (start: string, end: string) => void;
    disabled?: boolean;
    className?: string;
    /** Extra classes for the trigger button. */
    triggerClassName?: string;
}

/**
 * Single-control date **range** picker: one calendar where the user picks the
 * start and then the end, replacing the two separate date fields the filters
 * used to show. The picking behaviour lives in {@link RangeCalendar}.
 */
export function DateRangePicker({
    start,
    end,
    onChange,
    disabled = false,
    className,
    triggerClassName,
}: DateRangePickerProps) {
    const [open, setOpen] = React.useState(false);
    const label = formatRangeLabel(start, end);

    return (
        <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Rango de fechas: ${label ?? "sin seleccionar"}`}
                    className={cn(
                        "flex h-10 w-full items-center gap-2 rounded-xl border border-border/40 bg-muted/40 px-3 text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50",
                        className,
                        triggerClassName,
                    )}
                >
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className={cn("truncate", !label && "text-muted-foreground")}>
                        {label ?? "Selecciona un rango"}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
                <RangeCalendar
                    start={start}
                    end={end}
                    onChange={(from, to) => {
                        setOpen(false);
                        onChange(from, to);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}
