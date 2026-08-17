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

/** Fecha corta local: `12 ago`. */
export function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}
