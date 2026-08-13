"use client";

import { ArrowUpRight, ArrowDownLeft, CreditCard, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "../lib/format-money";
import type { BankMovement } from "@/domain/entities/bank";

const STYLE = {
    OUT: { Icon: ArrowUpRight, chip: "bg-rose-500/15 text-rose-500", amount: "text-rose-500", sign: "−" },
    IN: { Icon: ArrowDownLeft, chip: "bg-emerald-500/15 text-emerald-500", amount: "text-emerald-500", sign: "+" },
    CHARGE: { Icon: CreditCard, chip: "bg-rose-500/15 text-rose-500", amount: "text-rose-500", sign: "" },
    PAYMENT: { Icon: Banknote, chip: "bg-emerald-500/15 text-emerald-500", amount: "text-emerald-500", sign: "" },
} as const;

interface MovementRowProps {
    movement: BankMovement;
    /** Saldo que quedó tras este movimiento. Solo aplica a cuentas. */
    runningBalance?: number;
}

export function MovementRow({ movement, runningBalance }: MovementRowProps) {
    const { Icon, chip, amount, sign } = STYLE[movement.direction];
    const title = movement.merchant || movement.description || "Movimiento";
    const subtitle = movement.merchant && movement.description ? movement.description : null;

    return (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", chip)}>
                <Icon className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{title}</span>
                {subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                )}
            </span>

            <span className="shrink-0 text-right tabular-nums">
                <span className={cn("block text-sm font-semibold", amount)}>
                    {sign}{money(movement.amount)}
                </span>
                {runningBalance !== undefined && (
                    <span className="block text-[10px] text-muted-foreground">
                        {money(runningBalance)}
                    </span>
                )}
            </span>
        </div>
    );
}
