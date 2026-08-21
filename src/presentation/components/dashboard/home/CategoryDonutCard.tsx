import Link from "next/link";
import { ChevronRight, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { donutArcs, formatMoney, formatPercent, type DonutSlice } from "@/lib/home-overview";
import { CARD, CardHeader } from "./ui";

/**
 * La paleta del anillo, en orden de porción.
 *
 * Es la del panel de compras —la misma lista de `TopProductsChart`, el anillo
 * de productos más comprados—, no una elegida aquí: esta tarjeta lleva a ese
 * panel, y una categoría que cambia de color al hacer clic obliga a
 * reconstruir la lectura.
 */
export const DONUT_COLORS = ["#5b4dff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export interface CategoryDonutCardProps {
    /** Categorías ya ordenadas de mayor a menor, con su color asignado. */
    slices: readonly DonutSlice[];
    total: number;
    currency: string;
    /** Qué periodo cubre el total. Aquí es todo el historial de compras. */
    caption: string;
}

/**
 * En qué se va el gasto del súper, sobre todo el historial de compras.
 *
 * El anillo se dibuja con trazo y no con sectores rellenos —ver `donutArcs`—,
 * y el total va en el centro porque es la cifra contra la que se leen los
 * porcentajes de al lado.
 */
export function CategoryDonutCard({ slices, total, currency, caption }: CategoryDonutCardProps) {
    const radius = 46;
    const arcs = donutArcs(slices, radius);

    return (
        <section className={cn(CARD, "flex flex-col gap-4 p-4")}>
            <CardHeader
                icon={<ShoppingCart className="h-4 w-4" />}
                tint="cyan"
                title="Panel de compras"
                subtitle={caption}
            />

            {arcs.length === 0 ? (
                <p className="flex flex-1 items-center justify-center py-8 text-center text-[12px] text-text-tertiary">
                    Todavía no hay compras cerradas con las que repartir el gasto.
                </p>
            ) : (
                <div className="flex flex-1 flex-col items-center gap-3 sm:flex-row sm:items-center">
                    <div className="relative shrink-0">
                        {/* El `viewBox` va justo al diámetro del anillo: cualquier
                            margen de más lo encoge dentro del mismo hueco. El tamaño
                            en pantalla lo pone la clase, y el trazo escala con él. */}
                        <svg aria-hidden viewBox="-53 -53 106 106" className="h-[168px] w-[168px]">
                            <circle
                                r={radius} fill="none" strokeWidth="13"
                                stroke="currentColor" className="text-bg-tertiary/60"
                            />
                            {arcs.map(arc => (
                                <path
                                    key={arc.label}
                                    d={arc.d} fill="none" stroke={arc.color}
                                    strokeWidth="13" strokeLinecap="butt"
                                />
                            ))}
                        </svg>
                        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[17px] font-bold tabular-nums text-text-primary">
                                {formatMoney(total, currency)}
                            </span>
                            <span className="text-[11px] text-text-tertiary">Total gastado</span>
                        </span>
                    </div>

                    <ul className="w-full min-w-0 flex-1 space-y-1.5">
                        {arcs.map(arc => (
                            <li key={arc.label} className="flex items-center gap-2 text-[12px]">
                                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: arc.color }} />
                                <span className="min-w-0 flex-1 truncate text-text-secondary">{arc.label}</span>
                                <span className="shrink-0 tabular-nums text-text-tertiary">
                                    {formatPercent(arc.percentage, 0)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <Link
                href="/market/analytics"
                className="flex items-center justify-center gap-1 rounded-xl border border-border-base py-2 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
                Ver análisis completo
                <ChevronRight className="h-3.5 w-3.5" />
            </Link>
        </section>
    );
}
