import {
    TrendingDown,
    TrendingUp,
    ArrowRightLeft,
    Wallet,
    CreditCard,
    Undo2,
    ArrowDownToLine,
    Receipt,
    Landmark,
    MoreHorizontal,
} from "lucide-react";
import type { FinancialTransaction } from "@/domain/entities/financial";

/**
 * Cómo se ve cada tipo de movimiento: su etiqueta corta, el color de su chip,
 * el del importe y su icono.
 *
 * Estaba dentro de `TransactionCard`. Salió aquí cuando el escritorio estrenó
 * la tabla, porque las dos vistas pintan lo mismo y un tipo nuevo tenía que
 * aparecer en ambas sin que nadie se acordara de copiarlo.
 */
export interface TypeStyle {
    label: string;
    badge: string;
    amount: string;
    icon: React.ElementType;
}

export const TYPE_STYLE: Record<string, TypeStyle> = {
    EXPENSE:    { label: "Gasto",         badge: "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20",             amount: "text-rose-500 dark:text-rose-400",       icon: TrendingDown },
    INCOME:     { label: "Ingreso",       badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20", amount: "text-emerald-500 dark:text-emerald-400", icon: TrendingUp },
    TRANSFER:   { label: "Transferencia", badge: "bg-yellow-500/10 text-yellow-500 dark:text-yellow-400 border-yellow-500/20",     amount: "text-yellow-500 dark:text-yellow-400",   icon: ArrowRightLeft },
    WITHDRAWAL: { label: "Retiro",        badge: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20",     amount: "text-indigo-500 dark:text-indigo-400",   icon: Wallet },
    PAYMENT:    { label: "Pago",          badge: "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20",             amount: "text-rose-500 dark:text-rose-400",       icon: CreditCard },
    REFUND:     { label: "Reembolso",     badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20", amount: "text-emerald-500 dark:text-emerald-400", icon: Undo2 },
    DEPOSIT:    { label: "Depósito",      badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20", amount: "text-emerald-500 dark:text-emerald-400", icon: ArrowDownToLine },
    FEE:        { label: "Comisión",      badge: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",         amount: "text-amber-500 dark:text-amber-400",     icon: Receipt },
    TAX:        { label: "Impuesto",      badge: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",         amount: "text-amber-500 dark:text-amber-400",     icon: Landmark },
    OTHER:      { label: "Otro",          badge: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",             amount: "text-zinc-600 dark:text-zinc-300",       icon: MoreHorizontal },
};

export const DEFAULT_TYPE_STYLE: TypeStyle = TYPE_STYLE.OTHER;

export function typeStyleOf(type: string): TypeStyle {
    return TYPE_STYLE[type] ?? DEFAULT_TYPE_STYLE;
}

/** Los tipos que suman, los que restan, y los neutros —retiro y transferencia— que no llevan signo. */
export function amountSignOf(type: string): "+" | "-" | "" {
    if (["INCOME", "DEPOSIT", "REFUND"].includes(type)) return "+";
    if (["EXPENSE", "PAYMENT", "FEE", "TAX"].includes(type)) return "-";
    return "";
}

export function formatAmount(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * El saldo corriente, sin símbolo de moneda.
 *
 * El importe de la fila, justo encima, ya la lleva; repetirla en un número que
 * vive debajo y en cuerpo pequeño solo le quita ancho al título. El signo sí
 * va siempre: es lo único que distingue un saldo a favor de uno en contra.
 *
 * La configuración regional es la de los balances (`es-EC`), no la de los
 * importes de la fila (`es-ES`), y la diferencia se ve: en español europeo los
 * millares no se separan hasta cinco cifras, así que el saldo de la última
 * transacción saldría «3058,33» bajo una cabecera que dice «3.058,33». Son el
 * mismo número y tienen que escribirse igual.
 */
export function formatRunningBalance(value: number): string {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/**
 * La hora se formatea en UTC a propósito: el `date` guardado es un valor de
 * reloj de pared etiquetado como UTC, así que convertirlo a la zona del
 * dispositivo lo movería de sitio.
 */
export function formatTime(dateStr: string): string {
    return new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(new Date(dateStr));
}

/** Día y mes/año por separado, como los pinta la columna de fecha de la tabla. */
export function formatDayParts(dateStr: string): { day: string; monthYear: string } {
    const date = new Date(dateStr);
    return {
        day: new Intl.DateTimeFormat("es-ES", { day: "2-digit", timeZone: "UTC" }).format(date),
        monthYear: new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric", timeZone: "UTC" }).format(date),
    };
}

/**
 * Qué se muestra como título cuando la transacción no trae descripción: el
 * asunto del correo que la originó, o el tipo con su comercio.
 */
export function getFallbackDescription(tx: FinancialTransaction, typeLabel: string): string {
    if (tx.description && tx.description.trim() !== "") return tx.description;

    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailSubject = stats?.emailSubject as string | undefined;
    if (emailSubject && emailSubject.trim() !== "") return emailSubject;

    const vendor = tx.institutionName || tx.merchant;
    const vendorStr = vendor ? ` en ${vendor}` : "";
    return `${typeLabel}${vendorStr}`;
}
