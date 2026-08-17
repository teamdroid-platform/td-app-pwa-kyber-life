import { formatBankNumber } from "./format-bank-number";
import type { BankAccount, BankAccountType, BankCard, BankCardType } from "@/domain/entities/bank";

export const ACCOUNT_TYPE_LABEL: Record<BankAccountType, string> = {
    CHECKING: "Corriente",
    SAVINGS: "Ahorros",
    CASH: "Efectivo",
    INVESTMENT: "Inversión",
};

export const CARD_TYPE_LABEL: Record<BankCardType, string> = {
    CREDIT: "Crédito",
    DEBIT: "Débito",
};

/**
 * Cómo se llama una cuenta.
 *
 * Ni las cuentas ni las tarjetas tienen nombre: se reconocen por su número, y
 * lo demás es una etiqueta inventada que hay que mantener. Se compone de lo que
 * sí se sabe —el tipo y el número— y se calcula al mostrar, así que nunca queda
 * desfasada respecto a los datos.
 */
export function accountLabel(
    account: Pick<BankAccount, "accountType" | "lastFour" | "prefixDigits">,
): string {
    const number = formatBankNumber(account, "ACCOUNT");
    const type = ACCOUNT_TYPE_LABEL[account.accountType];
    return number ? `${type} ${number}` : type;
}

/**
 * Cómo se llama una tarjeta. La marca manda sobre el tipo cuando se conoce:
 * «Visa XXXX2780» distingue mejor que «Débito XXXX2780» entre dos débitos.
 */
export function cardLabel(
    card: Pick<BankCard, "cardType" | "brand" | "lastFour" | "prefixDigits">,
): string {
    const number = formatBankNumber(card, "CARD");
    const head = card.brand?.trim() || CARD_TYPE_LABEL[card.cardType];
    return number ? `${head} ${number}` : head;
}

/** La etiqueta de cualquiera de las dos, cuando el tipo se sabe en tiempo de ejecución. */
export function identityLabelOf(
    entity: BankAccount | BankCard, kind: "ACCOUNT" | "CARD",
): string {
    return kind === "CARD"
        ? cardLabel(entity as BankCard)
        : accountLabel(entity as BankAccount);
}

/**
 * Qué es la identidad, sin su número: «Ahorros», «Visa».
 *
 * Para acompañar a un número que ya está a la vista — repetirlo al lado sería
 * decir lo mismo dos veces.
 */
export function identityTypeLabel(
    entity: BankAccount | BankCard, kind: "ACCOUNT" | "CARD",
): string {
    if (kind === "CARD") {
        const card = entity as BankCard;
        return card.brand?.trim() || CARD_TYPE_LABEL[card.cardType];
    }
    return ACCOUNT_TYPE_LABEL[(entity as BankAccount).accountType];
}
