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

/**
 * Cómo se reparte un pago entre el estado de cuenta abierto y la deuda
 * corriente.
 *
 * El estado cobra primero porque es lo que tiene fecha de vencimiento; lo que
 * sobra baja la deuda histórica. Sin estado abierto —una tarjeta sin día de
 * corte configurado— el pago entero va contra la deuda, que es el caso normal
 * mientras el usuario no declara el ciclo de su tarjeta.
 */
export function allocatePayment(
    amount: number,
    openStatement: BankCardStatement | null,
): { toStatement: number; toDebt: number } {
    const due = openStatement ? computeStatementDue(openStatement) : 0;
    const toStatement = round2(Math.max(0, Math.min(amount, due)));
    return { toStatement, toDebt: round2(amount - toStatement) };
}

/** Si una fecha (ISO) cae dentro de un período de corte, ambos extremos incluidos. */
export function inStatementPeriod(date: string, periodStart: string, periodEnd: string): boolean {
    return date >= `${periodStart}T00:00:00Z` && date <= `${periodEnd}T23:59:59Z`;
}

/**
 * Lo que la app calcula para un período: la suma de sus consumos.
 *
 * Se recalcula al leer y no se fija al abrir el estado: los consumos llegan
 * durante todo el período —el escaneo, una captura tardía—, y un monto fijado
 * el primer día dejaba el estado muy por debajo de lo gastado.
 */
export function computePeriodCharges(
    movements: readonly BankMovement[], periodStart: string, periodEnd: string,
): number {
    return round2(movements
        .filter(m => m.direction === "CHARGE" && inStatementPeriod(m.date, periodStart, periodEnd))
        .reduce((sum, m) => sum + Number(m.amount), 0));
}

/**
 * El estado de cuenta que toca pagar: el más antiguo que aún debe algo.
 *
 * Un estado cerrado sin pagar es justamente lo que vence: el período se cierra
 * el día de corte y se paga días después. Mirar solo el abierto dejaba ese
 * estado fuera de los pagos y anunciaba el vencimiento del mes siguiente.
 */
export function payableStatement(
    statements: readonly BankCardStatement[],
): BankCardStatement | null {
    return [...statements]
        .filter(s => !s.isDeleted && computeStatementDue(s) > 0.004)
        .sort((a, b) => a.periodStart.localeCompare(b.periodStart))[0] ?? null;
}

export interface CardPeriodRange {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
}

/**
 * Los períodos de corte de una tarjeta, del actual hacia atrás, hasta el que
 * contiene `earliest` (el primer movimiento). Tope de `max` para que una fecha
 * vieja no genere cientos de períodos vacíos.
 */
export function cardPeriodsBack(
    statementDay: number, dueDay: number, today: Date, earliest: string | null, max = 36,
): CardPeriodRange[] {
    const periods: CardPeriodRange[] = [];
    let reference = today;
    for (let i = 0; i < max; i++) {
        const period = statementPeriodFor(statementDay, dueDay, reference);
        periods.push(period);
        if (!earliest || earliest.slice(0, 10) >= period.periodStart) break;
        const dayBefore = new Date(`${period.periodStart}T00:00:00Z`);
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        reference = dayBefore;
    }
    return periods;
}
