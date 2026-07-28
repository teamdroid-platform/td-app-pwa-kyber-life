"use client";

import { cn } from "@/lib/utils";
import { DateTimeStepInput } from "@/components/ui/datetime-step-input";
import { APP_TIMEZONE, roundToNearestFiveMinutes, toDateTimeLocalValue, zonedNow } from "@/lib/date-range";
import { StepHeading } from "../WizardShell";

/** Wall-clock value for "right now", rounded like the create form has always done. */
export function nowValue(): string {
    return toDateTimeLocalValue(roundToNearestFiveMinutes(zonedNow()));
}

/** Same moment, one day earlier — the other case that covers almost everything. */
function yesterdayValue(): string {
    const d = zonedNow();
    d.setDate(d.getDate() - 1);
    return toDateTimeLocalValue(roundToNearestFiveMinutes(d));
}

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function describe(value: string): string {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return DAY_NAMES[parsed.getDay()] ?? "";
}

interface DateStepProps {
    value: string;
    onChange: (value: string) => void;
}

/**
 * Step 5 — when it happened.
 *
 * It arrives pre-filled with "now", so it closes the walk-through with a
 * confirmation rather than with work; the shortcuts resolve the common cases
 * without opening the pickers at all.
 */
export function DateStep({ value, onChange }: DateStepProps) {
    const now = nowValue();
    const yesterday = yesterdayValue();
    // Compare by day: the shortcut is about the date, not the exact minute.
    const day = value.slice(0, 10);
    const shortcuts: { label: string; value: string; active: boolean }[] = [
        { label: "Ahora", value: now, active: day === now.slice(0, 10) },
        { label: "Ayer", value: yesterday, active: day === yesterday.slice(0, 10) },
    ];

    return (
        <>
            <StepHeading question="¿Cuándo ocurrió?" />

            <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut) => (
                    <button
                        key={shortcut.label}
                        type="button"
                        onClick={() => onChange(shortcut.value)}
                        aria-pressed={shortcut.active}
                        className={cn(
                            "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                            shortcut.active
                                ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary"
                                : "border-border/40 bg-bg-secondary/60 text-text-secondary hover:text-text-primary",
                        )}
                    >
                        {shortcut.label}
                    </button>
                ))}
            </div>

            <div className="rounded-2xl border border-border/40 bg-bg-secondary/40 p-3">
                <DateTimeStepInput id="date" value={value} onChange={onChange} minuteStep={5} required />
                {describe(value) && (
                    <p className="mt-2 text-center text-xs capitalize text-text-tertiary">{describe(value)}</p>
                )}
            </div>

            <p className="text-center text-[11px] text-text-tertiary">Zona horaria de la app · {APP_TIMEZONE}</p>
        </>
    );
}
