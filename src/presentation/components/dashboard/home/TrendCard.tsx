import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact, formatMoney, formatDayLabel, linePath, seriesDomain } from "@/lib/home-overview";
import { CARD, CardHeader, Pill } from "./ui";

/** El color de cada línea, en el mismo orden en que se leen las tres cifras. */
const LINES = [
    { key: "income", label: "Ingresos", color: "#34d399" },
    { key: "expenses", label: "Gastos", color: "#a78bfa" },
    { key: "net", label: "Ahorro", color: "#38bdf8" },
] as const;

export interface TrendCardProps {
    /** Un punto por día del periodo, en orden. */
    dates: readonly string[];
    income: readonly number[];
    expenses: readonly number[];
    net: readonly number[];
    totals: { income: number; expenses: number; net: number };
    currency: string;
    /** «Este mes». Rotula el periodo del que hablan las cifras. */
    periodLabel: string;
}

/**
 * El flujo del periodo: cuánto entró, cuánto salió y qué quedó.
 *
 * Las tres líneas comparten escala a propósito —ver {@link seriesDomain}— y no
 * llevan más ejes que tres marcas verticales y las fechas de los extremos: lo
 * que se busca aquí es la forma, y el detalle está a un clic en el panel.
 */
export function TrendCard({ dates, income, expenses, net, totals, currency, periodLabel }: TrendCardProps) {
    const viewport = { width: 320, height: 120, padding: 4, domain: seriesDomain(income, expenses, net) };
    const series = { income, expenses, net };
    const empty = dates.length === 0;

    // Tres marcas: el techo de la escala, la mitad y el suelo.
    const ticks = [viewport.domain.max, (viewport.domain.max + viewport.domain.min) / 2, viewport.domain.min];
    const dayLabels = pickLabels(dates, 5);

    return (
        <section className={cn(CARD, "flex flex-col gap-4 p-4")}>
            <CardHeader
                icon={<BarChart3 className="h-4 w-4" />}
                tint="emerald"
                title="Panel financiero"
                subtitle="Resumen de saldos y flujo"
                action={<Pill>{periodLabel}</Pill>}
            />

            <div className="grid grid-cols-3 gap-3">
                {LINES.map(({ key, label, color }) => (
                    <div key={key} className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                            <span className="truncate">{label}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[17px] font-semibold tabular-nums text-text-primary">
                            {formatMoney(totals[key], currency)}
                        </span>
                    </div>
                ))}
            </div>

            {empty ? (
                <p className="flex flex-1 items-center justify-center py-8 text-center text-[12px] text-text-tertiary">
                    Todavía no hay movimientos en este periodo.
                </p>
            ) : (
                <div className="flex flex-1 gap-2">
                    {/* Los números del eje van en HTML y no dentro del SVG: el trazado
                        se estira con `preserveAspectRatio="none"` para llenar el ancho,
                        y ese mismo estirón deformaría el texto. */}
                    <div className="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-text-tertiary">
                        {ticks.map((tick, index) => <span key={index}>{formatCompact(tick)}</span>)}
                    </div>

                    <div className="min-w-0 flex-1">
                        <svg
                            aria-hidden viewBox="0 0 320 120" preserveAspectRatio="none"
                            className="h-32 w-full"
                        >
                            {ticks.map((_, index) => (
                                <line
                                    key={index}
                                    x1="0" x2="320"
                                    y1={(index / (ticks.length - 1)) * 120}
                                    y2={(index / (ticks.length - 1)) * 120}
                                    stroke="currentColor" strokeWidth="1"
                                    className="text-border-base"
                                />
                            ))}
                            {LINES.map(({ key, color }) => (
                                <path
                                    key={key}
                                    d={linePath(series[key], viewport)}
                                    fill="none" stroke={color} strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}
                        </svg>
                        <div className="mt-1.5 flex justify-between text-[10px] text-text-tertiary">
                            {dayLabels.map(date => <span key={date}>{formatDayLabel(date)}</span>)}
                        </div>
                    </div>
                </div>
            )}

            <Link
                href="/financial"
                className="flex items-center justify-center gap-1 rounded-xl border border-border-base py-2 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
                Ver panel financiero
                <ChevronRight className="h-3.5 w-3.5" />
            </Link>
        </section>
    );
}

/** `count` fechas repartidas por igual, siempre con la primera y la última. */
function pickLabels(dates: readonly string[], count: number): string[] {
    if (dates.length <= count) return [...dates];
    const step = (dates.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, index) => dates[Math.round(index * step)]);
}
