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
export const CARD = "rounded-2xl border border-border-base bg-bg-secondary/70 backdrop-blur-[2px]";

/** Tarjeta que además reacciona al cursor: se usa cuando lleva a algún sitio. */
export const CARD_LINK = cn(CARD, "transition-colors hover:border-border-strong hover:bg-bg-secondary");

/** Los tintes de cada módulo, para que el color diga de qué habla la ficha. */
export const TINT = {
    emerald: "bg-emerald-500/15 text-emerald-400",
    violet: "bg-violet-500/15 text-violet-300",
    red: "bg-red-500/15 text-red-400",
    sky: "bg-sky-500/15 text-sky-300",
    amber: "bg-amber-500/15 text-amber-400",
    cyan: "bg-cyan-500/15 text-cyan-300",
    blue: "bg-blue-500/15 text-blue-300",
    rose: "bg-rose-500/15 text-rose-300",
    slate: "bg-slate-500/15 text-slate-300",
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
