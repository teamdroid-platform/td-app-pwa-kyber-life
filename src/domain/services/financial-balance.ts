import { FinancialTransaction, FinancialTransactionType } from "../entities/financial";
import { BalanceScope } from "./balance-scope";

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

/**
 * Statuses the dashboards consider "active" (i.e. real, countable money).
 * Single source of truth shared by the SQL narrowing and the in-memory filter.
 */
export const DASHBOARD_ACTIVE_STATUSES = ["CONFIRMED", "REVIEWED", "MANUAL"] as const;

/** The four coarse buckets used across the UI (tabs, summary, settings counts). */
export type TransactionTypeBucket = "income" | "expense" | "transfer" | "withdrawal";

/**
 * Map a raw transaction type to its coarse bucket, matching the visual grouping
 * used everywhere else (income/expense/transfer/withdrawal):
 *   - income:     INCOME, DEPOSIT, REFUND
 *   - withdrawal: WITHDRAWAL
 *   - transfer:   TRANSFER, OTHER
 *   - expense:    everything else (EXPENSE, PAYMENT, FEE, TAX)
 */
export function transactionTypeBucket(type: FinancialTransactionType): TransactionTypeBucket {
    if (isIncomeType(type)) return "income";
    if (isWithdrawalType(type)) return "withdrawal";
    if (isOtherType(type)) return "transfer";
    return "expense";
}

type BalanceTransaction = Pick<
    FinancialTransaction,
    "type" | "amount" | "categoryId" | "categoryName" | "paidWithCredit"
> & Partial<Pick<
    FinancialTransaction,
    "bankSourceAccountId" | "bankDestinationAccountId" | "bankCardId"
>>;

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
 *
 * `scope` restricts the balance to a subset of accounts/cards (Task 1). When
 * omitted, behavior is unchanged. Non-transfer transactions linked to
 * anything excluded are skipped entirely. Transfers are special: the
 * category still wins first (a savings/funding transfer keeps its sign no
 * matter what its endpoints are), and only then does the scope decide —
 * moving money into an excluded account is treated as spending it (it
 * leaves the budgeted balance), moving it back out of one is treated as
 * income (it re-enters), and a transfer between two included — or two
 * excluded — accounts is neutral, same as today.
 */
export function computeNetBalance(
    transactions: readonly BalanceTransaction[],
    categoryNameById?: ReadonlyMap<string, string>,
    scope?: BalanceScope,
): number {
    let balance = 0;

    for (const t of transactions) {
        const amount = Number(t.amount);

        if (t.type === "TRANSFER") {
            // La categoría manda sobre el scope: una transferencia marcada como
            // ahorro resta una sola vez, aunque su destino esté además excluido.
            if (isSavingsTransfer(t, categoryNameById)) { balance -= amount; continue; }
            if (isFundingTransfer(t, categoryNameById)) { balance += amount; continue; }
            if (scope) {
                const fromIn = scope.isAccountIncluded(t.bankSourceAccountId);
                const toIn = scope.isAccountIncluded(t.bankDestinationAccountId);
                // Mover dinero a una cuenta que no presupuestas es sacarlo del
                // bolsillo; traerlo de vuelta es meterlo.
                if (fromIn && !toIn) { balance -= amount; continue; }
                if (!fromIn && toIn) { balance += amount; continue; }
            }
            continue;
        }

        if (scope && !scope.isTransactionIncluded(t)) continue;

        if (isIncomeType(t.type)) {
            balance += amount;
        } else if (isWithdrawalType(t.type)) {
            // no-op: cash changes form, still available
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
 *
 * `scope` restricts the sum to cards included in it (Task 1); omitted, behavior
 * is unchanged.
 */
export function sumCreditExpenses(
    transactions: readonly BalanceTransaction[],
    scope?: BalanceScope,
): number {
    let sum = 0;
    for (const t of transactions) {
        if (
            t.paidWithCredit &&
            !isIncomeType(t.type) &&
            !isWithdrawalType(t.type) &&
            t.type !== "TRANSFER" &&
            (!scope || scope.isCardIncluded(t.bankCardId))
        ) {
            sum += Number(t.amount);
        }
    }
    return Math.round(sum * 100) / 100;
}
