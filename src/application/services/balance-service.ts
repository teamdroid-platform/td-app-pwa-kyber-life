import { UUID } from "../../domain/core";
import { FinancialTransaction } from "../../domain/entities/financial";
import { BalanceMode, DEFAULT_BALANCE_MODE } from "../../domain/entities/balance";
import {
    IFinancialTransactionRepository, IFinancialCategoryRepository,
} from "../../domain/repositories/financial";
import {
    IBankAccountRepository, IBankCardRepository, IBankMovementRepository,
    IBankAccountBalanceSnapshotRepository,
} from "../../domain/repositories/bank";
import { IBalanceSettingsRepository } from "../../domain/repositories/balance";
import { computeNetBalance, sumCreditExpenses, isIncomeType, isWithdrawalType, isSavingsTransfer, isFundingTransfer } from "../../domain/services/financial-balance";
import { computeTotalBalance, TotalBalanceAccount } from "../../domain/services/balance-modes";
import { computeAccountBalance, computeCardDebt } from "../../domain/services/bank-balance";
import { resolveScope, BalanceScope } from "../../domain/services/balance-scope";
import { isTransactionPaidWithCredit, creditCardIdSet } from "../../lib/financial-utils";
import { accountLabel } from "../../lib/bank-identity-label";

export interface BalanceSet {
    defaultMode: BalanceMode;
    currency: string;
    total: {
        value: number;
        accountsCounted: number;
        accountsWithoutSnapshot: { id: UUID; name: string }[];
        creditDebt: number;
    };
    /**
     * `expenses` es el gasto bruto: incluye lo pagado con tarjeta, igual que
     * `FinancialKPIs.totalExpenses`. `value` en cambio difiere exactamente
     * `withCredit.creditDeferred` de ese gasto, así que la identidad que se
     * cumple es:
     *
     *   income − expenses + withCredit.creditDeferred − savings + funding === value
     */
    period: {
        value: number;
        income: number;
        expenses: number;
        savings: number;
        funding: number;
        excludedCount: number;
    };
    withCredit: {
        value: number;
        creditDeferred: number;
    };
}

/**
 * Los tres balances de una sola lectura, para que el selector de la interfaz
 * pueda cambiar de modo sin volver al servidor.
 *
 * Lee de los repositorios directamente, no de `BankService.getOverview`: ese
 * método cierra estados de cuenta vencidos como efecto secundario, y este
 * servicio se invoca desde tres pantallas en cada carga.
 */
export class BalanceService {
    constructor(
        private transactionRepo: IFinancialTransactionRepository,
        private accountRepo: IBankAccountRepository,
        private cardRepo: IBankCardRepository,
        private movementRepo: IBankMovementRepository,
        private snapshotRepo: IBankAccountBalanceSnapshotRepository,
        private categoryRepo: IFinancialCategoryRepository,
        private settingsRepo: IBalanceSettingsRepository,
    ) {}

    async getBalanceSet(
        userId: UUID,
        range: { startDate?: Date; endDate?: Date },
    ): Promise<BalanceSet> {
        const [rawTransactions, accounts, cards, movements, categories, settings, rules] =
            await Promise.all([
                this.transactionRepo.findForDashboard(userId, range),
                this.accountRepo.findByOwnerId(userId),
                this.cardRepo.findByOwnerId(userId),
                this.movementRepo.findAllForOwner(userId),
                this.categoryRepo.findAllBaseAndUser(userId),
                this.settingsRepo.getSettings(userId),
                this.settingsRepo.getRules(userId),
            ]);

        const creditCardIds = creditCardIdSet(cards);
        const transactions: FinancialTransaction[] = rawTransactions.map(t => ({
            ...t,
            paidWithCredit: isTransactionPaidWithCredit(t, creditCardIds),
        }));

        const scope = resolveScope(rules, { accounts, cards });
        const categoryNameById = new Map(categories.map(c => [c.id!, c.name]));

        return {
            defaultMode: settings?.defaultMode ?? DEFAULT_BALANCE_MODE,
            currency: "USD",
            total: await this.buildTotal(accounts, cards, movements),
            period: this.buildPeriod(transactions, categoryNameById, scope),
            withCredit: this.buildWithCredit(transactions, categoryNameById, scope),
        };
    }

    private async buildTotal(
        accounts: Awaited<ReturnType<IBankAccountRepository["findByOwnerId"]>>,
        cards: Awaited<ReturnType<IBankCardRepository["findByOwnerId"]>>,
        movements: Awaited<ReturnType<IBankMovementRepository["findAllForOwner"]>>,
    ): Promise<BalanceSet["total"]> {
        const now = new Date().toISOString();

        const resolved: TotalBalanceAccount[] = await Promise.all(accounts.map(async account => {
            const own = movements.filter(m => m.accountId === account.id);
            const snapshot = await this.snapshotRepo.findLatestForAccount(account.id, now);
            return {
                id: account.id,
                // `institutionName` is decorated by BankService.namedByInstitution,
                // not by this repository (it maps raw rows only) — using it here
                // would silently fall through to the raw UUID in production.
                // `accountLabel` is the same "type + masked number" helper the
                // settings tree uses, and it's built from fields this repository
                // actually returns.
                name: accountLabel(account),
                balance: computeAccountBalance(snapshot, own),
                hasSnapshot: snapshot !== null,
                status: account.status,
                isUnconfirmed: account.isUnconfirmed,
                isDeleted: account.isDeleted,
            };
        }));

        const total = computeTotalBalance(resolved);

        const creditDebt = cards
            .filter(c => c.cardType === "CREDIT" && !c.isUnconfirmed && !c.isDeleted)
            .reduce((sum, c) => sum + computeCardDebt(movements.filter(m => m.cardId === c.id)), 0);

        return { ...total, creditDebt: Math.round(creditDebt * 100) / 100 };
    }

    private buildPeriod(
        transactions: readonly FinancialTransaction[],
        categoryNameById: ReadonlyMap<string, string>,
        scope: BalanceScope,
    ): BalanceSet["period"] {
        const inScope = transactions.filter(t => scope.isTransactionIncluded(t));

        const income = inScope
            .filter(t => isIncomeType(t.type))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const expenses = inScope
            .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const savings = inScope
            .filter(t => isSavingsTransfer(t, categoryNameById))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const funding = inScope
            .filter(t => isFundingTransfer(t, categoryNameById))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        return {
            value: computeNetBalance(transactions, categoryNameById, scope),
            income: round2(income),
            expenses: round2(expenses),
            savings: round2(savings),
            funding: round2(funding),
            excludedCount: transactions.length - inScope.length,
        };
    }

    private buildWithCredit(
        transactions: readonly FinancialTransaction[],
        categoryNameById: ReadonlyMap<string, string>,
        scope: BalanceScope,
    ): BalanceSet["withCredit"] {
        const period = computeNetBalance(transactions, categoryNameById, scope);
        const creditDeferred = sumCreditExpenses(transactions, scope);
        return {
            value: round2(period - creditDeferred),
            creditDeferred,
        };
    }
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}
