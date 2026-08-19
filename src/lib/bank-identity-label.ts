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
    const number = formatBankNumber(account);
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
    const number = formatBankNumber(card);
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

/**
 * El tipo en tres letras, para leerlo antes que el número.
 *
 * Siempre tres: puestas una debajo de otra, cualquier largo distinto rompe la
 * alineación y el ojo deja de encontrarlas en el mismo sitio.
 */
export const ACCOUNT_TYPE_ACRONYM: Record<BankAccountType, string> = {
    SAVINGS: "AHO",
    CHECKING: "CTE",
    CASH: "EFE",
    INVESTMENT: "INV",
};

export const CARD_TYPE_ACRONYM: Record<BankCardType, string> = {
    CREDIT: "TCR",
    DEBIT: "TDE",
};

/** De un tercero: no es que falte el dato, es que la cuenta no es suya. */
export const THIRD_PARTY_ACRONYM = "TER";

/** Suyo, pero sin registrar en Bancos: del tipo no se sabe nada todavía. */
export const UNKNOWN_TYPE_ACRONYM = "DES";

export function identityAcronym(
    entity: BankAccount | BankCard, kind: "ACCOUNT" | "CARD",
): string {
    return kind === "CARD"
        ? CARD_TYPE_ACRONYM[(entity as BankCard).cardType]
        : ACCOUNT_TYPE_ACRONYM[(entity as BankAccount).accountType];
}

/**
 * La familia a la que pertenece un acrónimo, para colorearlo.
 *
 * El color hace de atajo: se distingue una tarjeta de crédito de una cuenta de
 * ahorros sin llegar a leer las letras.
 */
export type IdentityTone = "savings" | "checking" | "credit" | "debit" | "muted";

export function acronymTone(acronym: string): IdentityTone {
    switch (acronym) {
        case "AHO": return "savings";
        case "CTE":
        case "EFE":
        case "INV": return "checking";
        case "TCR": return "credit";
        case "TDE": return "debit";
        default: return "muted";
    }
}
