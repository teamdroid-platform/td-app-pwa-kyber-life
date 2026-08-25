"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { FinancialTransaction } from "@/domain/entities/financial";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    CheckCircle2,
    AlertCircle,
    Archive,
    Trash2,
    MoreVertical,
    Loader2,
    TrendingDown,
    TrendingUp,
    ArrowRightLeft,
    Wallet,
    CreditCard,
    Undo2,
    ArrowDownToLine,
    Receipt,
    Landmark,
    MoreHorizontal
} from "lucide-react";

import { cn } from "@/lib/utils";
import { isTransactionPaidWithCredit } from "@/lib/financial-utils";
import { toast } from "sonner";
import {
    reviewTransactionAction,
    archiveTransactionAction,
    softDeleteTransactionAction,
} from "@/app/actions/financial-transactions";

// ─── Types ────────────────────────────────────────────────────

interface TransactionCardProps {
    transaction: FinancialTransaction;
    onStatusChange?: (status: FinancialTransaction["status"]) => void;
    onDeleted?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────

// Per-type visual style: concise label, badge color, and amount color.
interface TypeStyle {
    label: string;
    badge: string;
    amount: string;
    icon: React.ElementType;
}

const TYPE_STYLE: Record<string, TypeStyle> = {
    EXPENSE:      { label: "Gasto",         badge: "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20",          amount: "text-rose-500 dark:text-rose-400", icon: TrendingDown },
    INCOME:       { label: "Ingreso",       badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20", amount: "text-emerald-500 dark:text-emerald-400", icon: TrendingUp },
    TRANSFER:     { label: "Transferencia", badge: "bg-yellow-500/10 text-yellow-500 dark:text-yellow-400 border-yellow-500/20",             amount: "text-yellow-500 dark:text-yellow-400", icon: ArrowRightLeft },
    WITHDRAWAL:   { label: "Retiro",        badge: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20",    amount: "text-indigo-500 dark:text-indigo-400", icon: Wallet },
    PAYMENT:      { label: "Pago",          badge: "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20",          amount: "text-rose-500 dark:text-rose-400", icon: CreditCard },
    REFUND:       { label: "Reembolso",     badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20", amount: "text-emerald-500 dark:text-emerald-400", icon: Undo2 },
    DEPOSIT:      { label: "Depósito",      badge: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20", amount: "text-emerald-500 dark:text-emerald-400", icon: ArrowDownToLine },
    FEE:          { label: "Comisión",      badge: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",       amount: "text-amber-500 dark:text-amber-400", icon: Receipt },
    TAX:          { label: "Impuesto",      badge: "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",       amount: "text-amber-500 dark:text-amber-400", icon: Landmark },
    OTHER:        { label: "Otro",          badge: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",          amount: "text-zinc-600 dark:text-zinc-300", icon: MoreHorizontal },
};

const DEFAULT_TYPE_STYLE: TypeStyle = TYPE_STYLE.OTHER;


function formatAmount(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

function formatTime(dateStr: string): string {
    // The stored `date` is a literal wall-clock value (tagged UTC), so format it
    // in UTC to show exactly what's stored — no device-timezone shift.
    return new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(new Date(dateStr));
}

function getFallbackDescription(tx: FinancialTransaction, typeLabel: string): string {
    if (tx.description && tx.description.trim() !== "") return tx.description;
    
    // Attempt to extract from originStats if available
    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailSubject = stats?.emailSubject as string | undefined;
    if (emailSubject && emailSubject.trim() !== "") {
        return emailSubject;
    }

    const vendor = tx.institutionName || tx.merchant;
    const vendorStr = vendor ? ` en ${vendor}` : "";
    return `${typeLabel}${vendorStr}`;
}

// ─── Component ────────────────────────────────────────────────

export function TransactionCard({
    transaction,
    onStatusChange,
    onDeleted,
}: TransactionCardProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    // The row says "I heard you" for as long as the detail screen takes to
    // arrive. Own state rather than `useTransition` alone: the pending flag
    // depends on the router suspending, and the guard against repeated taps
    // has to hold either way.
    const [isOpening, setIsOpening] = useState(false);
    const [, startOpening] = useTransition();
    const pathname = usePathname();

    // Cleared once the navigation commits, so a row restored from the back
    // stack never keeps spinning.
    useEffect(() => {
        setIsOpening(false);
    }, [pathname]);

    const openDetail = () => {
        // Tapping again while it's already on its way does nothing: what made
        // people tap twice was the silence, not a missed press.
        if (isOpening) return;
        setIsOpening(true);
        startOpening(() => router.push(`/financial/transactions/${transaction.id}`));
    };

    const isIncome = ["INCOME", "DEPOSIT", "REFUND"].includes(transaction.type);
    const isExpense = ["EXPENSE", "PAYMENT", "FEE", "TAX"].includes(transaction.type);
    // Retiro y transferencia son neutros: no llevan signo + / -.
    const amountSign = isIncome ? "+" : isExpense ? "-" : "";
    const style = TYPE_STYLE[transaction.type] ?? DEFAULT_TYPE_STYLE;
    const typeLabel = style.label;
    const displayTitle = getFallbackDescription(transaction, typeLabel);
    const isPaidWithCredit = typeof transaction.paidWithCredit === "boolean"
        ? transaction.paidWithCredit
        : isTransactionPaidWithCredit(transaction);

    const handleAction = async (
        actionFn: (id: string) => Promise<{ success: boolean; error?: string }>,
        successMessage: string,
        statusUpdate?: FinancialTransaction["status"],
        isDelete = false,
    ) => {
        setIsLoading(true);
        try {
            const res = await actionFn(transaction.id!);
            if (res.success) {
                toast.success(successMessage, { id: `tx-action-success-${transaction.id}` });
                if (statusUpdate && onStatusChange) onStatusChange(statusUpdate);
                if (isDelete && onDeleted) onDeleted();
            } else {
                toast.error(res.error || "Ocurrió un error", { id: `tx-action-error-${transaction.id}` });
            }
        } catch {
            toast.error("Error inesperado", { id: `tx-action-unexpected-${transaction.id}` });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card
            className={cn(
                "group relative overflow-hidden rounded-[1.75rem] border-border/60 bg-bg-secondary py-0 shadow-sm shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                "flex flex-col h-full",
                // Presses land on the row itself, so the feedback is immediate
                // and doesn't wait for anything on the network.
                "active:scale-[0.985] active:shadow-sm",
                isOpening && "scale-[0.985] border-accent-primary/50 ring-1 ring-accent-primary/30",
                isLoading && "opacity-60 pointer-events-none",
            )}
        >
            {/* Decorative gradient line — it doubles as the progress hint while
                the detail screen loads. */}
            <div
                className={cn(
                    "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent",
                    isOpening && "h-0.5 animate-pulse via-accent-primary",
                )}
                aria-hidden="true"
            />

            {/* ── Nivel 1: Resumen (Siempre visible) ───────────────── */}
            <CardHeader
                className={cn(
                    "flex flex-row items-center justify-between w-full !space-y-0 !px-2.5 !py-2 sm:!px-4 sm:!py-3 select-none bg-bg-secondary/50 transition-colors gap-2.5 sm:gap-3",
                    "cursor-pointer hover:bg-bg-secondary",
                )}
                // The whole row opens the transaction. It used to expand an
                // inline summary while a small eye icon did the navigation —
                // two behaviours competing for the same tap.
                role="link"
                tabIndex={0}
                aria-busy={isOpening}
                onClick={openDetail}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail();
                    }
                }}
            >
                {/* Left Side: Badge + Title/Subtitle */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Badge and Time */}
                    <div className="shrink-0 flex flex-col items-center justify-center gap-1.5">
                        <div className="relative">
                            <div
                                className={cn(
                                    "flex items-center justify-center rounded-xl w-9 h-9 sm:rounded-2xl sm:w-11 sm:h-11 border",
                                    style.badge
                                )}
                                title={typeLabel}
                            >
                                {(() => {
                                    const Icon = style.icon;
                                    return <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />;
                                })()}
                            </div>
                            {isPaidWithCredit && (
                                <span
                                    className="absolute -top-1.5 -right-1.5 z-10 flex items-center gap-0.5 rounded-full border border-bg-secondary bg-amber-500 px-1.5 py-0.5 text-[8.5px] font-bold leading-none text-white shadow-sm shadow-black/20"
                                    title="Pagado con tarjeta de crédito — pendiente de reflejarse en el balance"
                                >
                                    <CreditCard className="h-2.5 w-2.5" /> TC
                                </span>
                            )}
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground leading-none">
                            {formatTime(transaction.date)}
                        </span>
                    </div>

                    {/* Text content */}
                    <div className="flex flex-col min-w-0 justify-center">
                        <CardTitle
                            className={cn(
                                "text-[13px] sm:text-base tracking-tight line-clamp-2 sm:line-clamp-3 break-words font-semibold transition-colors leading-snug group-hover:text-accent-primary",
                            )}
                            title={displayTitle}
                        >
                            {transaction.possibleDuplicate && transaction.status !== "DUPLICATE" && (
                                <AlertCircle className="inline-block h-3.5 w-3.5 text-warning-text mr-1" />
                            )}
                            {displayTitle}
                        </CardTitle>
                        <div className="flex items-start gap-2 mt-0.5 min-w-0">
                            <span className="line-clamp-1 sm:line-clamp-3 break-words text-[11px] sm:text-[13px] font-medium text-zinc-400" title={transaction.institutionName || transaction.merchant || typeLabel}>
                                {transaction.institutionName || transaction.merchant || typeLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 min-w-0">
                            {/* Category */}
                            {transaction.categoryName && (
                                <span className="text-[10px] sm:text-[11px] text-muted-foreground truncate" title={transaction.categoryName}>
                                    {transaction.categoryName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side: Amount + Actions */}
                <div className="flex flex-col items-end shrink-0 gap-1.5 ml-2">
                    <span
                        className={cn(
                            "text-[13.5px] sm:text-base font-bold tracking-tight whitespace-nowrap leading-none",
                            style.amount
                        )}
                        title={formatAmount(transaction.amount, transaction.currency)}
                    >
                        {amountSign}{formatAmount(transaction.amount, transaction.currency)}
                    </span>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">

                        {isOpening && (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-primary" aria-hidden="true" />
                        )}

                        <div className="flex items-center gap-1.5 ml-1" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1">
                                        <MoreVertical className="h-5 w-5" />
                                        <span className="sr-only">Opciones</span>
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                    {transaction.status === "DETECTED" && (
                                        <DropdownMenuItem
                                            onClick={() => handleAction(reviewTransactionAction, "Transacción marcada como revisada", "REVIEWED")}
                                        >
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Revisar
                                        </DropdownMenuItem>
                                    )}
                                    {transaction.status !== "ARCHIVED" && (
                                        <DropdownMenuItem
                                            onClick={() => handleAction(archiveTransactionAction, "Transacción archivada", "ARCHIVED")}
                                        >
                                            <Archive className="h-4 w-4 mr-2" />
                                            Archivar
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() => handleAction(softDeleteTransactionAction, "Transacción eliminada", "DELETED", true)}
                                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </CardHeader>

        </Card>
    );
}
