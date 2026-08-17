"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { formatBankNumber } from "@/lib/format-bank-number";
import { cardLabel } from "@/lib/bank-identity-label";
import { money } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankCardWithDebt } from "@/application/services/bank-service";

interface CardRowProps {
    card: BankCardWithDebt;
    /** Nombre de la cuenta atada, solo para tarjetas de débito. */
    accountName?: string;
    /**
     * Acción de mantenimiento a la derecha. Va fuera del enlace: anidar un
     * botón dentro de un `<a>` deja la fila sin saber qué hacer al tocarla.
     */
    action?: React.ReactNode;
}

export function CardRow({ card, accountName, action }: CardRowProps) {
    const isCredit = card.cardType === "CREDIT";
    const number = formatBankNumber(card, "CARD");

    const row = (
        <Link
            href={`/financial/banks/cards/${card.id}`}
            className="flex flex-1 items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/50"
        >
            <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                isCredit ? "bg-rose-500/15 text-rose-500" : "bg-slate-500/15 text-slate-500",
            )}>
                <CreditCard className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{cardLabel(card)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {isCredit ? "Crédito" : "Débito"}
                    {number && ` · ${number}`}
                    {isCredit && card.statementDay && ` · corte ${card.statementDay}`}
                    {!isCredit && accountName && ` → ${accountName}`}
                    {/* Una detectada por un escaneo no entra a los saldos hasta
                        que el usuario la revisa; decirlo aquí evita que parezca
                        que las cuentas no cuadran. */}
                    {card.isUnconfirmed && (
                        <span className="text-amber-500"> · sin revisar</span>
                    )}
                    {!isCredit && !card.accountId && (
                        <span className="text-amber-500"> · sin cuenta</span>
                    )}
                </span>
            </span>

            <span className="shrink-0 text-right tabular-nums">
                {isCredit ? (
                    <>
                        <span className="block text-sm font-semibold text-rose-500">
                            −{money(card.debt)}
                        </span>
                        {card.creditLimit != null && (
                            <span className="block text-[10px] text-muted-foreground">
                                de {money(card.creditLimit)}
                            </span>
                        )}
                    </>
                ) : (
                    // Una tarjeta de débito no tiene saldo propio: gasta el de su cuenta.
                    <span className="block max-w-[5.5rem] text-[10px] leading-tight text-muted-foreground">
                        usa el saldo de la cuenta
                    </span>
                )}
            </span>
        </Link>
    );

    if (!action) return row;

    return <div className="flex items-center gap-2">{row}{action}</div>;
}
