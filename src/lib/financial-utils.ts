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
 * Checks whether a text string mentions credit card payment keywords.
 */
export function hasCreditCardKeywords(text: string | null | undefined): boolean {
    if (!text || typeof text !== "string") return false;
    return /\b(?:tarjeta[s]?\s+(?:de\s+)?cr[eé]dito|credit\s*card)\b/i.test(text);
}

/**
 * Detects if a transaction or scanner transaction represents a credit card payment/expense.
 *
 * Evaluates:
 * 1. Explicit `paidWithCredit === true`
 * 2. Origin stats flags (`is_credit_card`, `isCreditCard`, `paidWithCredit`)
 * 3. Text content in `summary`, `description`, `notes`, or `originStats` (emailBody, subject, snippet)
 */
export function isTransactionPaidWithCredit(tx: {
    type?: string | null;
    paidWithCredit?: boolean | null;
    notes?: string | null;
    description?: string | null;
    summary?: string | null;
    originStats?: Record<string, unknown> | null;
} | null | undefined): boolean {
    if (!tx) return false;
    if (tx.paidWithCredit === true) return true;

    // Only expense-like transactions or unassigned types can be paid with credit
    const normalizedType = tx.type?.toUpperCase();
    if (normalizedType && normalizedType !== "EXPENSE" && normalizedType !== "PAYMENT" && normalizedType !== "OTHER") {
        return false;
    }

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

