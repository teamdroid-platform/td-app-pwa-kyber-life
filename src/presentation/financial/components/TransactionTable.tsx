"use client";

import { useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, CreditCard, AlertCircle } from "lucide-react";
import type { FinancialTransaction } from "@/domain/entities/financial";
import { TRANSACTION_SORT_FIELDS, type TransactionSortField } from "@/domain/pagination";
import { isTransactionPaidWithCredit } from "@/lib/financial-utils";
import { cn } from "@/lib/utils";
import { TransactionRowMenu } from "./TransactionRowMenu";
import {
    typeStyleOf,
    amountSignOf,
    formatAmount,
    formatTime,
    formatDayParts,
    getFallbackDescription,
} from "../lib/transaction-display";

interface TransactionTableProps {
    transactions: FinancialTransaction[];
    onStatusChange: (id: string, status: FinancialTransaction["status"]) => void;
    onDeleted: (id: string) => void;
}

/** Las columnas, y cuáles se pueden ordenar. */
const COLUMNS: { key: string; label: string; sortField?: TransactionSortField; align?: "right" }[] = [
    { key: "date", label: "Fecha", sortField: "date" },
    { key: "description", label: "Descripción", sortField: "description" },
    { key: "category", label: "Categoría" },
    { key: "institution", label: "Institución / Origen" },
    { key: "amount", label: "Monto", sortField: "amount", align: "right" },
    { key: "actions", label: "" },
];

/**
 * La lista de transacciones como tabla, para pantallas anchas.
 *
 * En móvil sigue mandando la lista de tarjetas: una tabla de seis columnas en
 * 360px no es una tabla, es un acordeón mal hecho.
 *
 * El orden vive en la URL y lo resuelve el servidor. Es deliberado: la lista
 * tiene scroll infinito, así que ordenar en el cliente ordenaría las veinte
 * filas cargadas y parecería que ordenó las ciento cincuenta y siete.
 */
export function TransactionTable({ transactions, onStatusChange, onDeleted }: TransactionTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const rawSortBy = searchParams.get("sortBy");
    const activeField = (TRANSACTION_SORT_FIELDS as readonly string[]).includes(rawSortBy ?? "")
        ? (rawSortBy as TransactionSortField)
        : "date";
    const activeDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    const toggleSort = useCallback((field: TransactionSortField) => {
        const params = new URLSearchParams(searchParams.toString());
        // Pulsar la columna activa invierte; cambiar de columna empieza por
        // descendente, que es lo que se espera de fechas e importes.
        const nextDir = field === activeField && activeDir === "desc" ? "asc" : "desc";
        params.set("sortBy", field);
        params.set("sortDir", nextDir);
        // Una página distinta del mismo orden no tiene sentido: al reordenar se
        // vuelve al principio.
        params.delete("page");
        startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    }, [searchParams, activeField, activeDir, pathname, router]);

    return (
        <div className={cn("overflow-x-auto rounded-2xl border border-border/50", isPending && "opacity-60 transition-opacity")}>
            <table className="w-full border-collapse text-left">
                <thead>
                    <tr className="border-b border-border/50">
                        {COLUMNS.map((col) => (
                            <th
                                key={col.key}
                                scope="col"
                                className={cn(
                                    "px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                                    col.align === "right" && "text-right",
                                )}
                                aria-sort={
                                    col.sortField === activeField
                                        ? activeDir === "asc" ? "ascending" : "descending"
                                        : col.sortField ? "none" : undefined
                                }
                            >
                                {col.sortField ? (
                                    <button
                                        type="button"
                                        onClick={() => toggleSort(col.sortField!)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 transition-colors hover:text-foreground",
                                            col.sortField === activeField && "text-foreground",
                                        )}
                                    >
                                        {col.label}
                                        <SortIcon
                                            active={col.sortField === activeField}
                                            direction={activeDir}
                                        />
                                    </button>
                                ) : (
                                    <span className={col.key === "actions" ? "sr-only" : undefined}>
                                        {col.label || "Acciones"}
                                    </span>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {transactions.map((t) => {
                        const style = typeStyleOf(t.type);
                        const Icon = style.icon;
                        const { day, monthYear } = formatDayParts(t.date);
                        const sign = amountSignOf(t.type);
                        const onCredit = isTransactionPaidWithCredit(t);

                        return (
                            <tr
                                key={t.id}
                                onClick={() => router.push(`/financial/transactions/${t.id}`)}
                                className="cursor-pointer border-b border-border/30 transition-colors last:border-b-0 hover:bg-muted/30"
                            >
                                <td className="px-4 py-3 align-middle">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[17px] font-bold leading-none tabular-nums">{day}</span>
                                        <span className="flex flex-col text-[11px] leading-tight text-muted-foreground">
                                            <span>{monthYear}</span>
                                            <span className="tabular-nums">{formatTime(t.date)}</span>
                                        </span>
                                    </div>
                                </td>

                                <td className="px-4 py-3 align-middle">
                                    <div className="flex items-center gap-3">
                                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", style.badge)}>
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="flex min-w-0 flex-col leading-tight">
                                            <span className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
                                                {t.possibleDuplicate && (
                                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning-text" aria-label="Posible duplicado" />
                                                )}
                                                {getFallbackDescription(t, style.label)}
                                            </span>
                                            {t.merchant && (
                                                <span className="truncate text-[11.5px] text-muted-foreground">{t.merchant}</span>
                                            )}
                                        </span>
                                    </div>
                                </td>

                                <td className="px-4 py-3 align-middle">
                                    {t.categoryName ? (
                                        <span
                                            className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
                                            style={
                                                t.categoryColor
                                                    ? {
                                                        color: t.categoryColor,
                                                        borderColor: `color-mix(in srgb, ${t.categoryColor} 35%, transparent)`,
                                                        backgroundColor: `color-mix(in srgb, ${t.categoryColor} 12%, transparent)`,
                                                    }
                                                    : undefined
                                            }
                                        >
                                            {t.categoryName}
                                        </span>
                                    ) : (
                                        <span className="text-[11.5px] text-muted-foreground">Sin categoría</span>
                                    )}
                                </td>

                                <td className="px-4 py-3 align-middle">
                                    <span className="block truncate text-[12.5px] text-muted-foreground">
                                        {t.institutionName || t.merchant || "—"}
                                    </span>
                                </td>

                                <td className="px-4 py-3 text-right align-middle">
                                    <span className={cn("inline-flex items-center justify-end gap-1.5 whitespace-nowrap text-[13.5px] font-bold tabular-nums", style.amount)}>
                                        {onCredit && (
                                            <CreditCard className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Pagado con tarjeta" />
                                        )}
                                        {sign}{formatAmount(Number(t.amount), t.currency)}
                                    </span>
                                </td>

                                <td className="px-2 py-3 text-right align-middle">
                                    <TransactionRowMenu
                                        transaction={t}
                                        onStatusChange={(status) => onStatusChange(t.id!, status)}
                                        onDeleted={() => onDeleted(t.id!)}
                                        className="justify-end"
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
    if (!active) return <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />;
    return direction === "asc"
        ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
        : <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />;
}
