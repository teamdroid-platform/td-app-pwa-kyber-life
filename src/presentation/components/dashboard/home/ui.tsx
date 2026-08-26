import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * La piel común de todas las tarjetas del inicio.
 *
 * Está en una constante y no repetida tarjeta por tarjeta porque el parecido
 * entre ellas es lo que hace que la pantalla se lea como una sola cosa: en
 * cuanto una tiene otro radio u otro borde, salta a la vista antes que su
 * contenido.
 */
export const CARD = "relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 backdrop-blur-sm dark:border-indigo-500/20 dark:bg-slate-900/60 dark:shadow-md dark:shadow-black/20";

/** Tarjeta que además reacciona al cursor: se usa cuando lleva a algún sitio. */
export const CARD_LINK = cn(CARD, "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-300 dark:hover:shadow-lg dark:hover:border-indigo-500/40 active:scale-[0.99]");

/** Los tintes de cada módulo, para que el color diga de qué habla la ficha. */
export const TINT = {
    emerald: "border border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400",
    violet: "border border-violet-500/20 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300",
    red: "border border-red-500/20 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
    sky: "border border-sky-500/20 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
    amber: "border border-amber-500/20 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400",
    cyan: "border border-cyan-500/20 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-300",
    blue: "border border-blue-500/20 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
    rose: "border border-rose-500/20 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
    slate: "border border-slate-500/20 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-300",
} as const;

export type Tint = keyof typeof TINT;

/** El cuadrado de color que precede a casi todo: icono del módulo. */
export function IconTile({ tint, size = "md", children }: { tint: Tint; size?: "sm" | "md"; children: ReactNode }) {
    return (
        <span className={cn(
            "grid shrink-0 place-items-center rounded-xl",
            size === "sm" ? "h-8 w-8" : "h-9 w-9",
            TINT[tint],
        )}>
            {children}
        </span>
    );
}

/** Rótulo de sección: dice de qué va el bloque sin competir con su contenido. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
    return (
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-semibold text-text-secondary">{children}</h2>
            {action}
        </div>
    );
}

/** Cabecera dentro de una tarjeta: icono, título, subtítulo y algo a la derecha. */
export function CardHeader({
    icon, tint, title, subtitle, action,
}: { icon: ReactNode; tint: Tint; title: string; subtitle?: string; action?: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
                <IconTile tint={tint} size="sm">{icon}</IconTile>
                <span className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-text-primary">{title}</h2>
                    {subtitle && (
                        <span className="block truncate text-[12px] text-text-tertiary">{subtitle}</span>
                    )}
                </span>
            </div>
            {action}
        </div>
    );
}

/** Píldora de solo lectura: rotula, no promete que se pueda pulsar. */
export function Pill({ children }: { children: ReactNode }) {
    return (
        <span className="shrink-0 rounded-full border border-border-base bg-bg-tertiary/50 px-3 py-1 text-[12px] font-medium text-text-secondary">
            {children}
        </span>
    );
}
