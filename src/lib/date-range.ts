/**
 * Shared date-range resolution for dashboard filters.
 *
 * Extracted from FinancialDashboard so the financial dashboard and the main
 * dashboard hub compute the same ISO range for "today / week / month / custom".
 */

export type RangeFilterType = "all" | "today" | "week" | "month" | "custom";

/**
 * The period options every filter shows, in this order and with these labels.
 * Single source of truth so the dashboards, the transactions list and the market
 * filter can't drift apart again ("Todo el tiempo" vs "Todos", "Esta semana" vs
 * "Semana", …). The custom range is appended by the period control itself.
 */
export const STANDARD_PERIOD_PRESETS: { id: Exclude<RangeFilterType, "custom">; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "today", label: "Hoy" },
    { id: "week", label: "Semana" },
    { id: "month", label: "Mes" },
];

/**
 * Canonical timezone the app uses to decide "what calendar day is it now".
 *
 * The billing cycle (22 → 21) must roll forward based on the *user's* local day,
 * not the day of whatever machine runs the code. Server Components render in UTC,
 * so `new Date()` there is hours ahead of a user west of UTC and the cycle would
 * flip early (e.g. at 23:00 local on the 21st it is already the 22nd in UTC).
 * Anchoring to a fixed zone keeps the server and the client in agreement and
 * matches the app's wall-clock treatment of transaction dates.
 *
 * Overridable via NEXT_PUBLIC_APP_TIMEZONE (must be a valid IANA zone). Public so
 * the value is identical in the SSR pass and the client bundle.
 */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/Guayaquil";

/**
 * Return a Date whose *local* components (getFullYear/getMonth/getDate/…) read
 * back as the wall-clock time of `now` in `timeZone`. Callers can then use the
 * ordinary local getters to reason about the zone's calendar day, independent of
 * where the code runs (UTC on the server, the device zone on the client).
 */
export function zonedNow(timeZone: string = APP_TIMEZONE, now: Date = new Date()): Date {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    // Intl with hour12:false can emit "24" for midnight in some engines; normalize.
    return new Date(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** Format a Date as a local YYYY-MM-DD string (suitable for <input type="date">). */
export function toDateInputValue(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format a Date as a local `YYYY-MM-DDTHH:mm` string for <input type="datetime-local">.
 * Uses local wall-clock components (NOT toISOString, which is UTC) so the value
 * round-trips correctly: `new Date(value).toISOString()` recovers the right instant.
 */
export function toDateTimeLocalValue(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Round a Date's minutes to the nearest 5-minute mark. Used to default a
 * datetime-local field with `step={300}` to an already-valid value, so the
 * field isn't born in a step-mismatch state.
 */
export function roundToNearestFiveMinutes(d: Date): Date {
    const rounded = new Date(d);
    const minutes = rounded.getMinutes();
    const remainder = minutes % 5;
    rounded.setMinutes(remainder < 3 ? minutes - remainder : minutes + (5 - remainder));
    rounded.setSeconds(0, 0);
    return rounded;
}

/**
 * A stored transaction `date` is a literal wall-clock value (the DB column holds
 * the time exactly as it should be shown, with no timezone math). Read its UTC
 * components verbatim into a `YYYY-MM-DDTHH:mm` value for <input datetime-local>,
 * so what's stored is what's displayed/edited — independent of the device's zone.
 */
export function isoToWallClockInput(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Inverse of {@link isoToWallClockInput}: persist the exact `YYYY-MM-DDTHH:mm`
 * digits from a datetime-local input (treated as UTC), so an edit round-trip
 * never shifts the stored time.
 */
export function wallClockInputToISO(value?: string | null): string | undefined {
    if (!value) return undefined;
    const normalized = value.length === 16 ? `${value}:00` : value;
    const d = new Date(`${normalized}Z`);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

/** Días que tiene un mes. `month` puede desbordar (−1, 12): Date lo normaliza. */
function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * El día de corte, recortado al último día real del mes. Con corte 31, febrero
 * ancla el 28: no hay forma de anclar un día que no existe.
 */
function anchorDay(year: number, month: number, startDay: number): number {
    return Math.min(startDay, daysInMonth(year, month));
}

/**
 * Ciclo que contiene `reference`, con extremos en YYYY-MM-DD.
 *
 * El fin es la víspera del ancla siguiente, nunca un día guardado: así dos
 * ciclos consecutivos no pueden dejar hueco ni solaparse, ni siquiera cuando
 * miden distinto por el recorte de los meses cortos.
 *
 * `reference` se lee por sus componentes locales y por defecto es "ahora"
 * resuelto en {@link APP_TIMEZONE}, para que el ciclo ruede con el día local
 * del usuario y no con el día UTC del servidor (ver {@link zonedNow}).
 */
export function cycleRangeContaining(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    const year = reference.getFullYear();
    const month = reference.getMonth();

    const anchorThisMonth = anchorDay(year, month, startDay);
    const anchorMonth = reference.getDate() >= anchorThisMonth ? month : month - 1;

    const start = new Date(year, anchorMonth, anchorDay(year, anchorMonth, startDay));
    const nextAnchor = new Date(year, anchorMonth + 1, anchorDay(year, anchorMonth + 1, startDay));
    const end = new Date(nextAnchor);
    end.setDate(nextAnchor.getDate() - 1);

    return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

/** Ciclo actual hasta `reference` inclusive — el preset "Mes" de Finanzas. */
export function cycleToDate(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    return {
        start: cycleRangeContaining(startDay, reference).start,
        end: toDateInputValue(reference),
    };
}

/**
 * El ciclo inmediatamente anterior al que contiene `reference`.
 *
 * Se calcula retrocediendo un día desde el inicio del ciclo actual, no restando
 * un mes: con corte 31 los ciclos no miden lo mismo y restar meses produciría
 * solapes.
 */
export function cyclePreviousRange(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    const current = cycleRangeContaining(startDay, reference);
    const dayBefore = new Date(`${current.start}T00:00:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    return cycleRangeContaining(startDay, dayBefore);
}

/** Expande un rango YYYY-MM-DD a Dates locales de día completo. */
export function toFullDayDates(
    range: { start: string; end: string },
): { start: Date; end: Date } {
    const start = new Date(`${range.start}T00:00:00`);
    const end = new Date(`${range.end}T00:00:00`);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

/** Lo mismo que {@link toFullDayDates}, serializado para las consultas. */
export function toFullDayIsoRange(
    range: { start: string; end: string },
): { startDate: string; endDate: string } {
    const { start, end } = toFullDayDates(range);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
}
