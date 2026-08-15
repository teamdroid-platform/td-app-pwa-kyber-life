import { formatBankNumber, type BankNumberParts } from "./format-bank-number";
import type { BankAccountType } from "@/domain/entities/bank";

export const ACCOUNT_TYPE_LABEL: Record<BankAccountType, string> = {
    CHECKING: "Corriente",
    SAVINGS: "Ahorros",
    CASH: "Efectivo",
    INVESTMENT: "Inversión",
};

/**
 * Cómo se llama una cuenta cuando nadie le pone nombre.
 *
 * Las cuentas no se nombran: se reconocen por su número. El formulario ya no
 * pide un nombre, así que se compone del tipo y el número —«Ahorros ••••11»—,
 * que es lo que el usuario diría de ella. Sin número queda solo el tipo, que es
 * todo lo que se sabe.
 *
 * La columna `name` sigue existiendo porque media app la muestra; lo que
 * desaparece es la obligación de inventarla.
 */
export function defaultAccountName(
    accountType: BankAccountType, parts: BankNumberParts,
): string {
    const number = formatBankNumber(parts, "ACCOUNT");
    const type = ACCOUNT_TYPE_LABEL[accountType];
    return number ? `${type} ${number}` : type;
}

/**
 * Palabras que un nombre generado aporta de más: el tipo de cuenta y los
 * genéricos. Sirve para detectar que un nombre no dice nada que la fila no
 * muestre ya al lado.
 */
export const GENERIC_NAME_WORDS =
    /cuenta|tarjeta|ahorros|corriente|efectivo|inversión|inversion/gi;
