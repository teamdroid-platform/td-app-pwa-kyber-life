/**
 * Qué tan al día están los saldos declarados.
 *
 * El saldo que muestra la app se calcula desde el último corte más los
 * movimientos posteriores, así que un corte viejo no está mal: solo lleva
 * arrastrando más tiempo cualquier movimiento que la app no vio. Esto pone
 * número a ese arrastre para que el home pueda pedir la puesta al día sin que
 * el usuario tenga que entrar cuenta por cuenta a averiguarlo.
 */

/**
 * A partir de cuántos días un corte se considera viejo.
 *
 * Una semana: es el ritmo al que la mayoría revisa el banco, y más corto
 * convertiría el aviso en permanente — que es lo mismo que no avisar.
 */
export const STALE_AFTER_DAYS = 7;

export interface BalanceFreshness {
    /** Cuentas que pueden recibir un corte. */
    total: number;
    /** De esas, las que no tienen corte o lo tienen viejo. */
    pending: number;
    /** El corte más reciente de todas, o null si ninguna tiene. */
    lastAsOf: string | null;
}

/** Medianoche UTC: comparar días de calendario, no bloques de 24 horas. */
function startOfDay(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Días de calendario transcurridos desde `iso`. Negativo si la fecha es futura. */
export function daysSince(iso: string, now: Date = new Date()): number {
    return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
}

/** «hoy», «ayer», «hace 12 días». */
export function daysAgoLabel(iso: string, now: Date = new Date()): string {
    const days = daysSince(iso, now);
    if (days <= 0) return "hoy";
    if (days === 1) return "ayer";
    return `hace ${days} días`;
}

export function summarizeBalanceFreshness(
    entries: readonly { lastAsOf: string | null }[],
    now: Date = new Date(),
): BalanceFreshness {
    // Por instante, no por texto: la fecha llega de la base y no siempre con
    // el mismo formato («…Z» y «…+00:00» ordenan distinto como cadenas).
    const lastAsOf = entries.reduce<string | null>((latest, entry) => {
        if (!entry.lastAsOf) return latest;
        if (!latest) return entry.lastAsOf;
        return Date.parse(entry.lastAsOf) > Date.parse(latest) ? entry.lastAsOf : latest;
    }, null);

    return {
        total: entries.length,
        pending: entries.filter(
            e => !e.lastAsOf || daysSince(e.lastAsOf, now) >= STALE_AFTER_DAYS,
        ).length,
        lastAsOf,
    };
}
