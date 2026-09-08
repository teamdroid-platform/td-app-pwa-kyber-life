import type {
    FinancialKPIs,
    CategoryBreakdown,
    DailyBreakdown,
    PreviousPeriodComparison,
} from "@/application/services/financial-dashboard-service";

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Same key the service uses for spending with no category attached. */
const UNCATEGORIZED_KEY = "UNCATEGORIZED";

// ─────────────────────────── cascada de flujo de caja ───────────────────────────

export type CashFlowKind = "in" | "out" | "transfer" | "total";

export interface CashFlowStep {
    key: string;
    label: string;
    /** Signed movement. Positive adds to the running balance, negative takes from it. */
    amount: number;
    /** Balance after applying this step. The last step's is the period's net balance. */
    running: number;
    kind: CashFlowKind;
    /** One line explaining what this step is, shown in the tooltip. */
    note: string;
}

/**
 * The period's balance told as a sequence: what came in, what went out, and in
 * what order, ending exactly on `kpis.netBalance`.
 *
 * Two things are deliberately not steps:
 *
 * - **Credit-card spending** never left the account, so it cannot move the
 *   running total. The chart shows it as a separate marker instead.
 * - **Withdrawals** only change the form of the cash (account → pocket), which
 *   is why `computeNetBalance` ignores them. Subtracting them here would make
 *   the cascade miss the balance it is supposed to explain.
 */
export function buildCashFlowSteps(kpis: FinancialKPIs): CashFlowStep[] {
    const consumption = round2(kpis.totalExpenses - kpis.totalExpensesCredit - kpis.totalExpensesSettlement);

    const candidates: Omit<CashFlowStep, "running">[] = [
        {
            key: "income",
            label: "Ingresos",
            amount: kpis.totalIncome,
            kind: "in",
            note: "Sueldo, reembolsos y demás dinero que entró",
        },
        {
            key: "consumption",
            label: "Consumo",
            amount: -consumption,
            kind: "out",
            note: "Gasto real pagado en efectivo o débito",
        },
        {
            key: "settlement",
            label: "Pago de tarjetas",
            amount: -kpis.totalExpensesSettlement,
            kind: "transfer",
            note: "Salda deuda ya gastada: no es consumo nuevo",
        },
        {
            key: "savings",
            label: "Ahorro",
            amount: -kpis.totalTransfersSavings,
            kind: "transfer",
            note: "Transferido fuera de lo disponible",
        },
        {
            key: "funding",
            label: "Reintegro",
            amount: kpis.totalTransfersFunding,
            kind: "in",
            note: "Traído de vuelta desde ahorro",
        },
    ];

    let running = 0;
    const steps: CashFlowStep[] = [];
    for (const candidate of candidates) {
        // A step worth zero says nothing; income stays even at zero so the
        // cascade always starts from a labelled origin.
        if (candidate.amount === 0 && candidate.key !== "income") continue;
        running = round2(running + candidate.amount);
        steps.push({ ...candidate, running });
    }

    steps.push({
        key: "total",
        label: "Balance",
        amount: kpis.netBalance,
        running: kpis.netBalance,
        kind: "total",
        note: "Lo que queda del periodo",
    });

    return steps;
}

// ─────────────────────────── categorías vs. periodo anterior ───────────────────────────

export interface CategoryDeltaRow extends CategoryBreakdown {
    /** What this category cost in the equivalent previous range, or `null` if it is new. */
    previousTotal: number | null;
    /** Percentage change against `previousTotal`, rounded. `null` when incomparable. */
    deltaPct: number | null;
}

/**
 * Pair every category with what it cost last period, so a bar can say "+12%"
 * instead of only "$669".
 *
 * `includePayments` has to match whatever the chart is showing: with the
 * card-settlement toggle on, the previous figure must include the settled debt
 * too, or the comparison silently measures two different things.
 */
export function withCategoryDeltas(
    current: CategoryBreakdown[],
    previous: PreviousPeriodComparison | null,
    includePayments: boolean,
): CategoryDeltaRow[] {
    return current.map((category) => {
        if (!previous) return { ...category, previousTotal: null, deltaPct: null };

        const key = category.categoryId ?? UNCATEGORIZED_KEY;
        const consumption = previous.categoryTotals[key];
        const settled = includePayments ? previous.categoryPaymentTotals[key] : undefined;

        if (consumption === undefined && settled === undefined) {
            return { ...category, previousTotal: null, deltaPct: null };
        }

        const previousTotal = round2((consumption ?? 0) + (settled ?? 0));
        return {
            ...category,
            previousTotal,
            deltaPct: previousTotal > 0 ? Math.round((category.total / previousTotal - 1) * 100) : null,
        };
    });
}

// ─────────────────────────── ritmo del ciclo ───────────────────────────

export interface PacePoint {
    /** 1-based day of the range. */
    day: number;
    /** Consumption accumulated so far this period, `null` for days not yet lived. */
    current: number | null;
    /** Same accumulation in the equivalent previous range. */
    previous: number | null;
    /** The dotted continuation of today's pace; `null` before today. */
    projected: number | null;
}

export interface PaceSeries {
    points: PacePoint[];
    /** Days of the range already lived. */
    elapsedDays: number;
    totalDays: number;
    /** Consumption so far. */
    spent: number;
    /** Where today's pace lands by the end of the range; `null` once the range is over. */
    projected: number | null;
    /** What the equivalent previous range ended at. */
    previousTotal: number;
    /** Projection (or final spend) against `previousTotal`, in percent. */
    deltaPct: number | null;
}

/**
 * The spending rhythm of the range: what has been consumed day by day, the same
 * curve for the previous range, and where today's pace is heading.
 *
 * Card settlements are stripped out on both sides — paying off a card in one
 * lump would otherwise read as a spending spree.
 *
 * Returns `null` when there is nothing honest to draw: an open-ended range has
 * no cycle, and without a previous period the curve has nothing to be measured
 * against.
 */
export function buildPaceSeries(
    daily: DailyBreakdown[],
    previous: PreviousPeriodComparison | null,
    startISO: string | undefined,
    endISO: string | undefined,
    now: Date = new Date(),
): PaceSeries | null {
    if (!startISO || !endISO || !previous) return null;

    const start = new Date(startISO);
    const end = new Date(endISO);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / DAY_MS));

    const dayIndexOf = (date: Date) => Math.floor((date.getTime() - start.getTime()) / DAY_MS);
    const elapsedDays = Math.min(totalDays, Math.max(1, dayIndexOf(now) + 1));

    const perDay = new Array<number>(totalDays).fill(0);
    for (const day of daily) {
        const index = dayIndexOf(new Date(`${day.date}T00:00:00Z`));
        if (index < 0 || index >= totalDays) continue;
        perDay[index] += day.expenses - day.expensesSettlement;
    }

    const points: PacePoint[] = [];
    let currentRunning = 0;
    let previousRunning = 0;
    let spent = 0;

    for (let i = 0; i < totalDays; i++) {
        currentRunning = round2(currentRunning + perDay[i]);
        previousRunning = round2(previousRunning + (previous.dailyExpenses[i] ?? 0));
        const lived = i < elapsedDays;
        if (lived) spent = currentRunning;
        points.push({
            day: i + 1,
            current: lived ? currentRunning : null,
            previous: previousRunning,
            projected: null,
        });
    }

    const rangeIsOver = elapsedDays >= totalDays;
    const projected = rangeIsOver ? null : round2((spent / elapsedDays) * totalDays);

    if (projected !== null) {
        // The dotted line starts at today's point so the two segments join up.
        points[elapsedDays - 1].projected = spent;
        points[totalDays - 1].projected = projected;
        for (let i = elapsedDays; i < totalDays - 1; i++) {
            const progress = (i + 1 - elapsedDays) / (totalDays - elapsedDays);
            points[i].projected = round2(spent + (projected - spent) * progress);
        }
    }

    const outcome = projected ?? spent;
    return {
        points,
        elapsedDays,
        totalDays,
        spent,
        projected,
        previousTotal: previous.totalExpenses,
        deltaPct: previous.totalExpenses > 0 ? Math.round((outcome / previous.totalExpenses - 1) * 100) : null,
    };
}
