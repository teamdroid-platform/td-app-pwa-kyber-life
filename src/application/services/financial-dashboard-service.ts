import { UUID } from "../../domain/core";
import { FinancialTransaction } from "../../domain/entities/financial";
import { IFinancialTransactionRepository, IFinancialCategoryRepository, IFinancialInstitutionRepository, IFinancialScannerTransactionRepository } from "../../domain/repositories/financial";
import { computeNetBalance, isIncomeType, isWithdrawalType, isOtherType, isSavingsTransfer, isFundingTransfer } from "../../domain/services/financial-balance";
export interface FinancialKPIs {
    totalIncome: number;
    totalExpenses: number;
    /** Portion of `totalExpenses` paid with a credit card — deferred, not yet reflected in `netBalance`. */
    totalExpensesCredit: number;
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
    currency: string;
}

export interface CategoryBreakdown {
    categoryId: string | null;
    categoryName: string;
    total: number;
    /** Portion of `total` paid with a credit card — deferred, not yet reflected in the balance. */
    creditTotal: number;
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

export interface DashboardOverview {
    kpis: FinancialKPIs;
    monthly: MonthlyBreakdown[];
    typeBreakdown: TypeBreakdown[];
    categoryBreakdown: CategoryBreakdown[];
    institutionBreakdown: InstitutionBreakdown[];
    dailyBreakdown: DailyBreakdown[];
}

export class FinancialDashboardService {
    constructor(
        private transactionRepo: IFinancialTransactionRepository,
        private categoryRepo: IFinancialCategoryRepository,
        private institutionRepo: IFinancialInstitutionRepository,
        private scannerRepo?: IFinancialScannerTransactionRepository
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
        };
    }

    /** One read of each source, shared by every block of a dashboard load. */
    private async buildContext(userId: UUID, startDate?: Date, endDate?: Date): Promise<DashboardContext> {
        const [active, categories, institutions] = await Promise.all([
            this.transactionRepo.findForDashboard(userId, { startDate, endDate }),
            this.categoryRepo.findAllBaseAndUser(userId),
            this.institutionRepo.findByOwnerId(userId),
        ]);
        return { active, categories, institutions, pendingCount: await this.countPending(userId, startDate, endDate) };
    }

    /** Transactions for a block: from the shared context, or read on demand. */
    private async loadActive(
        userId: UUID,
        startDate?: Date,
        endDate?: Date,
        ctx?: DashboardContext,
    ): Promise<FinancialTransaction[]> {
        if (ctx) return ctx.active;
        return this.transactionRepo.findForDashboard(userId, { startDate, endDate });
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
            totalTransfers: Math.round(totalTransfers * 100) / 100,
            totalTransfersSavings: Math.round(totalTransfersSavings * 100) / 100,
            totalTransfersFunding: Math.round(totalTransfersFunding * 100) / 100,
            totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
            netBalance: Math.round(netBalance * 100) / 100,
            transactionCount,
            avgTransactionAmount: Math.round(avgTransactionAmount * 100) / 100,
            pendingTransactionsCount: pendingCount,
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

        const groups: Record<string, { total: number; creditTotal: number; count: number }> = {};
        let grandTotal = 0;

        for (const t of confirmed) {
            const catId = t.categoryId || "UNCATEGORIZED";
            if (!groups[catId]) {
                groups[catId] = { total: 0, creditTotal: 0, count: 0 };
            }
            const amount = Number(t.amount);
            groups[catId].total += amount;
            if (t.paidWithCredit) groups[catId].creditTotal += amount;
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
                groups[dateStr] = { date: dateStr, income: 0, expenses: 0, expensesCredit: 0, withdrawals: 0, other: 0, net: 0 };
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
                groups[dateStr].net -= amount;
            }
        }

        return Object.values(groups)
            .map(d => ({
                date: d.date,
                income: Math.round(d.income * 100) / 100,
                expenses: Math.round(d.expenses * 100) / 100,
                expensesCredit: Math.round(d.expensesCredit * 100) / 100,
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
