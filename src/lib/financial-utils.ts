import type { FinancialTransaction } from "@/domain/entities/financial";

const TYPE_LABELS: Record<string, string> = {
    EXPENSE: "Gasto",
    INCOME: "Ingreso",
    TRANSFER: "Transferencia",
    PAYMENT: "Pago",
    REFUND: "Reembolso",
    WITHDRAWAL: "Retiro",
    DEPOSIT: "Depósito",
    FEE: "Comisión",
    TAX: "Impuesto",
    OTHER: "Otro",
};

/**
 * Extracts a meaningful display title for a financial transaction.
 *
 * Fallback priority:
 * 1. `description` field (trimmed)
 * 2. Email subject from `originStats.subject`
 * 3. Generated text from transaction type + merchant
 * 4. Type label alone (e.g. "Gasto")
 */
export function getTransactionDisplayTitle(tx: FinancialTransaction): string {
    if (tx.description?.trim()) {
        return tx.description.trim();
    }

    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailSubject = stats?.subject as string | undefined;
    if (emailSubject?.trim()) {
        return emailSubject.trim();
    }

    return buildFallbackTitle(tx.type, tx.merchant);
}

/**
 * The title a transaction gets when it has no description of its own:
 * "Gasto – Supermaxi", or just "Gasto" when there is no merchant either.
 *
 * Exposed so the offline draft sync can fill a missing description with the
 * very text the app would have displayed anyway — the description is required
 * server-side, and a queued draft must never be lost to that rule.
 */
export function buildFallbackTitle(type?: string | null, merchant?: string | null): string {
    const typeLabel = TYPE_LABELS[type ?? ""] ?? type ?? "Movimiento";
    return merchant?.trim() ? `${typeLabel} – ${merchant.trim()}` : typeLabel;
}

/**
 * Ids of the user's CREDIT cards, ready to hand to
 * {@link isTransactionPaidWithCredit}. Cards with no id (or a DEBIT type) are
 * skipped, so a transaction linked to a debit card resolves to "not credit".
 */
export function creditCardIdSet(cards: readonly { id?: string | null; cardType?: string | null }[]): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const card of cards) {
        if (card.id && card.cardType === "CREDIT") ids.add(card.id);
    }
    return ids;
}

/**
 * Checks whether a text string mentions credit card payment keywords (paying WITH credit card),
 * while distinguishing from bill payments TO a credit card (paying off card debt from savings/checking).
 */
export function hasCreditCardKeywords(text: string | null | undefined): boolean {
    if (!text || typeof text !== "string") return false;

    // Bill payments TO/OF a credit card (e.g. paying card debt from savings) are NOT expenses paid with credit card.
    const isPaymentToCard = /\b(?:pago|abono|cancelaci[oó]n|transferencia)\s+(?:a|de|a\s+la|de\s+la|a\s+mi|de\s+mi|a\s+su|de\s+su)?\s*tarjeta[s]?\s+(?:de\s+)?cr[eé]dito\b/i.test(text);

    // Explicit indicators of purchase or consumption WITH credit card (e.g. "pago con tarjeta de crédito")
    const isPaidWithCard =
        /\b(?:con|mediante|por|v[ií]a)\s+tarjeta[s]?\s+(?:de\s+)?cr[eé]dito\b/i.test(text) ||
        /\b(?:consumo|compra|cargo|gasto|autorizaci[oó]n|uso)\s+(?:con|de|en|por)?\s*tarjeta[s]?\s+(?:de\s+)?cr[eé]dito\b/i.test(text) ||
        /\bcredit\s*card\s*(?:purchase|expense|charge|transaction)\b/i.test(text) ||
        /\b(?:paid|payment)\s+with\s+credit\s*card\b/i.test(text);

    if (isPaymentToCard && !isPaidWithCard) {
        return false;
    }

    return (
        isPaidWithCard ||
        (/\b(?:tarjeta[s]?\s+(?:de\s+)?cr[eé]dito|credit\s*card)\b/i.test(text) && !isPaymentToCard)
    );
}

/**
 * Returns `true` when the text describes a bill payment TO/FOR a credit card
 * (paying off card debt), e.g. "Pago a tarjeta de crédito",
 * "Pago realizado a la tarjeta de crédito", "Abono a tarjeta".
 *
 * This is intentionally broader than the regex in `hasCreditCardKeywords`:
 * it catches rephrased AI summaries where extra words appear between
 * the verb and "tarjeta de crédito".
 */
function isPaymentToCardDescription(text: string | null | undefined): boolean {
    if (!text || typeof text !== "string") return false;
    return /\b(?:pago|abono|cancelaci[oó]n|transferencia)[\s\w]{0,30}(?:a|de|hacia|para|por)\s+(?:la\s+)?tarjeta[s]?\s+(?:de\s+)?cr[eé]dito\b/i.test(text);
}

/**
 * Detects if a transaction represents a credit card payment/expense.
 *
 * Decision priority:
 * 1. Explicit `paidWithCredit === true` (set by the user in the wizard) → trusted directly.
 * 2. The card the transaction is linked to, when `creditCardIds` is supplied:
 *    `bankCardId` is structured evidence written by the bank-identification
 *    service (BIN / last four), so it beats any wording in the e-mail — a DEBIT
 *    card settles it as `false` even if the text says "tarjeta de crédito".
 * 3. Otherwise — including an explicit `false` — heuristics on originStats flags,
 *    emailBody, summary, notes and description decide. A stored `false` is *not*
 *    authoritative: scanner-imported and legacy rows default the column to
 *    `false`/`null` even when the source e-mail describes a credit-card purchase.
 *
 * This is the single source of truth for "was this paid with credit" — the
 * transactions list (`enrichTransactions`) and the financial dashboard
 * (`resolvePaidWithCredit`) both run every transaction through it, so the
 * balance and the "Incluir TC" toggle agree on both screens.
 *
 * `creditCardIds` holds the ids of the user's CREDIT cards. Omit it and rules
 * 1 and 3 still apply, so callers without a card repository keep working.
 */
export function isTransactionPaidWithCredit(tx: {
    type?: string | null;
    paidWithCredit?: boolean | null;
    notes?: string | null;
    description?: string | null;
    summary?: string | null;
    bankCardId?: string | null;
    originStats?: Record<string, unknown> | null;
} | null | undefined, creditCardIds?: ReadonlySet<string>): boolean {
    if (!tx) return false;
    // Explicit true is always respected immediately
    if (tx.paidWithCredit === true) return true;

    // If the description explicitly says it's a payment TO a credit card (debt repayment),
    // this is NOT an expense paid WITH credit, regardless of what emailBody/notes say.
    if (isPaymentToCardDescription(tx.description)) return false;

    // Only expense-like transactions or unassigned types can be paid with credit
    const normalizedType = tx.type?.toUpperCase();
    if (normalizedType && normalizedType !== "EXPENSE" && normalizedType !== "PAYMENT" && normalizedType !== "OTHER") {
        return false;
    }

    // A known card decides on its own: it was matched against the real card by
    // BIN/last four, which is firmer than whatever the notification worded.
    if (creditCardIds && tx.bankCardId) return creditCardIds.has(tx.bankCardId);

    const stats = tx.originStats;
    if (stats && typeof stats === "object") {
        if (stats.is_credit_card === true || stats.isCreditCard === true || stats.paidWithCredit === true) {
            return true;
        }
        const emailBody = typeof stats.emailBody === "string" ? stats.emailBody : "";
        const subject = typeof stats.subject === "string" ? stats.subject : "";
        const snippet = typeof stats.snippet === "string" ? stats.snippet : "";
        const statsCombined = `${emailBody} ${subject} ${snippet}`;
        if (hasCreditCardKeywords(statsCombined)) {
            return true;
        }
    }

    if (tx.summary && hasCreditCardKeywords(tx.summary)) return true;
    if (tx.notes && hasCreditCardKeywords(tx.notes)) return true;
    if (tx.description && hasCreditCardKeywords(tx.description)) return true;

    return false;
}
