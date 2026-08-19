"use client";

import type { BankAccount, BankCard } from "@/domain/entities/bank";
import {
    ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL, CARD_TYPE_ACRONYM, CARD_TYPE_LABEL,
} from "@/lib/bank-identity-label";
import { formatIdentityNumber } from "@/lib/format-bank-number";
import { IdentityBadge } from "./IdentityBadge";

export interface PaymentIdentityLineProps {
    accountId?: string | null;
    cardId?: string | null;
    accounts: readonly BankAccount[];
    cards: readonly BankCard[];
    /** Qué mostrar cuando no hay nada atado. */
    fallback: React.ReactNode;
}

/**
 * Con qué se pagó, cuando se eligió a mano.
 *
 * Las mismas piezas que el recorrido de un escaneo —acrónimo, cuatro últimos
 * dígitos, emisor debajo— para que la fila se lea igual venga de donde venga.
 * Antes este camino mostraba «Ahorros ••••0814» en texto plano y el otro un
 * formato distinto: la misma pregunta contestada de dos maneras.
 *
 * La tarjeta manda sobre la cuenta: se pagó con la tarjeta, y de qué cuenta
 * descuenta un débito es un detalle interno.
 */
export function PaymentIdentityLine({
    accountId, cardId, accounts, cards, fallback,
}: PaymentIdentityLineProps) {
    const card = cardId ? cards.find(c => c.id === cardId) : undefined;
    const account = !card && accountId ? accounts.find(a => a.id === accountId) : undefined;

    if (!card && !account) return <>{fallback}</>;

    const acronym = card
        ? CARD_TYPE_ACRONYM[card.cardType]
        : ACCOUNT_TYPE_ACRONYM[account!.accountType];
    const meaning = card
        ? `Tarjeta de ${CARD_TYPE_LABEL[card.cardType].toLowerCase()}`
        : ACCOUNT_TYPE_LABEL[account!.accountType];
    const brand = card?.brand?.trim();
    const issuer = (card ?? account!).institutionName?.trim();

    return (
        <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
                <IdentityBadge acronym={acronym} title={meaning} />
                <span className="font-mono text-sm">{formatIdentityNumber(card ?? account!)}</span>
            </span>
            {(brand || issuer) && (
                <span className="truncate text-[11px] text-text-tertiary">
                    {[brand, issuer].filter(Boolean).join(" · ")}
                </span>
            )}
        </span>
    );
}
