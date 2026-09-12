"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Check, X, Loader2 } from "lucide-react";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ScanAccountBadges } from "./ScanAccountBadges";
import { formatAmount, formatTime, getCategoryVisualConfig, categoryChipClass } from "../lib/scan-display";
import { sortScans, paginateScans, type ScanSort, type ScanSortField } from "../lib/scan-table";

interface ScanTableProps {
    scans: FinancialScannerTransaction[];
    /** Cuál se está procesando y qué se le está haciendo, para bloquear sus botones. */
    processing: { id: string; action: "confirm" | "dismiss" } | null;
    onApprove: (scan: FinancialScannerTransaction) => void;
    onReject: (id: string) => void;
}

const COLUMNS: { key: string; label: string; sortField?: ScanSortField; align?: "right" | "center" }[] = [
    { key: "date", label: "Fecha", sortField: "date" },
    // El comercio va bajo el título, en esta misma columna: es quién cobró, y
    // leerlo pegado a qué se cobró cuesta menos que cruzar la fila entera.
    { key: "description", label: "Descripción", sortField: "description" },
    { key: "category", label: "Categoría" },
    // Las cuentas piden su propia columna: son dos líneas de insignias cuando
    // hay origen y destino, y debajo del título empujaban el resto de la fila.
    { key: "accounts", label: "Cuentas" },
    { key: "amount", label: "Monto", sortField: "amount", align: "right" },
    { key: "actions", label: "Acciones", align: "center" },
];

const PAGE_SIZES = [10, 25, 50];

function dayParts(value?: string | null): { day: string; monthYear: string } {
    if (!value) return { day: "—", monthYear: "" };
    const date = new Date(value);
    return {
        day: new Intl.DateTimeFormat("es-ES", { day: "2-digit", timeZone: "UTC" }).format(date),
        monthYear: new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric", timeZone: "UTC" }).format(date),
    };
}

/**
 * La bandeja de escaneos como tabla, para pantallas anchas.
 *
 * Dos decisiones que la apartan de una tabla al uso:
 *
 * - **Aprobar y rechazar están a la vista**, no escondidas tras un menú. Es lo
 *   único que se viene a hacer aquí, y son 186 filas: un clic extra por fila
 *   son 186 clics extra.
 * - **No hay columna de estado.** Todo lo que está en esta pantalla está
 *   pendiente por definición; una columna que dice "Pendiente" 186 veces gasta
 *   ancho sin informar de nada.
 *
 * El orden y la paginación se resuelven aquí porque la pantalla ya tiene todos
 * los escaneos pendientes cargados: ordenar lo que tiene es ordenar el total.
 */
export function ScanTable({ scans, processing, onApprove, onReject }: ScanTableProps) {
    const [sort, setSort] = useState<ScanSort>({ field: "date", direction: "desc" });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const sorted = useMemo(() => sortScans(scans, sort), [scans, sort]);
    const view = useMemo(() => paginateScans(sorted, page, pageSize), [sorted, page, pageSize]);

    const toggleSort = (field: ScanSortField) => {
        setSort((current) => ({
            field,
            // Repetir columna invierte; cambiar de columna empieza por
            // descendente, que es lo que se espera de fechas e importes.
            direction: current.field === field && current.direction === "desc" ? "asc" : "desc",
        }));
        setPage(1);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-2xl border border-border/50">
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
                                        col.align === "center" && "text-center",
                                    )}
                                    aria-sort={
                                        col.sortField === sort.field
                                            ? sort.direction === "asc" ? "ascending" : "descending"
                                            : col.sortField ? "none" : undefined
                                    }
                                >
                                    {col.sortField ? (
                                        <button
                                            type="button"
                                            onClick={() => toggleSort(col.sortField!)}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 transition-colors hover:text-foreground",
                                                col.sortField === sort.field && "text-foreground",
                                            )}
                                        >
                                            {col.label}
                                            {col.sortField === sort.field ? (
                                                sort.direction === "asc"
                                                    ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                                                    : <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                                            ) : (
                                                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                                            )}
                                        </button>
                                    ) : col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {view.items.map((scan) => {
                            const visual = getCategoryVisualConfig(scan.category, scan.type);
                            const Icon = visual.icon;
                            const { day, monthYear } = dayParts(scan.date);
                            const busy = processing?.id === scan.id;

                            return (
                                <tr key={scan.id} className="border-b border-border/30 transition-colors last:border-b-0 hover:bg-muted/30">
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[17px] font-bold leading-none tabular-nums">{day}</span>
                                            <span className="flex flex-col text-[11px] leading-tight text-muted-foreground">
                                                <span>{monthYear}</span>
                                                <span className="tabular-nums">{formatTime(scan.date)}</span>
                                            </span>
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 align-top">
                                        <Link
                                            href={`/financial/scans/${scan.id}`}
                                            className="flex items-start gap-3 group"
                                        >
                                            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", visual.containerClass)}>
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            <span className="flex min-w-0 flex-col leading-tight">
                                                <span className="truncate text-[13.5px] font-semibold group-hover:underline">
                                                    {scan.description || scan.summary || "Sin descripción"}
                                                </span>
                                                {scan.merchant && (
                                                    <span className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                                                        {scan.merchant}
                                                    </span>
                                                )}
                                            </span>
                                        </Link>
                                    </td>

                                    <td className="px-4 py-3 align-top">
                                        {scan.category ? (
                                            <span className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11.5px] font-medium", categoryChipClass(visual))}>
                                                {scan.category}
                                            </span>
                                        ) : (
                                            <span className="text-[11.5px] text-muted-foreground">Sin categoría</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 align-top">
                                        {/* Origen y destino: en una transferencia, de dónde salió y a
                                            dónde entró es la mitad de lo que hay que revisar antes de
                                            aprobar. Cuando el escáner no identificó ninguna, la celda
                                            lo dice en vez de quedarse muda. */}
                                        <ScanAccountBadges scan={scan} emptyLabel="Sin cuenta identificada" />
                                    </td>

                                    <td className="px-4 py-3 text-right align-top">
                                        <span className="whitespace-nowrap text-[13.5px] font-bold tabular-nums">
                                            {scan.amount != null ? formatAmount(scan.amount, scan.currency ?? "USD") : "—"}
                                        </span>
                                    </td>

                                    <td className="px-3 py-3 align-top">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onReject(scan.id!)}
                                                disabled={busy}
                                                title="Rechazar"
                                                className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-600 transition-colors hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-400"
                                            >
                                                {busy && processing?.action === "dismiss"
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <X className="h-4 w-4 stroke-[2.5]" />}
                                                <span className="sr-only">Rechazar</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onApprove(scan)}
                                                disabled={busy}
                                                title="Aprobar"
                                                className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                                            >
                                                {busy && processing?.action === "confirm"
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <Check className="h-4 w-4 stroke-[2.5]" />}
                                                <span className="sr-only">Aprobar</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <span className="text-[12px] text-muted-foreground">
                    {view.total === 0
                        ? "Sin escaneos por confirmar"
                        : `Mostrando ${view.from}–${view.to} de ${view.total} escaneos`}
                </span>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={view.page <= 1}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-border/50 transition-colors hover:bg-muted/40 disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            <span className="sr-only">Página anterior</span>
                        </button>
                        <span className="px-2 text-[12px] tabular-nums text-muted-foreground">
                            {view.page} / {view.totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(view.totalPages, p + 1))}
                            disabled={view.page >= view.totalPages}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-border/50 transition-colors hover:bg-muted/40 disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                            <span className="sr-only">Página siguiente</span>
                        </button>
                    </div>

                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    >
                        <SelectTrigger className="h-8 w-[110px] rounded-lg border-border/40 bg-muted/40 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZES.map((size) => (
                                <SelectItem key={size} value={String(size)}>{size} filas</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
