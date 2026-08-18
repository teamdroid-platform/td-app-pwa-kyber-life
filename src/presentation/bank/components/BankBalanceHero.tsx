"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, shortDate } from "../lib/format-money";

interface BankBalanceHeroProps {
    totalAvailable: number;
    totalDebt: number;
    totalAvailableCredit: number;
    /**
     * Efectivo del usuario. Ausente en el detalle de una cuenta, donde la fila
     * de apoyo no aplica: ahí la cifra grande ya es toda la respuesta.
     */
    cashBalance?: number;
    nextDueDate?: string | null;
}

/** Un dato de apoyo bajo la cifra grande. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: "muted" | "warn" }) {
    return (
        <div className="min-w-0 flex-1">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/45">{label}</p>
            <p className={cn(
                "mt-0.5 truncate text-[13px] font-semibold tabular-nums",
                tone === "muted" ? "text-white/55" : tone === "warn" ? "text-amber-300" : "text-white/90",
            )}>
                {value}
            </p>
        </div>
    );
}

/**
 * La respuesta de la pantalla: cuánto hay disponible, y el contexto que la
 * matiza.
 *
 * El efectivo y el próximo pago vivían en dos tarjetas sueltas debajo. Son de
 * esta misma pregunta —cuánto tengo y qué debo— y separadas costaban su propio
 * borde, su propio fondo y setenta píxeles de alto para dos cifras.
 */
export function BankBalanceHero({
    totalAvailable, totalDebt, totalAvailableCredit, cashBalance, nextDueDate,
}: BankBalanceHeroProps) {
    const negative = totalAvailable < 0;

    return (
        <div className={cn(
            "relative overflow-hidden rounded-3xl px-5 py-4 shadow-lg shadow-black/30",
            negative
                ? "bg-gradient-to-br from-[#0d101d] from-40% to-[#26101c]"
                : "bg-gradient-to-br from-[#0d101d] from-40% to-[#0e2620]",
        )}>
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute -right-4 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-3xl",
                    negative ? "bg-rose-600/20" : "bg-emerald-600/20",
                )}
            />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-10 top-4 h-3 w-3 text-white/30" />
            <Sparkles aria-hidden="true" className="pointer-events-none absolute right-20 bottom-5 h-2 w-2 text-white/20" />

            <div className="relative flex flex-col gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        Disponible en cuentas
                    </p>
                    <h2 className={cn(
                        "mt-1.5 text-[2rem] font-bold leading-none tracking-tight tabular-nums",
                        negative ? "text-rose-400" : "text-emerald-400",
                    )}>
                        {negative && "−"}{money(totalAvailable)}
                    </h2>
                </div>

                {totalDebt > 0 && (
                    <div className="flex">
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-[11px] text-rose-200">
                            Debes {money(totalDebt)} en tarjetas
                        </span>
                    </div>
                )}

                {cashBalance !== undefined && (
                    <div className="flex gap-3 border-t border-white/10 pt-2.5">
                        <Fact
                            label="Cupo libre"
                            value={totalAvailableCredit > 0 ? money(totalAvailableCredit) : "—"}
                            tone={totalAvailableCredit > 0 ? undefined : "muted"}
                        />
                        <Fact
                            label="Efectivo"
                            value={money(cashBalance)}
                            tone={cashBalance > 0 ? undefined : "muted"}
                        />
                        <Fact
                            label="Próximo pago"
                            value={nextDueDate ? shortDate(nextDueDate) : "Ninguno"}
                            tone={nextDueDate ? "warn" : "muted"}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
