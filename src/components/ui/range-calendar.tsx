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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Parse a `YYYY-MM-DD` value at local noon so the day never drifts across timezones. */
export function parseDayValue(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(`${value.split("T")[0]}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
}

export const toDayValue = (d: Date) => format(d, "yyyy-MM-dd");
export const formatDayLabel = (d: Date) => format(d, "dd MMM yyyy", { locale: es });

/** Short label for a complete range, e.g. "22 jun – 21 jul 2026". */
export function formatRangeLabel(start?: string, end?: string): string | null {
    const from = parseDayValue(start);
    const to = parseDayValue(end);
    if (!from || !to) return null;
    const sameYear = from.getFullYear() === to.getFullYear();
    const fromLabel = format(from, sameYear ? "dd MMM" : "dd MMM yyyy", { locale: es });
    return `${fromLabel} – ${formatDayLabel(to)}`;
}

export interface RangeCalendarProps {
    start: string;
    end: string;
    /** Fired once both ends are picked. */
    onChange: (start: string, end: string) => void;
    className?: string;
}

/**
 * Month calendar for picking a date **range** in two taps, with a hover preview
 * of the range being drawn. Picking a day earlier than the first tap flips the
 * ends instead of rejecting it, and `onChange` fires only once the range is
 * complete — never with a half-updated range.
 *
 * Shared by {@link DateRangePicker} and the period filter so both behave alike.
 */
export function RangeCalendar({ start, end, onChange, className }: RangeCalendarProps) {
    const selectedStart = parseDayValue(start);
    const selectedEnd = parseDayValue(end);

    const [month, setMonth] = React.useState<Date>(() => selectedStart ?? new Date());
    /** Start of an in-progress selection (first tap), before the range closes. */
    const [pendingStart, setPendingStart] = React.useState<Date | null>(null);
    const [hovered, setHovered] = React.useState<Date | null>(null);

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
        const [from, to] = isBefore(day, pendingStart) ? [day, pendingStart] : [pendingStart, day];
        setPendingStart(null);
        setHovered(null);
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

    return (
        <div className={className}>
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
                                edge ? "bg-accent-primary font-bold text-white" : "hover:bg-muted",
                            )}
                        >
                            {format(day, "d")}
                        </button>
                    );
                })}
            </div>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {pendingStart ? `Inicio: ${formatDayLabel(pendingStart)} — elige el fin` : "Elige la fecha de inicio"}
            </p>
        </div>
    );
}
