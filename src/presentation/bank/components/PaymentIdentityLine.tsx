"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { BankAccount, BankCard } from "@/domain/entities/bank";
import {
    ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL, CARD_TYPE_ACRONYM, CARD_TYPE_LABEL,
} from "@/lib/bank-identity-label";
import { formatIdentityNumber } from "@/lib/format-bank-number";
import { IdentityBadge } from "./IdentityBadge";

export interface PaymentIdentityLineProps {
    accountId?: string | null;
    cardId?: string | null;
    /** Cuenta a la que entró el dinero, cuando el movimiento tiene dos lados. */
    destinationAccountId?: string | null;
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
 *
 * Los dos lados, cuando los hay: un ingreso solo tiene destino y una
 * transferencia entre cuentas propias tiene los dos. Mostrar únicamente el
 * origen dejaba el resumen diciendo «Efectivo o débito» justo después de que
 * el usuario eligiera la cuenta a la que entró el dinero.
 */
export function PaymentIdentityLine({
    accountId, cardId, destinationAccountId, accounts, cards, fallback,
}: PaymentIdentityLineProps) {
    const card = cardId ? cards.find(c => c.id === cardId) : undefined;
    const source = card ?? (accountId ? accounts.find(a => a.id === accountId) : undefined);
    const destination = destinationAccountId
        ? accounts.find(a => a.id === destinationAccountId)
        : undefined;

    if (!source && !destination) return <>{fallback}</>;

    // La flecha solo aparece cuando hay algo que distinguir: con un único
    // origen —el caso de siempre— no añade información, solo ruido.
    const withArrows = !!destination;

    return (
        <span className="flex min-w-0 flex-col gap-1">
            {source && <Identity identity={source} arrow={withArrows ? "out" : null} />}
            {destination && <Identity identity={destination} arrow="in" />}
        </span>
    );
}

/** Una cuenta o tarjeta: acrónimo, cuatro últimos dígitos y emisor debajo. */
function Identity({ identity, arrow }: { identity: BankAccount | BankCard; arrow: "in" | "out" | null }) {
    const card = "cardType" in identity ? identity : undefined;
    const account = card ? undefined : identity as BankAccount;

    const acronym = card
        ? CARD_TYPE_ACRONYM[card.cardType]
        : ACCOUNT_TYPE_ACRONYM[account!.accountType];
    const meaning = card
        ? `Tarjeta de ${CARD_TYPE_LABEL[card.cardType].toLowerCase()}`
        : ACCOUNT_TYPE_LABEL[account!.accountType];
    const brand = card?.brand?.trim();
    const issuer = identity.institutionName?.trim();
    const Arrow = arrow === "in" ? ArrowDownLeft : ArrowUpRight;

    return (
        <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
                {arrow && (
                    <Arrow
                        aria-label={arrow === "in" ? "Entró" : "Salió"}
                        className={arrow === "in" ? "h-3.5 w-3.5 shrink-0 text-emerald-500" : "h-3.5 w-3.5 shrink-0 text-rose-500"}
                    />
                )}
                <IdentityBadge acronym={acronym} title={meaning} />
                <span className="font-mono text-sm">{formatIdentityNumber(identity)}</span>
            </span>
            {(brand || issuer) && (
                <span className="truncate text-[11px] text-text-tertiary">
                    {[brand, issuer].filter(Boolean).join(" · ")}
                </span>
            )}
        </span>
    );
}
