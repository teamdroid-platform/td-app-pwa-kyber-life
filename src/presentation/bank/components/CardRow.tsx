"use client";

import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";
import { formatLastFour } from "@/lib/format-bank-number";
import { CARD_TYPE_ACRONYM, CARD_TYPE_LABEL } from "@/lib/bank-identity-label";
import { IdentityBadge } from "./IdentityBadge";
import { money } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankCardWithDebt } from "@/application/services/bank-service";

interface CardRowProps {
    card: BankCardWithDebt;
    /** Nombre de la cuenta atada, solo para tarjetas de débito. */
    accountName?: string;
}

/**
 * Una tarjeta dentro del grupo de su emisor. Mismo trato que {@link AccountRow}:
 * acrónimo, número, y en la segunda línea solo lo que aporta —la marca, el
 * corte, la cuenta de la que descuenta un débito—.
 */
export function CardRow({ card, accountName }: CardRowProps) {
    const isCredit = card.cardType === "CREDIT";
    const number = formatLastFour(card);

    // Sin deuda es cero, no «menos cero»: el rojo se reserva para lo que de
    // verdad se debe, o dejaría de significar nada.
    const owes = isCredit && card.debt > 0;

    const context = [
        card.brand?.trim() || CARD_TYPE_LABEL[card.cardType],
        isCredit && card.statementDay ? `corte ${card.statementDay}` : null,
        !isCredit && accountName ? `→ ${accountName}` : null,
    ].filter(Boolean).join(" · ");

    return (
        <Link
            href={`/financial/banks/cards/${card.id}`}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
        >
            <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                isCredit ? "bg-amber-500/12 text-amber-500" : "bg-blue-500/12 text-blue-500",
            )}>
                <CreditCard className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <IdentityBadge
                        acronym={CARD_TYPE_ACRONYM[card.cardType]}
                        title={`Tarjeta de ${CARD_TYPE_LABEL[card.cardType].toLowerCase()}`}
                    />
                    {number && <span className="font-mono text-sm font-semibold">{number}</span>}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                    {context}
                    {card.isUnconfirmed && <span className="text-amber-500"> · sin revisar</span>}
                    {!isCredit && !card.accountId && <span className="text-amber-500"> · sin cuenta</span>}
                </span>
            </span>

            <span className="shrink-0 text-right tabular-nums">
                {isCredit ? (
                    <>
                        <span className={cn(
                            "block text-sm font-semibold",
                            owes ? "text-rose-500" : "text-muted-foreground",
                        )}>
                            {owes ? `−${money(card.debt)}` : "Sin deuda"}
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

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
    );
}
