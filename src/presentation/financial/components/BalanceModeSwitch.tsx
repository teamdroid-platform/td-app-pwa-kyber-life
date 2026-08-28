"use client";

import { ChevronDown, AlertCircle } from "lucide-react";
import type { BalanceSet } from "@/application/services/balance-service";
import { type BalanceMode, BALANCE_MODES } from "@/domain/entities/balance";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
    DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat("es-EC", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

const MODE_LABEL: Record<BalanceMode, string> = {
    TOTAL: "Balance total",
    PERIOD: "Balance del periodo",
    PERIOD_WITH_CREDIT: "Balance con tarjetas",
};

const MODE_SHORT: Record<BalanceMode, string> = {
    TOTAL: "Total",
    PERIOD: "Del periodo",
    PERIOD_WITH_CREDIT: "Con tarjetas",
};

/** El valor que le toca a cada modo, para pintarlo y para el resumen. */
export function balanceValue(balances: BalanceSet, mode: BalanceMode): number {
    if (mode === "TOTAL") return balances.total.value;
    if (mode === "PERIOD_WITH_CREDIT") return balances.withCredit.value;
    return balances.period.value;
}

/** La línea que explica de dónde sale el número de cada modo. */
export function balanceModeCopy(
    mode: BalanceMode,
    balances: BalanceSet,
    rangeLabel: string,
): string {
    const money = (v: number) => formatCurrency(v, balances.currency);

    if (mode === "TOTAL") {
        return `Suma de los saldos de tus ${balances.total.accountsCounted} cuentas con saldo declarado. No depende del rango ni de tu configuración.`;
    }
    if (mode === "PERIOD") {
        return `Ingresos menos gastos reales del ${rangeLabel}, restando ahorros y sumando fondeos. Los consumos con tarjeta no cuentan hasta que pagas.`;
    }
    return `Igual que el del periodo, restando además ${money(balances.withCredit.creditDeferred)} de consumos con tarjeta del ${rangeLabel}.`;
}

interface BalanceModeSwitchProps {
    balances: BalanceSet;
    mode: BalanceMode;
    onModeChange: (mode: BalanceMode) => void;
    /** Etiqueta legible del rango activo, p. ej. "22 ago – 21 sep". */
    rangeLabel: string;
    size?: "hero" | "compact";
    className?: string;
}

/**
 * La etiqueta del balance ES el control. Un solo gesto cubre las tres cosas:
 * cambiar de balance, explicar el cálculo, y ver los tres números a la vez —
 * que es lo que uno quiere cuando duda de una cifra.
 */
export function BalanceModeSwitch({
    balances, mode, onModeChange, rangeLabel, size = "hero", className,
}: BalanceModeSwitchProps) {
    const missing = balances.total.accountsWithoutSnapshot.length;

    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger
                    className={cn(
                        "flex w-fit items-center gap-1 rounded-lg font-medium transition-colors hover:text-text-primary",
                        size === "hero" ? "text-sm text-white/85" : "text-xs text-text-secondary",
                    )}
                >
                    {MODE_LABEL[mode]}
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(next) => onModeChange(next as BalanceMode)}
                    >
                        {BALANCE_MODES.map((option) => (
                            <DropdownMenuRadioItem
                                key={option}
                                value={option}
                                className="flex-col items-start gap-1 py-2.5"
                            >
                                <span className="flex w-full items-baseline justify-between gap-3">
                                    <span className="font-medium">{MODE_SHORT[option]}</span>
                                    <span className="tabular-nums font-semibold">
                                        {formatCurrency(balanceValue(balances, option), balances.currency)}
                                    </span>
                                </span>
                                <span className="text-xs leading-snug text-text-secondary">
                                    {balanceModeCopy(option, balances, rangeLabel)}
                                </span>
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>

            {mode === "TOTAL" && missing > 0 && (
                <a
                    href="/financial/balances"
                    className="flex w-fit items-center gap-1.5 text-[11px] font-medium text-amber-500 hover:underline"
                >
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {missing === 1
                        ? "1 cuenta sin saldo declarado"
                        : `${missing} cuentas sin saldo declarado`}
                </a>
            )}
        </div>
    );
}
