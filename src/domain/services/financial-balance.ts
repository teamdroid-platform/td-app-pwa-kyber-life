import { FinancialTransaction, FinancialTransactionType } from "../entities/financial";

/**
 * Category name that marks a TRANSFER as money leaving the user's available
 * (spendable) balance — e.g. moving cash into savings/investments. Other
 * transfers (between two spendable accounts) don't reduce what's available.
 */
export const SAVINGS_CATEGORY_NAME = "Ahorros e Inversiones";

/**
 * Category name that marks a TRANSFER as money re-entering the user's
 * available balance — e.g. pulling cash back out of savings/investments to
 * fund spending. The symmetric counterpart of {@link SAVINGS_CATEGORY_NAME}.
 */
export const FUNDING_CATEGORY_NAME = "Fondeo ingresos";

export function isIncomeType(type: FinancialTransactionType): boolean {
    return type === "INCOME" || type === "DEPOSIT" || type === "REFUND";
}

export function isWithdrawalType(type: FinancialTransactionType): boolean {
    return type === "WITHDRAWAL";
}

export function isOtherType(type: FinancialTransactionType): boolean {
    return type === "TRANSFER" || type === "OTHER";
}

type BalanceTransaction = Pick<FinancialTransaction, "type" | "amount" | "categoryId" | "categoryName" | "paidWithCredit">;

function resolveCategoryName(t: BalanceTransaction, categoryNameById?: ReadonlyMap<string, string>): string | undefined {
    if (t.categoryName) return t.categoryName;
    if (t.categoryId && categoryNameById) return categoryNameById.get(t.categoryId);
    return undefined;
}

export function isSavingsTransfer(t: BalanceTransaction, categoryNameById?: ReadonlyMap<string, string>): boolean {
    return t.type === "TRANSFER" && resolveCategoryName(t, categoryNameById) === SAVINGS_CATEGORY_NAME;
}

export function isFundingTransfer(t: BalanceTransaction, categoryNameById?: ReadonlyMap<string, string>): boolean {
    return t.type === "TRANSFER" && resolveCategoryName(t, categoryNameById) === FUNDING_CATEGORY_NAME;
}

/**
 * Single source of truth for "available balance" across the financial module:
 * income in, minus real cash-out expenses, minus transfers earmarked as
 * savings, plus transfers that fund the balance back (e.g. from savings).
 * Expenses marked `paidWithCredit` are deferred — they don't reduce
 * available cash until their card-bill payment is logged as its own expense.
 * Withdrawals are cash-neutral (money changes form, still spendable).
 *
 * `categoryNameById` is only needed when `categoryName` isn't already
 * populated on the transactions (e.g. raw repository reads); already-enriched
 * transaction lists (with `categoryName` set) can omit it.
 */
export function computeNetBalance(
    transactions: readonly BalanceTransaction[],
    categoryNameById?: ReadonlyMap<string, string>,
): number {
    let balance = 0;

    for (const t of transactions) {
        const amount = Number(t.amount);
        if (isIncomeType(t.type)) {
            balance += amount;
        } else if (isWithdrawalType(t.type)) {
            // no-op: cash changes form, still available
        } else if (t.type === "TRANSFER") {
            if (isSavingsTransfer(t, categoryNameById)) {
                balance -= amount;
            } else if (isFundingTransfer(t, categoryNameById)) {
                balance += amount;
            }
        } else if (!t.paidWithCredit) {
            balance -= amount;
        }
    }

    return Math.round(balance * 100) / 100;
}

/**
 * Total of expenses paid with a credit card — the amount {@link computeNetBalance}
 * defers from the available balance. Subtract it from the net balance to get the
 * balance "as if the card were already paid" (the "Incluir gastos con tarjeta"
 * toggle ON). Only expense-like transactions can be `paidWithCredit`; income,
 * withdrawals and transfers are ignored.
 */
export function sumCreditExpenses(transactions: readonly BalanceTransaction[]): number {
    let sum = 0;
    for (const t of transactions) {
        if (
            t.paidWithCredit &&
            !isIncomeType(t.type) &&
            !isWithdrawalType(t.type) &&
            t.type !== "TRANSFER"
        ) {
            sum += Number(t.amount);
        }
    }
    return Math.round(sum * 100) / 100;
}
