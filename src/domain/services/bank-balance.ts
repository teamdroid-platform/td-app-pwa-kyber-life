import {
    BankMovement, BankAccountBalanceSnapshot, BankCardStatement,
} from "../entities/bank";

/** Redondeo a centavos, para que las sumas de floats no arrastren ruido. */
function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Saldo actual de una cuenta: el último corte declarado más lo que se movió
 * después. Sin corte, la suma de todos los movimientos.
 *
 * Las líneas de tarjeta (CHARGE, PAYMENT) no tocan el saldo de una cuenta: un
 * consumo con crédito no saca dinero de ningún lado hasta que se paga la
 * tarjeta, y ese pago ya viene como su propia línea OUT sobre la cuenta.
 */
export function computeAccountBalance(
    snapshot: BankAccountBalanceSnapshot | null,
    movements: readonly BankMovement[],
): number {
    const since = snapshot ? Date.parse(snapshot.asOf) : null;
    let balance = snapshot ? Number(snapshot.balance) : 0;

    for (const m of movements) {
        if (since !== null && Date.parse(m.date) <= since) continue;
        if (m.direction === "IN") balance += Number(m.amount);
        else if (m.direction === "OUT") balance -= Number(m.amount);
    }

    return round2(balance);
}

/** Deuda histórica de una tarjeta: consumos menos pagos. */
export function computeCardDebt(movements: readonly BankMovement[]): number {
    let debt = 0;
    for (const m of movements) {
        if (m.direction === "CHARGE") debt += Number(m.amount);
        else if (m.direction === "PAYMENT") debt -= Number(m.amount);
    }
    return round2(debt);
}

/** Cupo libre. Null cuando la tarjeta no declara límite. */
export function computeAvailableCredit(
    creditLimit: number | null | undefined,
    debt: number,
): number | null {
    if (creditLimit === null || creditLimit === undefined) return null;
    return round2(Number(creditLimit) - debt);
}

/**
 * Lo que falta pagar de un estado de cuenta. El total declarado por el banco
 * manda sobre el que calculó la app: el banco es la autoridad y el escaneo
 * puede haberse perdido consumos.
 */
export function computeStatementDue(statement: BankCardStatement): number {
    const total = statement.totalAmount ?? statement.computedAmount;
    return round2(Number(total) - Number(statement.paidAmount));
}

/**
 * Saldo después de cada movimiento, calculado hacia atrás desde el saldo
 * actual. `movements` debe venir del más reciente al más antiguo, que es el
 * orden en que se listan. El resultado es paralelo: `result[i]` es el saldo que
 * quedó tras `movements[i]`.
 */
export function runningBalances(
    currentBalance: number,
    movements: readonly BankMovement[],
): number[] {
    const result: number[] = [];
    let balance = currentBalance;

    for (const m of movements) {
        result.push(round2(balance));
        if (m.direction === "IN") balance -= Number(m.amount);
        else if (m.direction === "OUT") balance += Number(m.amount);
    }

    return result;
}

function toISODate(year: number, monthIndex: number, day: number): string {
    // Día 0 del mes siguiente = último día de este mes; recorta el 31 en meses cortos.
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)))
        .toISOString().slice(0, 10);
}

export interface StatementPeriod {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
}

/**
 * El período de facturación vigente en `reference`.
 *
 * El período cierra el `statementDay` y abre el día siguiente al cierre
 * anterior. Cuando el día de pago cae antes que el de corte, el vencimiento es
 * del mes siguiente al cierre.
 */
export function statementPeriodFor(
    statementDay: number,
    dueDay: number,
    reference: Date,
): StatementPeriod {
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    const day = reference.getUTCDate();

    // Si ya pasó el corte de este mes, el período en curso cierra el mes que viene.
    const closeMonth = day > statementDay ? month + 1 : month;

    const periodEnd = toISODate(year, closeMonth, statementDay);

    const previousClose = new Date(`${toISODate(year, closeMonth - 1, statementDay)}T00:00:00Z`);
    previousClose.setUTCDate(previousClose.getUTCDate() + 1);
    const periodStart = previousClose.toISOString().slice(0, 10);

    const dueMonth = dueDay > statementDay ? closeMonth : closeMonth + 1;
    const dueDate = toISODate(year, dueMonth, dueDay);

    return { periodStart, periodEnd, dueDate };
}
