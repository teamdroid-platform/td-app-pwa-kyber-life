import type { FinancialTransactionType } from "@/domain/entities/financial";

/**
 * The types a scanned email is allowed to resolve to. Deliberately narrower than
 * the full enum: the scanner only ever reports these four, and letting an
 * unexpected string through would label the transaction with a type the user
 * cannot pick back from the chips.
 */
export const SCANNER_TRANSACTION_TYPES: readonly FinancialTransactionType[] = [
    "EXPENSE", "INCOME", "TRANSFER", "WITHDRAWAL",
];

/**
 * The types a dictated or written sentence may resolve to — the whole enum.
 * "Pagué la comisión del banco" is a FEE, and the detail screen can already
 * label every one of these, so there is no reason to flatten them to EXPENSE.
 */
export const CAPTURE_TRANSACTION_TYPES: readonly FinancialTransactionType[] = [
    "EXPENSE", "INCOME", "TRANSFER", "PAYMENT", "REFUND",
    "WITHDRAWAL", "DEPOSIT", "FEE", "TAX", "OTHER",
];

/**
 * Turn whatever an external source called the type into one of ours.
 *
 * Case-insensitive, because extractors answer in lowercase (`"expense"`), and
 * total: anything unrecognised becomes an expense, which is both the most
 * common movement and the safest default to show for review.
 */
export function normalizeTransactionType(
    raw: string | null | undefined,
    allowed: readonly FinancialTransactionType[] = CAPTURE_TRANSACTION_TYPES,
): FinancialTransactionType {
    const normalized = raw?.trim().toUpperCase();
    if (!normalized) return "EXPENSE";
    return (allowed as readonly string[]).includes(normalized)
        ? (normalized as FinancialTransactionType)
        : "EXPENSE";
}
