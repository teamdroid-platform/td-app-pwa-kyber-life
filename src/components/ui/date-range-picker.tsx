"use client";

import * as React from "react";
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isAfter,
    isBefore,
    isSameDay,
    isSameMonth,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Parse a `YYYY-MM-DD` value at local noon so the day never drifts across timezones. */
function parseDayValue(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(`${value.split("T")[0]}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
}

const toDayValue = (d: Date) => format(d, "yyyy-MM-dd");
const labelOf = (d: Date) => format(d, "dd MMM yyyy", { locale: es });

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
 * used to show.
 *
 * Picking works in two taps — the first sets the start (and clears the end),
 * the second closes the range. Choosing an earlier day on the second tap simply
 * flips the ends, so the range can never come out inverted. `onChange` fires
 * only when both ends are set, so consumers get one complete range instead of a
 * half-updated one.
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
    /** Start of an in-progress selection (first tap), before the range closes. */
    const [pendingStart, setPendingStart] = React.useState<Date | null>(null);
    const [hovered, setHovered] = React.useState<Date | null>(null);

    const selectedStart = parseDayValue(start);
    const selectedEnd = parseDayValue(end);

    const [month, setMonth] = React.useState<Date>(() => selectedStart ?? new Date());

    const handleOpenChange = (next: boolean) => {
        if (disabled) return;
        // Re-centre on the current range (and drop any half-made selection)
        // every time the calendar is reopened.
        if (next) {
            setMonth(parseDayValue(start) ?? new Date());
            setPendingStart(null);
            setHovered(null);
        }
        setOpen(next);
    };

    const days = React.useMemo(() => {
        const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
        const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: gridStart, end: gridEnd });
    }, [month]);

    const handleDayClick = (day: Date) => {
        if (!pendingStart) {
            setPendingStart(day);
            return;
        }
        // Second tap closes the range, flipping the ends when picked backwards.
        const [from, to] = isBefore(day, pendingStart) ? [day, pendingStart] : [pendingStart, day];
        setPendingStart(null);
        setHovered(null);
        setOpen(false);
        onChange(toDayValue(from), toDayValue(to));
    };

    // While a selection is in progress, preview it against the hovered day.
    const previewStart = pendingStart ?? selectedStart;
    const previewEnd = pendingStart
        ? (hovered && isBefore(hovered, pendingStart) ? pendingStart : hovered)
        : selectedEnd;
    const previewFrom = pendingStart && hovered && isBefore(hovered, pendingStart) ? hovered : previewStart;

    const isEdge = (day: Date) =>
        (previewFrom && isSameDay(day, previewFrom)) || (previewEnd && isSameDay(day, previewEnd));
    const isInside = (day: Date) =>
        previewFrom && previewEnd && isAfter(day, previewFrom) && isBefore(day, previewEnd);

    const triggerLabel = selectedStart && selectedEnd
        ? `${labelOf(selectedStart)} – ${labelOf(selectedEnd)}`
        : "Selecciona un rango";

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Rango de fechas: ${triggerLabel}`}
                    className={cn(
                        "flex h-10 w-full items-center gap-2 rounded-xl border border-border/40 bg-muted/40 px-3 text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50",
                        className,
                        triggerClassName,
                    )}
                >
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className={cn("truncate", !(selectedStart && selectedEnd) && "text-muted-foreground")}>
                        {triggerLabel}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setMonth(subMonths(month, 1))}
                        aria-label="Mes anterior"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 transition-colors hover:bg-muted"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold capitalize">
                        {format(month, "MMMM yyyy", { locale: es })}
                    </span>
                    <button
                        type="button"
                        onClick={() => setMonth(addMonths(month, 1))}
                        aria-label="Mes siguiente"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 transition-colors hover:bg-muted"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                    {WEEKDAYS.map((d) => (
                        <div key={d} className="pb-1 text-center text-[10px] font-medium text-muted-foreground">
                            {d}
                        </div>
                    ))}

                    {days.map((day) => {
                        const edge = isEdge(day);
                        const inside = isInside(day);
                        return (
                            <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => handleDayClick(day)}
                                onMouseEnter={() => setHovered(day)}
                                className={cn(
                                    "h-9 w-9 rounded-lg text-xs transition-colors",
                                    !isSameMonth(day, month) && "text-muted-foreground/40",
                                    inside && "bg-accent-primary/15",
                                    edge
                                        ? "bg-accent-primary font-bold text-white"
                                        : "hover:bg-muted",
                                )}
                            >
                                {format(day, "d")}
                            </button>
                        );
                    })}
                </div>

                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                    {pendingStart
                        ? `Inicio: ${labelOf(pendingStart)} — elige el fin`
                        : "Elige la fecha de inicio"}
                </p>
            </PopoverContent>
        </Popover>
    );
}
