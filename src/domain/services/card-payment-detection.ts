/**
 * Reconocer, entre las transacciones ya capturadas, las que son pagos hechos
 * **a** una tarjeta de crédito.
 *
 * El español de los bancos usa la misma palabra para las dos direcciones del
 * dinero y la diferencia está en una preposición: «pago **de** tarjeta» es
 * dinero que va a la tarjeta, «pago **con** tarjeta» es una compra. Por eso hay
 * dos listas y la de exclusión gana.
 */

/** Frases que significan dinero que entra a una tarjeta. */
export const PAYMENT_TO_CARD_PATTERNS: readonly RegExp[] = [
    /pago\s+(?:total\s+|minimo\s+)?(?:de\s+)?(?:la\s+)?tarjeta/i,
    /pago\s+(?:realizado\s+)?a\s+(?:la\s+)?tarjeta/i,
    /pago\s+(?:de\s+)?tc\b/i,
];

/** Frases que significan una compra pagada con una tarjeta. */
export const PAYMENT_WITH_CARD_PATTERNS: readonly RegExp[] = [
    /pago\s+(?:realizado\s+)?con\s+(?:la\s+)?tarjeta/i,
    /\buso\s+de\s+tarjeta\b/i,
];

/** Quita tildes para que los patrones no tengan que duplicarse. */
function fold(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isPaymentToCard(text: string): boolean {
    const folded = fold(text);
    if (PAYMENT_WITH_CARD_PATTERNS.some(p => p.test(folded))) return false;
    return PAYMENT_TO_CARD_PATTERNS.some(p => p.test(folded));
}

/**
 * El primer token con forma de número de tarjeta: al menos cuatro caracteres
 * entre dígitos y máscara, con un carácter de máscara presente.
 *
 * La máscara es obligatoria a propósito. Sin ella, cualquier cifra del texto
 * —un monto, una fecha, un número de comprobante— pasaría por número de
 * tarjeta, y un falso positivo aquí ata un pago a la tarjeta equivocada.
 */
const CARD_NUMBER = /\b(?=[0-9]*[X×x*•·●#])[0-9X×x*•·●#]{4,}\b/;

export function extractCardNumber(text: string): string | null {
    return text.match(CARD_NUMBER)?.[0] ?? null;
}
