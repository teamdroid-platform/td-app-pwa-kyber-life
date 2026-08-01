"use client";

import { useState } from "react";
import NextLink from "next/link";

import { FinancialTransaction } from "@/domain/entities/financial";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    CheckCircle2,
    AlertCircle,
    Sparkles,
    Archive,
    Trash2,
    Eye,
    ChevronDown,
    ChevronUp,
    MoreVertical,
    Clock,
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
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
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

/**
 * Extract the best available context from a transaction.
 * Priority: notes → originStats.emailBody → originStats.snippet
 */
function extractContext(tx: FinancialTransaction): string {
    if (tx.notes) return tx.notes;
    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailBody = stats?.emailBody as string | undefined;
    const snippet = stats?.snippet as string | undefined;
    
    if (emailBody) return `[MAIL] ${emailBody}`;
    if (snippet) return `[MAIL] ${snippet}`;
    
    return "";
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
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const isIncome = ["INCOME", "DEPOSIT", "REFUND"].includes(transaction.type);
    const isExpense = ["EXPENSE", "PAYMENT", "FEE", "TAX"].includes(transaction.type);
    // Retiro y transferencia son neutros: no llevan signo + / -.
    const amountSign = isIncome ? "+" : isExpense ? "-" : "";
    const style = TYPE_STYLE[transaction.type] ?? DEFAULT_TYPE_STYLE;
    const typeLabel = style.label;
    const displayContext = extractContext(transaction);
    const hasContext = displayContext.trim().length > 0;
    const displayTitle = getFallbackDescription(transaction, typeLabel);

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
                isLoading && "opacity-60 pointer-events-none",
            )}
        >
            {/* Decorative gradient line */}
            <div
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent"
                aria-hidden="true"
            />

            {/* ── Nivel 1: Resumen (Siempre visible) ───────────────── */}
            <CardHeader
                className={cn(
                    "flex flex-row items-center justify-between w-full !space-y-0 !px-2.5 !py-2 sm:!px-4 sm:!py-3 select-none bg-bg-secondary/50 transition-colors gap-2.5 sm:gap-3",
                    isExpanded && "border-b border-border/50",
                    hasContext && "cursor-pointer hover:bg-bg-secondary"
                )}
                onClick={() => hasContext && setIsExpanded(!isExpanded)}
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
                            {transaction.paidWithCredit && (
                                <span
                                    className="absolute -top-1.5 -right-1.5 z-10 flex items-center gap-0.5 rounded-full border border-bg-secondary bg-amber-500/60 px-1 py-0.5 text-[8px] font-bold leading-none text-white shadow-sm backdrop-blur-sm"
                                    title="Pagado con tarjeta de crédito — pendiente de reflejarse en el balance"
                                >
                                    <CreditCard className="h-2 w-2" /> TC
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
                                "text-[13px] sm:text-base tracking-tight line-clamp-2 sm:line-clamp-3 break-words font-semibold transition-colors leading-snug",
                                hasContext && "group-hover:text-accent-primary"
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

                        <div className="flex items-center gap-1.5 ml-1" onClick={(e) => e.stopPropagation()}>
                            <NextLink href={`/financial/transactions/${transaction.id}`} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                                <Eye className="h-[18px] w-[18px]" />
                                <span className="sr-only">Detalles</span>
                            </NextLink>

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

            {/* ── Nivel 2: Detalles Extensos (Desplegable) ──────────────────── */}
            {isExpanded && (
                <CardContent className="space-y-4 px-4 py-3 sm:px-5 animate-in slide-in-from-top-2 duration-200">
                    <div className="rounded-xl bg-bg-primary/50 p-3.5 border-none">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-accent-primary shrink-0" />
                            Resumen
                        </div>
                        <div className="w-full max-w-full overflow-hidden">
                            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words [word-break:break-word]">
                                {displayContext || "Sin resumen disponible para esta transacción."}
                            </p>
                        </div>
                    </div>

                    {/* Tags */}
                    {transaction.tags && transaction.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {transaction.tags.map((tag) => (
                                <Badge
                                    key={tag}
                                    variant="outline"
                                    className="rounded-full text-[10px] px-2 py-0"
                                >
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
