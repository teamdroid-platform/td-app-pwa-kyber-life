"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, ArrowRightLeft, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinancialTransactionType } from "@/domain/entities/financial";

export interface TransactionTypeOption {
    value: FinancialTransactionType;
    label: string;
    Icon: LucideIcon;
    color: string;
}

/**
 * The four transaction types offered as quick-pick chips. Icons and colors mirror
 * the finance module's TransactionCard palette so a type reads the same everywhere.
 * Order: Ingreso · Gasto · Transferencia · Retiro.
 */
export const DEFAULT_TRANSACTION_TYPE_OPTIONS: TransactionTypeOption[] = [
    { value: "INCOME", label: "Ingreso", Icon: TrendingUp, color: "text-emerald-500" },
    { value: "EXPENSE", label: "Gasto", Icon: TrendingDown, color: "text-rose-500" },
    { value: "TRANSFER", label: "Transferencia", Icon: ArrowRightLeft, color: "text-yellow-500" },
    { value: "WITHDRAWAL", label: "Retiro", Icon: Wallet, color: "text-indigo-500" },
];

/**
 * Presentation for any transaction type, including the ones the quick-pick
 * chips don't offer (PAYMENT, REFUND, FEE…). Those still exist on scanned
 * records, so a detail screen must be able to label them.
 */
const FALLBACK_TYPE_LABELS: Record<string, string> = {
    PAYMENT: "Pago",
    REFUND: "Reembolso",
    DEPOSIT: "Depósito",
    FEE: "Comisión",
    TAX: "Impuesto",
    OTHER: "Otro",
};

export function resolveTransactionTypeOption(type: string): Omit<TransactionTypeOption, "value"> {
    const known = DEFAULT_TRANSACTION_TYPE_OPTIONS.find((o) => o.value === type);
    if (known) return known;
    return { label: FALLBACK_TYPE_LABELS[type] ?? type, Icon: Wallet, color: "text-text-tertiary" };
}

export interface TransactionTypeChipsProps {
    value: FinancialTransactionType;
    onChange: (value: FinancialTransactionType) => void;
    options?: TransactionTypeOption[];
}

/** Grid of quick-pick chips for choosing a transaction type. */
export function TransactionTypeChips({ value, onChange, options = DEFAULT_TRANSACTION_TYPE_OPTIONS }: TransactionTypeChipsProps) {
    return (
        <div className="grid grid-cols-4 gap-2">
            {options.map((opt) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        aria-pressed={active}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 transition-all",
                            active
                                ? "border-transparent bg-accent-primary text-accent-primary-foreground shadow-lg shadow-accent-primary/20"
                                : "border-border/40 bg-bg-secondary/50 text-text-secondary hover:border-border",
                        )}
                    >
                        <opt.Icon className={cn("h-5 w-5", active ? "" : opt.color)} />
                        <span className="text-[11px] font-medium leading-none">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
