import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { areaPath, linePath } from "@/lib/home-overview";
import { CARD_LINK, IconTile, type Tint } from "./ui";

/** Colores de la línea de cada cifra, en pareja claro/oscuro para el degradado. */
const STROKE: Record<Tint, string> = {
    emerald: "#34d399",
    violet: "#a78bfa",
    sky: "#38bdf8",
    amber: "#fbbf24",
    cyan: "#22d3ee",
    blue: "#60a5fa",
    rose: "#fb7185",
    slate: "#94a3b8",
};

/**
 * La miniatura de la serie que hay detrás de la cifra.
 *
 * Sin ejes ni números a propósito: no está para leer valores —eso es lo que
 * hace la gráfica grande— sino para decir de un vistazo si la cifra viene
 * subiendo o bajando.
 */
function Sparkline({ values, tint, id }: { values: readonly number[]; tint: Tint; id: string }) {
    if (values.length < 2) return null;
    const viewport = { width: 96, height: 34, padding: 3 };

    return (
        <svg
            aria-hidden viewBox="0 0 96 34" preserveAspectRatio="none"
            className="h-7 w-20 shrink-0"
        >
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={STROKE[tint]} stopOpacity="0.35" />
                    <stop offset="1" stopColor={STROKE[tint]} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath(values, viewport)} fill={`url(#${id})`} />
            <path
                d={linePath(values, viewport)}
                fill="none" stroke={STROKE[tint]} strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round"
            />
        </svg>
    );
}

export interface StatTileProps {
    href: string;
    label: string;
    value: string;
    /** La línea de abajo: qué significa la cifra o contra qué se compara. */
    note: string;
    /** Sube, baja, o ni una cosa ni otra (entonces la nota va en gris). */
    trend?: "up" | "down" | "flat";
    /** Cuando subir es malo —los gastos—, la flecha arriba se pinta en ámbar. */
    invertTrendColor?: boolean;
    tint: Tint;
    /** La miniatura de la serie. Se usa cuando la cifra tiene historia diaria. */
    series?: readonly number[];
    /** El icono del módulo, para las cifras que no son una serie. */
    icon?: ReactNode;
    /** Identificador del degradado: dos `<defs>` con el mismo id se pisan. */
    gradientId: string;
}

/**
 * Una cifra del encabezado: qué es, cuánto, y cómo va.
 *
 * Es un enlace entero y no una tarjeta muerta con un enlace dentro: cada cifra
 * tiene un sitio donde se explica, y el usuario que la mira es justo el que
 * quiere ir allí.
 */
export function StatTile({
    href, label, value, note, trend = "flat", invertTrendColor, tint, series, icon, gradientId,
}: StatTileProps) {
    const Arrow = trend === "down" ? ArrowDownRight : ArrowUpRight;
    const good = invertTrendColor ? trend === "down" : trend === "up";

    return (
        <Link href={href} className={cn(CARD_LINK, "relative flex flex-col gap-2 overflow-hidden p-3.5")}>
            {/* La miniatura va detrás y no al lado de la cifra: compartiendo la
                fila le robaba cien píxeles, y el importe acababa cortado con
                puntos suspensivos —una cantidad a medias no se puede leer—. */}
            {series && (
                <span className="pointer-events-none absolute right-2.5 top-2.5 opacity-60">
                    <Sparkline values={series} tint={tint} id={gradientId} />
                </span>
            )}

            <div className={cn("relative flex items-start justify-between gap-2", series && "pr-[84px]")}>
                <span className="min-w-0 truncate text-[12px] text-text-tertiary">{label}</span>
                {icon && <IconTile tint={tint} size="sm">{icon}</IconTile>}
            </div>

            {/* La cifra manda: nunca se corta, y si es larga encoge de cuerpo
                antes que perder dígitos. */}
            <span className={cn(
                "relative block whitespace-nowrap font-bold leading-none tracking-tight text-text-primary",
                value.length > 13 ? "text-[17px]" : value.length > 10 ? "text-[19px]" : "text-[22px]",
            )}>
                {value}
            </span>

            <span className={cn(
                "relative flex items-center gap-1 text-[11px] font-medium",
                trend === "flat"
                    ? "text-text-tertiary"
                    : good ? "text-emerald-400" : "text-amber-400",
            )}>
                {trend !== "flat" && <Arrow className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{note}</span>
            </span>
        </Link>
    );
}
