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
 * matter what its endpoints are), and only then does the scope decide — see
 * {@link crossScopeTransfer}.
 */
/**
 * Lo que una transferencia aporta al balance por cruzar el borde del
 * presupuesto: `+amount` si entra, `-amount` si sale, `0` si es neutra.
 *
 * Mover dinero a una cuenta que no presupuestas es sacarlo del bolsillo;
 * traerlo de vuelta es meterlo. Una transferencia entre dos cuentas incluidas
 * —o entre dos excluidas— no mueve nada.
 *
 * **Las dos puntas tienen que conocerse.** `isAccountIncluded` responde
 * «incluido» ante un id vacío, que es lo correcto para filtrar un gasto
 * huérfano pero no para decidir un signo: sin saber a dónde fue el dinero no
 * hay evidencia de que haya entrado al presupuesto. Sin esta condición, una
 * transferencia que salía de una cuenta excluida hacia un tercero sin
 * registrar —un anticipo, un pago a otra persona— se leía como «entró dinero»
 * y sumaba su importe entero al balance del periodo.
 *
 * No aplica a las transferencias marcadas como ahorro o fondeo: esas ya
 * llevan su signo por categoría y no llegan hasta aquí.
 */
export function crossScopeTransfer(
    t: BalanceTransaction,
    scope?: BalanceScope,
): number {
    if (!scope) return 0;
    if (!t.bankSourceAccountId || !t.bankDestinationAccountId) return 0;

    const fromIn = scope.isAccountIncluded(t.bankSourceAccountId);
    const toIn = scope.isAccountIncluded(t.bankDestinationAccountId);
    const amount = Number(t.amount);

    if (fromIn && !toIn) return -amount;
    if (!fromIn && toIn) return amount;
    return 0;
}

export interface BalanceDeltaOptions {
    categoryNameById?: ReadonlyMap<string, string>;
    scope?: BalanceScope;
    /**
     * Modo "con tarjetas": los consumos a crédito también restan, en vez de
     * quedar diferidos hasta que se paga la tarjeta. Es exactamente la
     * diferencia entre `period.value` y `withCredit.value`.
     */
    includeCredit?: boolean;
}

/**
 * Lo que **una** transacción le hace al balance: el sumando que
 * {@link computeNetBalance} le asigna dentro del bucle.
 *
 * Existe para que el saldo corriente de la lista no vuelva a implementar las
 * reglas por su cuenta. Son cinco casos con demasiada historia detrás —el
 * crédito diferido, el ahorro que manda sobre el alcance, la transferencia que
 * cruza el borde del presupuesto— y una segunda copia se habría desviado de
 * esta al primer ajuste.
 */
export function transactionBalanceDelta(
    t: BalanceTransaction,
    options: BalanceDeltaOptions = {},
): number {
    const { categoryNameById, scope, includeCredit } = options;
    const amount = Number(t.amount);

    if (t.type === "TRANSFER") {
        // La categoría manda sobre el scope: una transferencia marcada como
        // ahorro resta una sola vez, aunque su destino esté además excluido.
        if (isSavingsTransfer(t, categoryNameById)) return -amount;
        if (isFundingTransfer(t, categoryNameById)) return amount;
        return crossScopeTransfer(t, scope);
    }

    if (scope && !scope.isTransactionIncluded(t)) return 0;

    if (isIncomeType(t.type)) return amount;
    // Retiro: el efectivo cambia de forma, sigue disponible.
    if (isWithdrawalType(t.type)) return 0;
    if (t.paidWithCredit) return includeCredit ? -amount : 0;
    return -amount;
}

export function computeNetBalance(
    transactions: readonly BalanceTransaction[],
    categoryNameById?: ReadonlyMap<string, string>,
    scope?: BalanceScope,
): number {
    let balance = 0;

    for (const t of transactions) {
        balance += transactionBalanceDelta(t, { categoryNameById, scope });
    }

    return Math.round(balance * 100) / 100;
}

/** Lo mínimo que hace falta para ordenar un libro diario y nombrar sus filas. */
type LedgerTransaction = BalanceTransaction & {
    id?: string | null;
    date: string;
    createdAt?: string;
    status?: string;
};

export interface RunningBalanceEntry {
    /** El saldo acumulado después de esta transacción. */
    balance: number;
    /**
     * Si esta transacción movió el saldo. Falso cuando aportó 0 —crédito
     * diferido, retiro, transferencia neutra, cuenta fuera del alcance, fila
     * no contable—, y entonces su saldo es el de la fila anterior repetido.
     * Sin este dato, tres filas seguidas con el mismo saldo se leen como un
     * error de cálculo en vez de como la regla que son.
     */
    moved: boolean;
}

export type RunningBalanceOptions = BalanceDeltaOptions;

/**
 * Qué filas son dinero real. Las demás se listan igual —una detección sin
 * revisar se ve en la pantalla— pero aportan 0 y repiten el saldo anterior,
 * que es justo lo que hace con ellas el balance de la cabecera.
 *
 * Una fila sin estado cuenta: los cálculos del dominio se prueban con objetos
 * mínimos, y exigir el campo convertiría cada prueba en un formulario.
 */
function isLedgerCountable(t: LedgerTransaction): boolean {
    if (t.status === undefined) return true;
    return (DASHBOARD_ACTIVE_STATUSES as readonly string[]).includes(t.status);
}

/**
 * El saldo acumulado **después** de cada transacción, para leer la lista como
 * un libro diario.
 *
 * Arranca en cero al principio del rango, así que el saldo de la transacción
 * más reciente es exactamente el balance del periodo que muestra la cabecera.
 * Cualquier otro origen —el saldo total de las cuentas, por ejemplo— mezclaría
 * dos fuentes: ese sale de los saldos declarados y de movimientos que esta
 * lista no tiene por qué contener.
 *
 * El orden es el cronológico, no el de la pantalla: la lista se ve de lo nuevo
 * a lo viejo, pero un acumulado solo se puede construir al revés.
 */
export function computeRunningBalances(
    transactions: readonly LedgerTransaction[],
    options: RunningBalanceOptions = {},
): Record<string, RunningBalanceEntry> {
    const chronological = [...transactions].sort(compareLedgerOrder);

    const balances: Record<string, RunningBalanceEntry> = {};
    let running = 0;

    for (const t of chronological) {
        const delta = isLedgerCountable(t) ? transactionBalanceDelta(t, options) : 0;
        running += delta;
        if (t.id) {
            balances[t.id] = { balance: Math.round(running * 100) / 100, moved: delta !== 0 };
        }
    }

    return balances;
}

/**
 * Fecha, y a igualdad de fecha el orden en que se registraron. Dos movimientos
 * del mismo minuto son frecuentes —los importa el escáner en lote— y sin un
 * desempate estable el saldo de esas filas bailaba entre recargas.
 */
function compareLedgerOrder(a: LedgerTransaction, b: LedgerTransaction): number {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) return byDate;
    const byCreated = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
    if (byCreated !== 0) return byCreated;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

/**
 * Total of expenses paid with a credit card — the amount {@link computeNetBalance}
 * defers from the available balance. Subtract it from the net balance to get the
 * balance for PERIOD_WITH_CREDIT. Only expense-like transactions can be
 * `paidWithCredit`; income, withdrawals and transfers are ignored.
 *
 * `scope` restricts the sum to the same rows `computeNetBalance`/`buildPeriod`
 * would count (Task 1); omitted, behavior is unchanged. Gated on
 * `isTransactionIncluded`, not `isCardIncluded` alone: a credit expense can be
 * excluded via its source/destination account even with no card linked (e.g.
 * `paidWithCredit` inferred from description/notes), and using a narrower
 * predicate here than `buildPeriod` uses would let `withCredit.value` subtract
 * money the scope asked the app to ignore.
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
            (!scope || scope.isTransactionIncluded(t))
        ) {
            sum += Number(t.amount);
        }
    }
    return Math.round(sum * 100) / 100;
}
