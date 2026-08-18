"use client";

import { cn } from "@/lib/utils";
import { acronymTone, type IdentityTone } from "@/lib/bank-identity-label";

const TONE_CLASS: Record<IdentityTone, string> = {
    savings: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400",
    checking: "border-sky-500/35 bg-sky-500/10 text-sky-400",
    credit: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    debit: "border-blue-500/40 bg-blue-500/10 text-blue-400",
    muted: "border-border/50 bg-bg-secondary/60 text-text-tertiary",
};

export interface IdentityBadgeProps {
    /** Tres letras: «AHO», «CTE», «TCR», «TDE», «TER», «DES». */
    acronym: string;
    /** Qué significan esas letras, para quien no las reconozca todavía. */
    title?: string;
    className?: string;
}

/**
 * Qué es una cuenta o una tarjeta, en tres letras y con color.
 *
 * Va delante del número porque es lo que primero hace falta saber: «••••0814»
 * a secas no distingue unos ahorros de una tarjeta de crédito, y de eso depende
 * si el gasto pesa hoy o cuando se pague la tarjeta.
 *
 * Siempre tres letras y el mismo ancho: en una lista, un largo distinto por
 * fila rompe la columna y obliga a buscar el dato en cada línea.
 */
export function IdentityBadge({ acronym, title, className }: IdentityBadgeProps) {
    return (
        <span
            title={title}
            aria-label={title ?? acronym}
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-md border px-1.5 py-[3px]",
                "font-mono text-[10px] font-bold leading-none tracking-[0.06em]",
                TONE_CLASS[acronymTone(acronym)],
                className,
            )}
        >
            {acronym}
        </span>
    );
}
