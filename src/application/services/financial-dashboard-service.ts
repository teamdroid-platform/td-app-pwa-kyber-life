import { UUID } from "../../domain/core";
import { FinancialTransaction } from "../../domain/entities/financial";
import { IFinancialTransactionRepository, IFinancialCategoryRepository, IFinancialInstitutionRepository, IFinancialScannerTransactionRepository } from "../../domain/repositories/financial";
import { computeNetBalance, isIncomeType, isWithdrawalType, isOtherType, isSavingsTransfer, isFundingTransfer } from "../../domain/services/financial-balance";
import { isTransactionPaidWithCredit, creditCardIdSet } from "../../lib/financial-utils";
import { IBankCardRepository } from "../../domain/repositories/bank";
export interface FinancialKPIs {
    totalIncome: number;
    totalExpenses: number;
    /** Portion of `totalExpenses` paid with a credit card — deferred, not yet reflected in `netBalance`. */
    totalExpensesCredit: number;
    /**
     * Portion of `totalExpenses` that settles credit-card debt in cash. Real
     * money out, but not consumption — the purchase it pays for was already
     * counted. Excludes anything also flagged `paidWithCredit`, so
     * `totalExpenses − totalExpensesCredit − totalExpensesSettlement` is the
     * cash spent on actual consumption.
     */
    totalExpensesSettlement: number;
    totalTransfers: number;
    /** Portion of `totalTransfers` earmarked as savings — reduces `netBalance`. */
    totalTransfersSavings: number;
    /** Portion of `totalTransfers` funding the balance back (e.g. from savings) — increases `netBalance`. */
    totalTransfersFunding: number;
    totalWithdrawals: number;
    netBalance: number;
    transactionCount: number;
    avgTransactionAmount: number;
    pendingTransactionsCount: number;
    /** Transactions in range the scanner flagged as a possible duplicate. */
    possibleDuplicateCount: number;
    /** Transactions in range with no category — they fall out of every category chart. */
    uncategorizedCount: number;
    currency: string;
}

export interface CategoryBreakdown {
    categoryId: string | null;
    categoryName: string;
    total: number;
    /** Portion of `total` paid with a credit card — deferred, not yet reflected in the balance. */
    creditTotal: number;
    /**
     * Portion of `total` that settles credit-card debt instead of buying
     * anything. It is real cash leaving, but counting it as spending
     * double-counts the purchase it pays for, so the category chart hides it
     * behind a toggle. See {@link isCardSettlement}.
     */
    paymentTotal: number;
    count: number;
    percentage: number;
    color?: string;
}

export interface MerchantBreakdown {
    /** Trimmed `merchant`, or "Sin comercio" when the transaction carries none. */
    merchant: string;
    total: number;
    /** Portion of `total` paid with a credit card — deferred, not yet reflected in the balance. */
    creditTotal: number;
    count: number;
    percentage: number;
}

export interface IncomeSourceBreakdown {
    /** Category id, or `null` when the source fell back to the merchant name. */
    sourceId: string | null;
    sourceName: string;
    total: number;
    count: number;
    percentage: number;
    color?: string;
}

export interface InstitutionBreakdown {
    institutionId: string | null;
    institutionName: string;
    total: number;
    /** Portion of `total` paid with a credit card — deferred, not yet reflected in the balance. */
    creditTotal: number;
    count: number;
    percentage: number;
}

export interface DailyBreakdown {
    date: string; // YYYY-MM-DD
    income: number;
    expenses: number;
    /** Portion of `expenses` paid with a credit card — deferred, not yet reflected in the balance. */
    expensesCredit: number;
    /** Portion of `expenses` that settles card debt rather than buying anything. */
    expensesSettlement: number;
    withdrawals: number;
    other: number;
    net: number;
}

export interface MonthlyBreakdown {
    month: string; // "2026-01", "2026-02", etc.
    income: number;
    expenses: number;
    withdrawals: number;
    other: number;
    net: number;
}

export interface TypeBreakdown {
    type: string;
    total: number;
    count: number;
    percentage: number;
}

/**
 * Data every dashboard block derives from, read **once** per request.
 *
 * Each block used to start with its own `findByOwnerId(userId)` — six full
 * reads of the user's whole history per dashboard load. Passing this context
 * around lets {@link FinancialDashboardService.getDashboardOverview} do a single
 * narrowed read and derive all six blocks from it, while the individual methods
 * still work standalone (they load their own data when no context is given).
 */
export interface DashboardContext {
    /** Transactions already narrowed by range + active status. */
    active: FinancialTransaction[];
    categories: Awaited<ReturnType<IFinancialCategoryRepository["findAllBaseAndUser"]>>;
    institutions: Awaited<ReturnType<IFinancialInstitutionRepository["findByOwnerId"]>>;
    pendingCount: number;
}

/**
 * The same-length range immediately before the requested one, reduced to just
 * what the "vs. periodo anterior" comparisons need. Only the totals travel — not
 * the transactions — so the extra read costs one query and a few hundred bytes.
 *
 * Everything here excludes card settlements (see {@link isCardSettlement}), so
 * it lines up with the consumption figures the category and pace charts show by
 * default. `categoryPaymentTotals` carries the settled amounts separately, for
 * when the user turns the "incluir pagos de tarjeta" toggle on.
 */
export interface PreviousPeriodComparison {
    /** ISO bounds of the compared range, for labelling. */
    startDate: string;
    endDate: string;
    /** Consumption total: expense-like amounts, settlements excluded. */
    totalExpenses: number;
    /** Consumption per category id ("UNCATEGORIZED" for none). */
    categoryTotals: Record<string, number>;
    /** Settled card debt per category id, kept apart from `categoryTotals`. */
    categoryPaymentTotals: Record<string, number>;
    /** One consumption total per day of the range, zero-filled, chronological. */
    dailyExpenses: number[];
}

export interface DashboardOverview {
    kpis: FinancialKPIs;
    monthly: MonthlyBreakdown[];
    typeBreakdown: TypeBreakdown[];
    categoryBreakdown: CategoryBreakdown[];
    institutionBreakdown: InstitutionBreakdown[];
    dailyBreakdown: DailyBreakdown[];
    merchantBreakdown: MerchantBreakdown[];
    incomeSourceBreakdown: IncomeSourceBreakdown[];
    /** `null` when the range is open-ended — there is nothing to compare against. */
    previous: PreviousPeriodComparison | null;
}

/** Bucket label for expense-like transactions carrying no merchant. */
export const NO_MERCHANT_LABEL = "Sin comercio";

/**
 * True when the transaction settles credit-card debt instead of buying
 * something: an explicit `PAYMENT`, or any row pointing at the card it pays.
 *
 * It matters because the purchase was already counted as an expense when it
 * happened. Letting the settlement count again makes "Pago de Tarjetas" the
 * biggest slice of every spending chart while describing no consumption at all.
 */
export function isCardSettlement(t: FinancialTransaction): boolean {
    return t.type === "PAYMENT" || !!t.bankCardPaymentId;
}

/** Expense-like: what the "Gastos" KPI counts — not income, transfers or withdrawals. */
function isExpenseLike(t: FinancialTransaction): boolean {
    return !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER";
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function mapValues(source: Record<string, number>, fn: (n: number) => number): Record<string, number> {
    return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, fn(v)]));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window of the same length ending just before `startDate`. A 30-day cycle
 * compares against the 30 days before it, a single day against the day before.
 */
export function previousRangeOf(startDate: Date, endDate: Date): { start: Date; end: Date } {
    const span = endDate.getTime() - startDate.getTime();
    const end = new Date(startDate.getTime() - 1);
    return { start: new Date(end.getTime() - span), end };
}

/**
 * Resolve `paidWithCredit` the same way the transactions list does.
 *
 * The stored column alone is not the whole truth: scanner-imported and legacy
 * rows land with `false`/`null` even when the e-mail body clearly describes a
 * credit-card purchase. `FinancialTransactionService.enrichTransactions` already
 * runs every listed transaction through {@link isTransactionPaidWithCredit}, so
 * the dashboard has to do the same or the two screens disagree: the list defers
 * those expenses from the balance while the dashboard subtracts them, and
 * switching to PERIOD_WITH_CREDIT would move nothing because
 * `totalExpensesCredit` only counted the explicitly-flagged rows.
 */
function resolvePaidWithCredit(
    transactions: FinancialTransaction[],
    creditCardIds?: ReadonlySet<string>,
): FinancialTransaction[] {
    return transactions.map(t => {
        const paidWithCredit = isTransactionPaidWithCredit(t, creditCardIds);
        return paidWithCredit === (t.paidWithCredit ?? false) ? t : { ...t, paidWithCredit };
    });
}

export class FinancialDashboardService {
    constructor(
        private transactionRepo: IFinancialTransactionRepository,
        private categoryRepo: IFinancialCategoryRepository,
        private institutionRepo: IFinancialInstitutionRepository,
        private scannerRepo?: IFinancialScannerTransactionRepository,
        /**
         * Optional: without it a transaction linked to a card is resolved from the
         * scanner text alone. With it the card's own type decides — the same rule
         * the transactions list applies.
         */
        private bankCardRepo?: IBankCardRepository,
    ) {}

    /**
     * Every dashboard block from a **single** narrowed read, instead of the six
     * independent full-history reads the separate getters used to trigger.
     */
    async getDashboardOverview(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
        monthsBack = 6,
    ): Promise<DashboardOverview> {
        const ctx = await this.buildContext(userId, startDate, endDate);
        return {
            kpis: await this.getKPIs(userId, startDate, endDate, ctx),
            monthly: await this.getMonthlyBreakdown(userId, monthsBack, startDate, endDate, ctx),
            typeBreakdown: await this.getTypeBreakdown(userId, startDate, endDate, ctx),
            categoryBreakdown: await this.getCategoryBreakdown(userId, startDate, endDate, ctx),
            institutionBreakdown: await this.getInstitutionBreakdown(userId, startDate, endDate, ctx),
            dailyBreakdown: await this.getDailyBreakdown(userId, startDate, endDate, ctx),
            merchantBreakdown: await this.getMerchantBreakdown(userId, startDate, endDate, ctx),
            incomeSourceBreakdown: await this.getIncomeSourceBreakdown(userId, startDate, endDate, ctx),
            previous: await this.getPreviousComparison(userId, startDate, endDate),
        };
    }

    /**
     * Totals of the equivalent range just before this one, for the "vs. periodo
     * anterior" deltas and the pace chart's reference curve.
     *
     * This is the **only** extra read a dashboard load costs, and it is skipped
     * entirely when the range is open ("Todo el tiempo"), where there is nothing
     * meaningful to compare against.
     */
    async getPreviousComparison(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
    ): Promise<PreviousPeriodComparison | null> {
        if (!startDate || !endDate) return null;

        const { start, end } = previousRangeOf(startDate, endDate);
        const previous = await this.loadActive(userId, start, end);

        const categoryTotals: Record<string, number> = {};
        const categoryPaymentTotals: Record<string, number> = {};
        let totalExpenses = 0;

        const days = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / DAY_MS));
        const dailyExpenses = new Array<number>(days).fill(0);

        for (const t of previous) {
            if (!isExpenseLike(t)) continue;
            const amount = Number(t.amount);
            const catId = t.categoryId || "UNCATEGORIZED";

            if (isCardSettlement(t)) {
                categoryPaymentTotals[catId] = (categoryPaymentTotals[catId] ?? 0) + amount;
                continue;
            }

            categoryTotals[catId] = (categoryTotals[catId] ?? 0) + amount;
            totalExpenses += amount;

            const dayIndex = Math.floor((new Date(t.date).getTime() - start.getTime()) / DAY_MS);
            if (dayIndex >= 0 && dayIndex < days) dailyExpenses[dayIndex] += amount;
        }

        return {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            totalExpenses: round2(totalExpenses),
            categoryTotals: mapValues(categoryTotals, round2),
            categoryPaymentTotals: mapValues(categoryPaymentTotals, round2),
            dailyExpenses: dailyExpenses.map(round2),
        };
    }

    /**
     * The transactions behind the `uncategorizedCount` counter, newest first.
     *
     * It reads the same population that counter does — the range narrowed by
     * `findForDashboard` — so the list the user is asked to fix always has
     * exactly as many rows as the number that sent them there.
     */
    async getUncategorizedTransactions(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
        ctx?: DashboardContext,
    ): Promise<FinancialTransaction[]> {
        return (await this.loadActive(userId, startDate, endDate, ctx))
            .filter(t => !t.categoryId)
            .sort((a, b) => b.date.localeCompare(a.date));
    }

    /**
     * Where the money actually goes, by merchant rather than by bank.
     *
     * Card settlements are excluded on purpose: "Visa 9620" is not a shop, and
     * counting it would put debt at the top of a list about spending.
     */
    async getMerchantBreakdown(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
        ctx?: DashboardContext,
    ): Promise<MerchantBreakdown[]> {
        const spending = (await this.loadActive(userId, startDate, endDate, ctx))
            .filter(t => isExpenseLike(t) && !isCardSettlement(t));

        const groups: Record<string, { total: number; creditTotal: number; count: number }> = {};
        let grandTotal = 0;

        for (const t of spending) {
            const name = t.merchant?.trim() || NO_MERCHANT_LABEL;
            if (!groups[name]) groups[name] = { total: 0, creditTotal: 0, count: 0 };
            const amount = Number(t.amount);
            groups[name].total += amount;
            if (t.paidWithCredit) groups[name].creditTotal += amount;
            groups[name].count += 1;
            grandTotal += amount;
        }

        return Object.entries(groups)
            .map(([merchant, data]) => ({
                merchant,
                total: round2(data.total),
                creditTotal: round2(data.creditTotal),
                count: data.count,
                percentage: grandTotal > 0 ? round2((data.total / grandTotal) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total);
    }

    /**
     * Where the money comes from: income grouped by its category, falling back
     * to the merchant (the payer) when the transaction has none.
     */
    async getIncomeSourceBreakdown(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
        ctx?: DashboardContext,
    ): Promise<IncomeSourceBreakdown[]> {
        const income = (await this.loadActive(userId, startDate, endDate, ctx))
            .filter(t => isIncomeType(t.type));
        const categories = ctx?.categories ?? await this.categoryRepo.findAllBaseAndUser(userId);
        const catMap = new Map(categories.map(c => [c.id, c]));

        const groups: Record<string, { sourceId: string | null; name: string; color?: string; total: number; count: number }> = {};
        let grandTotal = 0;

        for (const t of income) {
            const category = t.categoryId ? catMap.get(t.categoryId) : undefined;
            const key = category ? `cat:${t.categoryId}` : `mer:${t.merchant?.trim() || "?"}`;
            if (!groups[key]) {
                groups[key] = {
                    sourceId: category ? t.categoryId! : null,
                    name: category?.name ?? (t.merchant?.trim() || "Sin origen"),
                    color: category?.color || undefined,
                    total: 0,
                    count: 0,
                };
            }
            const amount = Number(t.amount);
            groups[key].total += amount;
            groups[key].count += 1;
            grandTotal += amount;
        }

        return Object.values(groups)
            .map(g => ({
                sourceId: g.sourceId,
                sourceName: g.name,
                total: round2(g.total),
                count: g.count,
                percentage: grandTotal > 0 ? round2((g.total / grandTotal) * 100) : 0,
                color: g.color,
            }))
            .sort((a, b) => b.total - a.total);
    }

    /** One read of each source, shared by every block of a dashboard load. */
    private async buildContext(userId: UUID, startDate?: Date, endDate?: Date): Promise<DashboardContext> {
        const [active, categories, institutions, creditCardIds] = await Promise.all([
            this.transactionRepo.findForDashboard(userId, { startDate, endDate }),
            this.categoryRepo.findAllBaseAndUser(userId),
            this.institutionRepo.findByOwnerId(userId),
            this.loadCreditCardIds(userId),
        ]);
        return {
            active: resolvePaidWithCredit(active, creditCardIds),
            categories,
            institutions,
            pendingCount: await this.countPending(userId, startDate, endDate),
        };
    }

    /** Transactions for a block: from the shared context, or read on demand. */
    private async loadActive(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
        ctx?: DashboardContext,
    ): Promise<FinancialTransaction[]> {
        if (ctx) return ctx.active;
        const [active, creditCardIds] = await Promise.all([
            this.transactionRepo.findForDashboard(userId, { startDate, endDate }),
            this.loadCreditCardIds(userId),
        ]);
        return resolvePaidWithCredit(active, creditCardIds);
    }

    /** Ids of the user's CREDIT cards, or `undefined` when no card repo is wired. */
    private async loadCreditCardIds(userId: UUID): Promise<ReadonlySet<string> | undefined> {
        if (!this.bankCardRepo) return undefined;
        return creditCardIdSet(await this.bankCardRepo.findByOwnerId(userId));
    }

    private async countPending(userId: UUID, startDate?: Date, endDate?: Date): Promise<number> {
        if (this.scannerRepo) {
            let pendingScannerTxs = await this.scannerRepo.findUnprocessedByOwnerId(userId);
            if (startDate || endDate) {
                pendingScannerTxs = pendingScannerTxs.filter(t => {
                    if (!t.date) return true;
                    const tDate = new Date(t.date);
                    if (startDate && tDate < startDate) return false;
                    if (endDate && tDate > endDate) return false;
                    return true;
                });
            }
            return pendingScannerTxs.length;
        }

        let pending = this.filterPending(await this.transactionRepo.findByOwnerId(userId));
        if (startDate || endDate) {
            pending = pending.filter(t => {
                const tDate = new Date(t.date);
                if (startDate && tDate < startDate) return false;
                if (endDate && tDate > endDate) return false;
                return true;
            });
        }
        return pending.length;
    }

    async getKPIs(userId: UUID, startDate?: Date, endDate?: Date, ctx?: DashboardContext): Promise<FinancialKPIs> {
        const confirmed = await this.loadActive(userId, startDate, endDate, ctx);
        const pendingCount = ctx ? ctx.pendingCount : await this.countPending(userId, startDate, endDate);

        const totalIncome = confirmed
            .filter(t => isIncomeType(t.type))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalWithdrawals = confirmed
            .filter(t => isWithdrawalType(t.type))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalTransfers = confirmed
            .filter(t => t.type === "TRANSFER")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalExpenses = confirmed
            .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalExpensesCredit = confirmed
            .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER" && t.paidWithCredit)
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalExpensesSettlement = confirmed
            .filter(t => isExpenseLike(t) && isCardSettlement(t) && !t.paidWithCredit)
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const categories = ctx?.categories ?? await this.categoryRepo.findAllBaseAndUser(userId);
        const categoryNameById = new Map(categories.map(c => [c.id!, c.name]));
        const netBalance = computeNetBalance(confirmed, categoryNameById);

        const totalTransfersSavings = confirmed
            .filter(t => isSavingsTransfer(t, categoryNameById))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const totalTransfersFunding = confirmed
            .filter(t => isFundingTransfer(t, categoryNameById))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const transactionCount = confirmed.length;
        const avgTransactionAmount = transactionCount > 0
            ? (totalIncome + totalExpenses + totalWithdrawals + totalTransfers) / transactionCount
            : 0;

        return {
            totalIncome: Math.round(totalIncome * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            totalExpensesCredit: Math.round(totalExpensesCredit * 100) / 100,
            totalExpensesSettlement: Math.round(totalExpensesSettlement * 100) / 100,
            totalTransfers: Math.round(totalTransfers * 100) / 100,
            totalTransfersSavings: Math.round(totalTransfersSavings * 100) / 100,
            totalTransfersFunding: Math.round(totalTransfersFunding * 100) / 100,
            totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
            netBalance: Math.round(netBalance * 100) / 100,
            transactionCount,
            avgTransactionAmount: Math.round(avgTransactionAmount * 100) / 100,
            pendingTransactionsCount: pendingCount,
            possibleDuplicateCount: confirmed.filter(t => t.possibleDuplicate).length,
            uncategorizedCount: confirmed.filter(t => !t.categoryId).length,
            currency: "USD",
        };
    }

    async getMonthlyBreakdown(userId: UUID, monthsBack: number = 6, startDate?: Date, endDate?: Date, ctx?: DashboardContext): Promise<MonthlyBreakdown[]> {
        const confirmed = await this.loadActive(userId, startDate, endDate, ctx);

        const months: MonthlyBreakdown[] = [];

        // If a specific date range is provided and it spans multiple months,
        // we'll group by month within the range, instead of just counting `monthsBack` from now.
        if (startDate && endDate) {
            // Find start and end months
            const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            
            const currentMonthIter = new Date(startMonth);
            while (currentMonthIter <= endMonth) {
                const monthKey = `${currentMonthIter.getFullYear()}-${String(currentMonthIter.getMonth() + 1).padStart(2, "0")}`;
                const mYear = currentMonthIter.getFullYear();
                const mMonth = currentMonthIter.getMonth();
                
                const monthTransactions = confirmed.filter(t => {
                    const tDate = new Date(t.date);
                    return tDate.getFullYear() === mYear && tDate.getMonth() === mMonth;
                });

                const income = monthTransactions
                    .filter(t => isIncomeType(t.type))
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                const withdrawals = monthTransactions
                    .filter(t => isWithdrawalType(t.type))
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                const expenses = monthTransactions
                    .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER")
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                const other = monthTransactions
                    .filter(t => t.type === "TRANSFER" || t.type === "OTHER")
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                months.push({
                    month: monthKey,
                    income: Math.round(income * 100) / 100,
                    expenses: Math.round(expenses * 100) / 100,
                    withdrawals: Math.round(withdrawals * 100) / 100,
                    other: Math.round(other * 100) / 100,
                    net: Math.round((income - expenses) * 100) / 100,
                });
                
                currentMonthIter.setMonth(currentMonthIter.getMonth() + 1);
            }
        } else {
            const now = new Date();
            for (let i = monthsBack - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

                const monthTransactions = confirmed.filter(t => {
                    const tDate = new Date(t.date);
                    return tDate.getFullYear() === d.getFullYear() && tDate.getMonth() === d.getMonth();
                });

                const income = monthTransactions
                    .filter(t => isIncomeType(t.type))
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                const withdrawals = monthTransactions
                    .filter(t => isWithdrawalType(t.type))
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                const expenses = monthTransactions
                    .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER")
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                const other = monthTransactions
                    .filter(t => t.type === "TRANSFER" || t.type === "OTHER")
                    .reduce((sum, t) => sum + Number(t.amount), 0);

                months.push({
                    month: monthKey,
                    income: Math.round(income * 100) / 100,
                    expenses: Math.round(expenses * 100) / 100,
                    withdrawals: Math.round(withdrawals * 100) / 100,
                    other: Math.round(other * 100) / 100,
                    net: Math.round((income - expenses) * 100) / 100,
                });
            }
        }

        return months;
    }

    async getTypeBreakdown(userId: UUID, startDate?: Date, endDate?: Date, ctx?: DashboardContext): Promise<TypeBreakdown[]> {
        const confirmed = await this.loadActive(userId, startDate, endDate, ctx);

        const groups: Record<string, { total: number; count: number }> = {};
        let grandTotal = 0;

        for (const t of confirmed) {
            const type = t.type;
            if (!groups[type]) {
                groups[type] = { total: 0, count: 0 };
            }
            groups[type].total += Number(t.amount);
            groups[type].count += 1;
            grandTotal += Number(t.amount);
        }

        return Object.entries(groups)
            .map(([type, data]) => ({
                type,
                total: Math.round(data.total * 100) / 100,
                count: data.count,
                percentage: grandTotal > 0
                    ? Math.round((data.total / grandTotal) * 10000) / 100
                    : 0,
            }))
            .sort((a, b) => b.total - a.total);
    }

    async getCategoryBreakdown(userId: UUID, startDate?: Date, endDate?: Date, ctx?: DashboardContext): Promise<CategoryBreakdown[]> {
        // Category breakdown is about spending: keep strictly expense-type transactions,
        // excluding income, transfers and withdrawals (same definition as the "Gastos" KPI).
        const confirmed = (await this.loadActive(userId, startDate, endDate, ctx))
            .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER");
        const categories = ctx?.categories ?? await this.categoryRepo.findAllBaseAndUser(userId);
        const catMap = new Map(categories.map(c => [c.id, c]));

        const groups: Record<string, { total: number; creditTotal: number; paymentTotal: number; count: number }> = {};
        let grandTotal = 0;

        for (const t of confirmed) {
            const catId = t.categoryId || "UNCATEGORIZED";
            if (!groups[catId]) {
                groups[catId] = { total: 0, creditTotal: 0, paymentTotal: 0, count: 0 };
            }
            const amount = Number(t.amount);
            groups[catId].total += amount;
            if (t.paidWithCredit) groups[catId].creditTotal += amount;
            if (isCardSettlement(t)) groups[catId].paymentTotal += amount;
            groups[catId].count += 1;
            grandTotal += amount;
        }

        return Object.entries(groups)
            .map(([catId, data]) => {
                const category = catId !== "UNCATEGORIZED" ? catMap.get(catId) : null;
                return {
                    categoryId: catId === "UNCATEGORIZED" ? null : catId,
                    categoryName: category?.name || "Sin categoría",
                    total: Math.round(data.total * 100) / 100,
                    creditTotal: Math.round(data.creditTotal * 100) / 100,
                    paymentTotal: Math.round(data.paymentTotal * 100) / 100,
                    count: data.count,
                    percentage: grandTotal > 0
                        ? Math.round((data.total / grandTotal) * 10000) / 100
                        : 0,
                    color: category?.color || undefined,
                };
            })
            .sort((a, b) => b.total - a.total);
    }

    async getInstitutionBreakdown(userId: UUID, startDate?: Date, endDate?: Date, ctx?: DashboardContext): Promise<InstitutionBreakdown[]> {
        // Group all active transactions as volume, using absolute amounts.
        const confirmed = await this.loadActive(userId, startDate, endDate, ctx);
        const institutions = ctx?.institutions ?? await this.institutionRepo.findByOwnerId(userId);
        const instMap = new Map(institutions.map(i => [i.id, i]));

        const groups: Record<string, { total: number; creditTotal: number; count: number }> = {};
        let grandTotal = 0;

        for (const t of confirmed) {
            const instId = t.institutionId || "UNKNOWN";
            if (!groups[instId]) {
                groups[instId] = { total: 0, creditTotal: 0, count: 0 };
            }
            // Use absolute amount for institution volume
            const absAmount = Math.abs(Number(t.amount));
            groups[instId].total += absAmount;
            if (t.paidWithCredit) groups[instId].creditTotal += absAmount;
            groups[instId].count += 1;
            grandTotal += absAmount;
        }

        return Object.entries(groups)
            .map(([instId, data]) => {
                const institution = instId !== "UNKNOWN" ? instMap.get(instId) : null;
                return {
                    institutionId: instId === "UNKNOWN" ? null : instId,
                    institutionName: institution?.name || "Unknown",
                    total: Math.round(data.total * 100) / 100,
                    creditTotal: Math.round(data.creditTotal * 100) / 100,
                    count: data.count,
                    percentage: grandTotal > 0
                        ? Math.round((data.total / grandTotal) * 10000) / 100
                        : 0,
                };
            })
            .sort((a, b) => b.total - a.total);
    }

    async getDailyBreakdown(userId: UUID, startDate?: Date, endDate?: Date, ctx?: DashboardContext): Promise<DailyBreakdown[]> {
        const confirmed = await this.loadActive(userId, startDate, endDate, ctx);

        const groups: Record<string, DailyBreakdown> = {};

        for (const t of confirmed) {
            // Take just YYYY-MM-DD
            const dateStr = t.date.split("T")[0];
            if (!groups[dateStr]) {
                groups[dateStr] = { date: dateStr, income: 0, expenses: 0, expensesCredit: 0, expensesSettlement: 0, withdrawals: 0, other: 0, net: 0 };
            }
            const amount = Number(t.amount);
            if (isIncomeType(t.type)) {
                groups[dateStr].income += amount;
                groups[dateStr].net += amount;
            } else if (isWithdrawalType(t.type)) {
                groups[dateStr].withdrawals += amount;
            } else if (isOtherType(t.type)) {
                groups[dateStr].other += amount;
            } else {
                groups[dateStr].expenses += amount;
                if (t.paidWithCredit) groups[dateStr].expensesCredit += amount;
                if (isCardSettlement(t)) groups[dateStr].expensesSettlement += amount;
                groups[dateStr].net -= amount;
            }
        }

        return Object.values(groups)
            .map(d => ({
                date: d.date,
                income: Math.round(d.income * 100) / 100,
                expenses: Math.round(d.expenses * 100) / 100,
                expensesCredit: Math.round(d.expensesCredit * 100) / 100,
                expensesSettlement: Math.round(d.expensesSettlement * 100) / 100,
                withdrawals: Math.round(d.withdrawals * 100) / 100,
                other: Math.round(d.other * 100) / 100,
                net: Math.round(d.net * 100) / 100,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)); // Sort chronologically
    }


    async getRecentTransactions(userId: UUID, limit: number = 5, startDate?: Date, endDate?: Date): Promise<FinancialTransaction[]> {
        let transactions = await this.transactionRepo.findRecent(userId, 1000); // Fetch a larger batch to filter
        
        if (startDate || endDate) {
            transactions = transactions.filter(t => {
                const tDate = new Date(t.date);
                if (startDate && tDate < startDate) return false;
                if (endDate && tDate > endDate) return false;
                return true;
            });
        }
        
        const recent = transactions.slice(0, limit);

        // Fetch categories and institutions to populate names
        const categories = await this.categoryRepo.findAllBaseAndUser(userId);
        const institutions = await this.institutionRepo.findByOwnerId(userId);
        
        const catMap = new Map(categories.map(c => [c.id, c]));
        const instMap = new Map(institutions.map(i => [i.id, i]));

        return recent.map(t => {
            const category = t.categoryId ? catMap.get(t.categoryId) : null;
            const institution = t.institutionId ? instMap.get(t.institutionId) : null;
            return {
                ...t,
                categoryName: category?.name,
                categoryColor: category?.color || undefined,
                institutionName: institution?.name,
            };
        });
    }

    // Range + active-status narrowing now happens in SQL (`findForDashboard`),
    // so the former in-memory `filterActive` is gone.

    private filterPending(transactions: FinancialTransaction[]): FinancialTransaction[] {
        return transactions.filter(t => t.status === "DETECTED");
    }
}
