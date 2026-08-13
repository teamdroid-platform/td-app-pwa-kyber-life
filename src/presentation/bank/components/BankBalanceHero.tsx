"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "../lib/format-money";

interface BankBalanceHeroProps {
    totalAvailable: number;
    totalDebt: number;
    totalAvailableCredit: number;
}

/**
 * Panel de cabecera del resumen. Sigue el patrón de `BalanceHeroCard` del
 * módulo financiero: gradiente oscuro que vira a rojo cuando el disponible es
 * negativo, con la cifra en grande y el contexto en píldoras.
 */
export function BankBalanceHero({
    totalAvailable, totalDebt, totalAvailableCredit,
}: BankBalanceHeroProps) {
    const negative = totalAvailable < 0;

    return (
        <div className={cn(
            "relative overflow-hidden rounded-3xl px-5 py-4 shadow-lg shadow-black/30",
            negative
                ? "bg-gradient-to-r from-[#0d101d] from-45% to-[#26101c]"
                : "bg-gradient-to-r from-[#0d101d] from-45% to-[#0e2620]",
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

            <div className="relative flex flex-col gap-2.5">
                <p className="text-sm font-medium text-white/85">Disponible en cuentas</p>

                <h2 className={cn(
                    "text-[2rem] font-bold leading-none tracking-tight tabular-nums",
                    negative ? "text-rose-400" : "text-emerald-400",
                )}>
                    {negative && "−"}{money(totalAvailable)}
                </h2>

                <div className="flex flex-wrap gap-2">
                    {totalDebt > 0 && (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-[11px] text-rose-200">
                            Debes {money(totalDebt)} en tarjetas
                        </span>
                    )}
                    {totalAvailableCredit > 0 && (
                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/80">
                            Cupo libre {money(totalAvailableCredit)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
