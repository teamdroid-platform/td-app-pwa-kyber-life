/** Monto en el formato del módulo: `$2.104,18`. Siempre dos decimales. */
export function money(value: number): string {
    return `$${Math.abs(value).toLocaleString("es-EC", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/** Igual, pero con signo explícito. Para movimientos, donde la dirección importa. */
export function signedMoney(value: number): string {
    if (value === 0) return money(0);
    return `${value < 0 ? "−" : "+"}${money(value)}`;
}

/**
 * Fecha corta: `12 ago`.
 *
 * Se lee en UTC a propósito. Todo lo que llega aquí es hora de pared
 * etiquetada como UTC —cortes de saldo, fechas de transacción— o una fecha
 * sin hora (`2026-09-28`, que JavaScript también lee como medianoche UTC).
 * Formateada en la zona del dispositivo, la medianoche de un día caía en la
 * noche anterior: un corte «al 25» salía «al 24», y un vencimiento del 28,
 * el 27.
 */
export function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });
}
