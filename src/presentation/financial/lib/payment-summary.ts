import { formatBankNumber } from "@/lib/format-bank-number";
import type { BankAccount, BankCard } from "@/domain/entities/bank";

export interface PaymentSourceRef {
    accountId?: string | null;
    cardId?: string | null;
    paidWithCredit?: boolean | null;
}

/**
 * Con qué se pagó, en una línea.
 *
 * Nombra la cuenta o la tarjeta cuando el movimiento está atado a una: es lo
 * que el usuario reconoce, y «Efectivo o débito» a secas no distingue entre sus
 * tres cuentas. Ese texto genérico queda solo para cuando no hay nada atado,
 * que es lo único que se puede afirmar entonces.
 *
 * La tarjeta manda sobre la cuenta: se pagó con la tarjeta, y la cuenta de la
 * que descuenta es un detalle interno del débito.
 */
export function describePaymentSource(
    source: PaymentSourceRef,
    accounts: readonly BankAccount[],
    cards: readonly BankCard[],
): string {
    const card = source.cardId ? cards.find(c => c.id === source.cardId) : undefined;
    if (card) return join(card.name, formatBankNumber(card, "CARD"));

    const account = source.accountId ? accounts.find(a => a.id === source.accountId) : undefined;
    if (account) return join(account.name, formatBankNumber(account, "ACCOUNT"));

    return source.paidWithCredit ? "Tarjeta de crédito" : "Efectivo o débito";
}

/** Si el texto es el genérico, no una cuenta concreta. */
export function isGenericPaymentLabel(label: string): boolean {
    return label === "Tarjeta de crédito" || label === "Efectivo o débito";
}

function join(name: string, number: string): string {
    return number ? `${name} · ${number}` : name;
}
