"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, Check, ChevronDown, Tag } from "lucide-react";
import {
    ResponsiveDialog,
    ResponsiveDialogContent,
    ResponsiveDialogHeader,
    ResponsiveDialogTitle,
    ResponsiveDialogBody,
} from "@/components/ui/responsive-dialog";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { CategoryPicker } from "./CategoryPicker";
import { getUncategorizedTransactionsAction } from "@/app/actions/financial-dashboard";
import { updateTransactionAction } from "@/app/actions/financial-transactions";
import { getCategoriesAction } from "@/app/actions/financial-settings";
import type { FinancialTransaction, FinancialCategory } from "@/domain/entities/financial";
import { cn } from "@/lib/utils";

interface UncategorizedTransactionsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    startDate?: string;
    endDate?: string;
    /** Called on close when at least one transaction was categorized. */
    onCategorized?: () => void;
}

/** Types that bring money in — the only ones shown with a plus. */
const INCOME_TYPES = new Set(["INCOME", "DEPOSIT", "REFUND"]);

function formatAmount(transaction: FinancialTransaction): string {
    const sign = INCOME_TYPES.has(transaction.type) ? "+" : "−";
    const amount = Math.abs(Number(transaction.amount)).toLocaleString("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${sign}$${amount}`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/** What a row is titled: the merchant if the scanner found one, else its description. */
function titleOf(transaction: FinancialTransaction): string {
    return transaction.merchant?.trim() || transaction.description || "Sin descripción";
}

/**
 * The list behind the dashboard's "Sin categoría" chip, with a category picker
 * on each row.
 *
 * Uncategorized spending silently drops out of every category chart, and the
 * transactions list has no filter for it — so until now the only way to find
 * these was to remember which ones they were. Each pick saves on its own: there
 * is no "guardar" button to forget to press, and a half-finished pass still
 * leaves the categories it did assign.
 */
export function UncategorizedTransactionsModal({
    open,
    onOpenChange,
    startDate,
    endDate,
    onCategorized,
}: UncategorizedTransactionsModalProps) {
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [categories, setCategories] = useState<FinancialCategory[]>([]);
    const [loading, setLoading] = useState(true);
    /** Category name assigned in this session, keyed by transaction id. */
    const [assigned, setAssigned] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    // Only one picker open at a time: it is a tall grid, and two of them
    // expanded on a phone push the rest of the list off the screen.
    const [openRowId, setOpenRowId] = useState<string | null>(null);
    const [query, setQuery] = useState("");

    // The parent mounts this only while it is open, so every state above starts
    // fresh on each visit and this effect only has to fetch.
    useEffect(() => {
        let cancelled = false;

        Promise.all([
            getUncategorizedTransactionsAction(startDate, endDate),
            getCategoriesAction(),
        ]).then(([orphans, cats]) => {
            if (cancelled) return;
            if (orphans.success) setTransactions(orphans.data);
            else toast.error(orphans.error);
            setCategories(cats);
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [startDate, endDate]);

    const handleOpenChange = useCallback((next: boolean) => {
        // The dashboard's counter and its category chart both go stale the
        // moment one of these gets a category, so refresh on the way out.
        if (!next && Object.keys(assigned).length > 0) onCategorized?.();
        onOpenChange(next);
    }, [assigned, onCategorized, onOpenChange]);

    const assign = useCallback(async (transaction: FinancialTransaction, categoryName: string) => {
        const category = categories.find((c) => c.name === categoryName);
        if (!category?.id) {
            toast.error("No se encontró esa categoría");
            return;
        }

        setSavingId(transaction.id!);
        const result = await updateTransactionAction(transaction.id!, { categoryId: category.id });
        setSavingId(null);

        if (!result.success) {
            toast.error(result.error ?? "No se pudo guardar la categoría");
            return;
        }

        setAssigned((prev) => ({ ...prev, [transaction.id!]: category.name }));
        setOpenRowId(null);
        setQuery("");
        toast.success(`${titleOf(transaction)} → ${category.name}`);
    }, [categories]);

    return (
        <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
            {/* Sin `ResponsiveDialogDescription`: el conteo ya lo da el chip que
                abre este modal, y repetirlo aquí solo roba alto en móvil. El
                `aria-describedby` explícito evita el aviso de Radix por no tenerla. */}
            <ResponsiveDialogContent aria-describedby={undefined}>
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            <Tag className="h-4 w-4" />
                        </span>
                        Sin categoría
                    </ResponsiveDialogTitle>
                </ResponsiveDialogHeader>

                <ResponsiveDialogBody>
                    {loading ? (
                        <div className="flex min-h-[180px] items-center justify-center">
                            <RobotLoader text="Cargando transacciones" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <p className="flex min-h-[140px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                            No hay transacciones sin categoría en este periodo.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2 px-4 py-2 sm:px-6">
                            {transactions.map((transaction) => {
                                const id = transaction.id!;
                                const assignedName = assigned[id];
                                const isOpen = openRowId === id;
                                const isSaving = savingId === id;

                                return (
                                    <li
                                        key={id}
                                        className={cn(
                                            "rounded-2xl border p-3 transition-colors",
                                            assignedName
                                                ? "border-emerald-500/30 bg-emerald-500/[0.05]"
                                                : "border-border/50 bg-muted/20",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[14px] font-medium leading-tight">
                                                    {titleOf(transaction)}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                    {formatDate(transaction.date)}
                                                    {transaction.institutionName ? ` · ${transaction.institutionName}` : ""}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-[14px] font-semibold tabular-nums">
                                                {formatAmount(transaction)}
                                            </span>
                                        </div>

                                        <div className="mt-2.5 flex items-stretch gap-2">
                                            <button
                                                type="button"
                                                disabled={isSaving}
                                                onClick={() => {
                                                    setOpenRowId(isOpen ? null : id);
                                                    setQuery("");
                                                }}
                                                className={cn(
                                                    "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors disabled:opacity-60",
                                                    assignedName
                                                        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                                        : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                                                )}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    {assignedName && <Check className="h-3.5 w-3.5 shrink-0" />}
                                                    <span className="truncate">
                                                        {isSaving
                                                            ? "Guardando…"
                                                            : assignedName ?? "Elegir categoría"}
                                                    </span>
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        "h-4 w-4 shrink-0 transition-transform duration-200",
                                                        isOpen && "rotate-180",
                                                    )}
                                                />
                                            </button>

                                            {/* Para lo que el picker no arregla: cambiar el importe, el
                                                tipo o la descripción. Sale del dashboard, así que el
                                                modal se desmonta — lo ya asignado quedó guardado solo. */}
                                            <Link
                                                href={`/financial/transactions/${id}`}
                                                aria-label={`Abrir el detalle de ${titleOf(transaction)}`}
                                                title="Abrir el detalle"
                                                className="flex shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 text-indigo-600 transition-colors hover:border-indigo-500/45 hover:bg-indigo-500/20 dark:text-indigo-400"
                                            >
                                                <ArrowUpRight className="h-4 w-4" />
                                            </Link>
                                        </div>

                                        {isOpen && (
                                            <div className="mt-3 animate-in fade-in slide-in-from-top-1">
                                                <CategoryPicker
                                                    categories={categories}
                                                    value={assignedName ?? ""}
                                                    onSelect={(name) => {
                                                        if (!name) {
                                                            setOpenRowId(null);
                                                            return;
                                                        }
                                                        void assign(transaction, name);
                                                    }}
                                                    onCategoriesChange={setCategories}
                                                    query={query}
                                                    onQueryChange={setQuery}
                                                />
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </ResponsiveDialogBody>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    );
}
