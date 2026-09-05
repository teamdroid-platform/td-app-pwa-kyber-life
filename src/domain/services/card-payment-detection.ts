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

import type { UUID, ISODate } from "../core";
import type { FinancialTransaction } from "../entities/financial";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { resolveFingerprint, type IdentityCandidate } from "@/lib/bank-number-match";

export interface PaymentCandidate {
    transaction: FinancialTransaction;
    cardId: UUID;
    /** El número tal como se leyó, para mostrarlo como evidencia. */
    readNumber: string;
}

export interface PaymentGroup {
    cardId: UUID;
    amount: number;
    date: ISODate;
    /** La transacción que se ata al confirmar. */
    primary: FinancialTransaction;
    /** Las gemelas que quedarán marcadas como duplicadas. */
    twins: FinancialTransaction[];
    readNumber: string;
}

const DEAD_STATUSES = new Set(["REJECTED", "DELETED", "DUPLICATE"]);

/** Dos capturas del mismo pago no llegan con la misma hora, pero sí con el mismo día. */
const TWIN_WINDOW_MS = 3 * 86_400_000;

/**
 * Los pagos a tarjeta que hay entre las transacciones dadas.
 *
 * Solo entra lo que trae número legible y resuelve a **una** tarjeta: sin
 * número, o con dos tarjetas compatibles, la transacción se queda fuera. La
 * regla es deliberada — nada baja la deuda por parecido de descripción.
 */
export function detectCardPayments(
    transactions: readonly FinancialTransaction[],
    candidates: readonly IdentityCandidate[],
): PaymentCandidate[] {
    const cards = candidates.filter(c => c.kind === "CARD");
    const found: PaymentCandidate[] = [];

    for (const transaction of transactions) {
        if (DEAD_STATUSES.has(transaction.status)) continue;
        if (transaction.bankCardPaymentId) continue;
        if (transaction.cardPaymentDismissedAt) continue;
        if (transaction.type !== "EXPENSE" && transaction.type !== "TRANSFER") continue;

        const text = [
            transaction.description,
            typeof transaction.originStats?.emailBody === "string"
                ? transaction.originStats.emailBody
                : "",
        ].join(" ");

        if (!isPaymentToCard(transaction.description)) continue;

        const readNumber = extractCardNumber(text);
        if (!readNumber) continue;

        const resolved = resolveFingerprint(parseBankNumber(readNumber), cards);
        if (resolved.resolution === "PENDING" || !resolved.targetId) continue;

        found.push({ transaction, cardId: resolved.targetId, readNumber });
    }

    return found;
}

/**
 * Junta las candidatas que son el mismo pago visto dos veces —el correo del
 * banco y el estado de cuenta llegan por separado— para que confirmarlas no
 * reste la deuda dos veces.
 *
 * Se ata la que trae cuenta de origen, que es la que sabe de dónde salió el
 * dinero; con empate, la más antigua.
 */
export function groupTwins(candidates: readonly PaymentCandidate[]): PaymentGroup[] {
    const groups: PaymentGroup[] = [];

    const sorted = [...candidates].sort(
        (a, b) => Date.parse(a.transaction.date) - Date.parse(b.transaction.date),
    );

    for (const candidate of sorted) {
        const { transaction } = candidate;
        const group = groups.find(g =>
            g.cardId === candidate.cardId
            && g.amount === Number(transaction.amount)
            && Math.abs(Date.parse(g.date) - Date.parse(transaction.date)) <= TWIN_WINDOW_MS);

        if (!group) {
            groups.push({
                cardId: candidate.cardId,
                amount: Number(transaction.amount),
                date: transaction.date,
                primary: transaction,
                twins: [],
                readNumber: candidate.readNumber,
            });
            continue;
        }

        // La que sabe de dónde salió el dinero manda sobre la que llegó antes.
        if (!group.primary.bankSourceAccountId && transaction.bankSourceAccountId) {
            group.twins.push(group.primary);
            group.primary = transaction;
        } else {
            group.twins.push(transaction);
        }
    }

    return groups;
}
