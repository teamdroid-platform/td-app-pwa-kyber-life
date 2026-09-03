"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import type { PeriodScope } from "@/domain/entities/period";
import { MAX_CYCLE_START_DAY, MIN_CYCLE_START_DAY } from "@/domain/entities/period";
import { cycleRangeContaining } from "@/lib/date-range";
import { setCycleStartDayAction } from "@/app/actions/period-settings";
import { Button } from "@/components/ui/button";

const SCOPE_QUESTION: Record<PeriodScope, string> = {
    FINANCIAL: "¿Qué día empieza tu mes financiero?",
    MARKET: "¿Qué día empieza tu mes de compras?",
};

const SCOPE_HINT: Record<PeriodScope, string> = {
    FINANCIAL: "Decide el rango que traen puestos el tablero, el resumen y la lista de transacciones.",
    MARKET: "Decide el rango que trae puesta la analítica de compras.",
};

/** El primer día en que un mes corto puede quedarse sin ese número. */
const SHORT_MONTH_THRESHOLD = 29;

const DAYS = Array.from(
    { length: MAX_CYCLE_START_DAY - MIN_CYCLE_START_DAY + 1 },
    (_, i) => MIN_CYCLE_START_DAY + i,
);

/**
 * El nombre con el que un lector de pantalla anuncia cada celda.
 *
 * Los dos extremos con significado propio lo dicen: el día 1 es el mes
 * natural, y los que un mes corto puede no tener quedan advertidos antes de
 * elegirlos, no solo después.
 */
function dayLabel(day: number): string {
    if (day === MIN_CYCLE_START_DAY) return `Día ${day} — mes natural`;
    if (day >= SHORT_MONTH_THRESHOLD) return `Día ${day} — mes corto`;
    return `Día ${day}`;
}

/** «22 ago – 21 sep 2026», con el año una sola vez al final. */
function formatCycle(range: { start: string; end: string }): string {
    const fmt = (value: string, withYear: boolean) =>
        new Date(`${value}T00:00:00`).toLocaleDateString("es-EC", {
            day: "numeric",
            month: "short",
            ...(withYear ? { year: "numeric" } : {}),
        });
    return `${fmt(range.start, false)} – ${fmt(range.end, true)}`;
}

/** Los `n` ciclos que siguen al que contiene hoy. */
function nextCycles(cycleStartDay: number, n: number): { start: string; end: string }[] {
    const cycles: { start: string; end: string }[] = [];
    let cursor = cycleRangeContaining(cycleStartDay);

    for (let i = 0; i < n; i++) {
        const dayAfter = new Date(`${cursor.end}T00:00:00`);
        dayAfter.setDate(dayAfter.getDate() + 1);
        cursor = cycleRangeContaining(cycleStartDay, dayAfter);
        cycles.push(cursor);
    }
    return cycles;
}

interface PeriodSettingsManagerProps {
    scope: PeriodScope;
    cycleStartDay: number;
    /** Solo en Compras: el ciclo financiero, como referencia informativa. */
    financialCycleStartDay?: number;
}

/**
 * El día en que empieza el mes del usuario, para un ámbito.
 *
 * La vista previa se recalcula con el valor del selector antes de guardar, así
 * que el usuario ve el efecto de su elección sin comprometerla.
 */
export function PeriodSettingsManager({
    scope, cycleStartDay, financialCycleStartDay,
}: PeriodSettingsManagerProps) {
    const router = useRouter();
    const [day, setDay] = useState(cycleStartDay);
    const [isPending, startTransition] = useTransition();

    const current = useMemo(() => cycleRangeContaining(day), [day]);
    const upcoming = useMemo(() => nextCycles(day, 2), [day]);
    const financialReference = useMemo(
        () => (financialCycleStartDay ? cycleRangeContaining(financialCycleStartDay) : null),
        [financialCycleStartDay],
    );

    function save() {
        startTransition(async () => {
            const result = await setCycleStartDayAction({ scope, cycleStartDay: day });
            if (result.success) {
                toast.success("Periodo guardado");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">{SCOPE_QUESTION[scope]}</h3>
                <p className="text-sm text-muted-foreground">{SCOPE_HINT[scope]}</p>
            </div>

            <fieldset className="space-y-3">
                <legend className="sr-only">Día de inicio del mes</legend>

                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {DAYS.map(d => (
                        <label key={d} className="block">
                            <input
                                type="radio"
                                name={`cycle-start-day-${scope}`}
                                value={d}
                                checked={day === d}
                                onChange={() => setDay(d)}
                                aria-label={dayLabel(d)}
                                className="peer sr-only"
                            />
                            <span
                                className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border bg-card/40
                                    text-sm font-medium tabular-nums text-muted-foreground transition-colors
                                    hover:bg-accent hover:text-accent-foreground
                                    peer-checked:border-accent-primary peer-checked:bg-accent-primary peer-checked:font-semibold peer-checked:text-white
                                    peer-focus-visible:ring-2 peer-focus-visible:ring-accent-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-primary
                                    ${d >= SHORT_MONTH_THRESHOLD ? "border-dashed border-orange-500/40" : "border-border/60"}`}
                            >
                                {d}
                            </span>
                        </label>
                    ))}
                </div>

                <p className="text-xs text-muted-foreground">
                    El día 1 es el mes natural. Los días {SHORT_MONTH_THRESHOLD} a {MAX_CYCLE_START_DAY} no
                    existen en todos los meses.
                </p>
            </fieldset>

            <div className="rounded-xl border bg-card/50 p-4 space-y-3">
                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tu ciclo actual</p>
                    <p data-testid="cycle-preview-current" className="text-base font-medium text-foreground">
                        <span className="sr-only">{`${current.start} ${current.end}`}</span>
                        {formatCycle(current)}
                    </p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Siguientes</p>
                    <p className="text-sm text-muted-foreground">
                        {upcoming.map(formatCycle).join(" · ")}
                    </p>
                </div>
            </div>

            {day >= SHORT_MONTH_THRESHOLD && (
                <div
                    data-testid="short-month-warning"
                    className="flex gap-3 rounded-xl border border-orange-500/50 bg-orange-500/10 p-4 text-sm text-orange-400"
                >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                        En los meses que no llegan al día {day}, el ciclo empieza el último día
                        disponible, así que ese ciclo puede quedar más corto que un mes completo.
                    </p>
                </div>
            )}

            {financialReference && (
                <p data-testid="financial-cycle-reference" className="text-sm text-muted-foreground">
                    <span className="sr-only">{`${financialReference.start} ${financialReference.end}`}</span>
                    Tu ciclo financiero es {formatCycle(financialReference)}.
                </p>
            )}

            <Button onClick={save} disabled={isPending} className="w-full sm:w-auto">
                {isPending ? "Guardando…" : "Guardar"}
            </Button>
        </div>
    );
}
