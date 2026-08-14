"use client";

import Link from "next/link";
import { Landmark, Wallet, PiggyBank, TrendingUp } from "lucide-react";
import { formatBankNumber } from "@/lib/format-bank-number";
import { money, shortDate } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankAccountWithBalance } from "@/application/services/bank-service";
import type { BankAccountType } from "@/domain/entities/bank";

const TYPE_LABEL: Record<BankAccountType, string> = {
    CHECKING: "Corriente",
    SAVINGS: "Ahorros",
    CASH: "Efectivo",
    INVESTMENT: "Inversión",
};

const TYPE_ICON = {
    CHECKING: Landmark,
    SAVINGS: PiggyBank,
    CASH: Wallet,
    INVESTMENT: TrendingUp,
} as const;

interface AccountRowProps {
    account: BankAccountWithBalance;
    /**
     * Acción de mantenimiento a la derecha. Va fuera del enlace: anidar un
     * botón dentro de un `<a>` deja la fila sin saber qué hacer al tocarla.
     */
    action?: React.ReactNode;
}

export function AccountRow({ account, action }: AccountRowProps) {
    const number = formatBankNumber(account, "ACCOUNT");
    const Icon = TYPE_ICON[account.accountType];
    const negative = account.balance < 0;

    const row = (
        <Link
            href={`/financial/banks/accounts/${account.id}`}
            className="flex flex-1 items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/50"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                <Icon className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{account.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {TYPE_LABEL[account.accountType]}
                    {number && ` · ${number}`}
                    {/* Una detectada por un escaneo no entra a los saldos hasta
                        que el usuario la revisa. */}
                    {account.isUnconfirmed && (
                        <span className="text-amber-500"> · sin revisar</span>
                    )}
                </span>
            </span>

            <span className="shrink-0 text-right tabular-nums">
                <span className={cn(
                    "block text-sm font-semibold",
                    negative ? "text-rose-500" : "text-emerald-500",
                )}>
                    {negative && "−"}{money(account.balance)}
                </span>
                {account.lastSnapshotAt && (
                    <span className="block text-[10px] text-muted-foreground">
                        al {shortDate(account.lastSnapshotAt)}
                    </span>
                )}
            </span>
        </Link>
    );

    if (!action) return row;

    return <div className="flex items-center gap-2">{row}{action}</div>;
}
