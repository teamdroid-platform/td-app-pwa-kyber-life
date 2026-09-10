import type { FinancialTransaction, FinancialTransactionType } from "@/domain/entities/financial";
import { DASHBOARD_ACTIVE_STATUSES } from "@/domain/services/financial-balance";

/**
 * A qué cubo va cada tipo de movimiento.
 *
 * Estaba dentro de `TransactionSummary`, que es donde se calculaban estos
 * totales. Salió aquí cuando la tabla de escritorio estrenó su propia fila de
 * KPIs: son las mismas cifras, y tenerlas calculadas en dos sitios era
 * asegurar que un día dijeran cosas distintas.
 */
export const TRANSACTION_SIGN: Record<FinancialTransactionType, "positive" | "negative" | "withdrawal" | "neutral"> = {
    INCOME: "positive",
    DEPOSIT: "positive",
    REFUND: "positive",
    EXPENSE: "negative",
    PAYMENT: "negative",
    FEE: "negative",
    TAX: "negative",
    WITHDRAWAL: "withdrawal",
    TRANSFER: "neutral",
    OTHER: "neutral",
};

export interface TransactionTotals {
    /** Ingresos menos gastos. Los retiros no restan: el efectivo cambia de forma. */
    balance: number;
    income: number;
    expense: number;
    /** Transferencias y otros: mueven dinero sin ser ingreso ni gasto. */
    other: number;
    withdrawal: number;
    /** La moneda que más se repite en el conjunto. */
    currency: string;
    /** Un valor por día con movimiento, cronológico, para las sparklines. */
    series: {
        income: number[];
        expense: number[];
        other: number[];
        withdrawal: number[];
    };
}

const EMPTY: TransactionTotals = {
    balance: 0,
    income: 0,
    expense: 0,
    other: 0,
    withdrawal: 0,
    currency: "USD",
    series: { income: [], expense: [], other: [], withdrawal: [] },
};

/**
 * Los totales del conjunto filtrado, y su serie diaria.
 *
 * Dos exclusiones, ambas deliberadas y heredadas del panel del que salió esto:
 *
 * - Solo cuentan los estados activos: una transacción detectada pero sin
 *   confirmar todavía no es dinero.
 * - Lo pagado con tarjeta queda fuera, porque no ha salido de la cuenta. Sale
 *   cuando se paga el estado de cuenta, y ahí sí cuenta.
 */
export function transactionTotals(transactions: FinancialTransaction[]): TransactionTotals {
    const countable = transactions.filter(
        (t) => (DASHBOARD_ACTIVE_STATUSES as readonly string[]).includes(t.status) && !t.paidWithCredit,
    );
    if (countable.length === 0) return { ...EMPTY, series: { income: [], expense: [], other: [], withdrawal: [] } };

    const currencyCounts: Record<string, number> = {};
    let income = 0;
    let expense = 0;
    let other = 0;
    let withdrawal = 0;

    /** Acumulado por día natural, indexado por su fecha para poder ordenarlo después. */
    const byDay = new Map<string, { income: number; expense: number; other: number; withdrawal: number }>();

    for (const t of countable) {
        currencyCounts[t.currency] = (currencyCounts[t.currency] ?? 0) + 1;

        const day = t.date.split("T")[0];
        let bucket = byDay.get(day);
        if (!bucket) {
            bucket = { income: 0, expense: 0, other: 0, withdrawal: 0 };
            byDay.set(day, bucket);
        }

        const amount = Number(t.amount);
        switch (TRANSACTION_SIGN[t.type]) {
            case "positive":
                income += amount;
                bucket.income += amount;
                break;
            case "negative":
                expense += amount;
                bucket.expense += amount;
                break;
            case "withdrawal":
                withdrawal += amount;
                bucket.withdrawal += amount;
                break;
            default:
                other += amount;
                bucket.other += amount;
        }
    }

    const days = [...byDay.keys()].sort();
    const currency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

    return {
        balance: round2(income - expense),
        income: round2(income),
        expense: round2(expense),
        other: round2(other),
        withdrawal: round2(withdrawal),
        currency,
        series: {
            income: days.map((d) => round2(byDay.get(d)!.income)),
            expense: days.map((d) => round2(byDay.get(d)!.expense)),
            other: days.map((d) => round2(byDay.get(d)!.other)),
            withdrawal: days.map((d) => round2(byDay.get(d)!.withdrawal)),
        },
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
