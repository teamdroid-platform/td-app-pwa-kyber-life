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

export function AccountRow({ account }: { account: BankAccountWithBalance }) {
    const number = formatBankNumber(account, "ACCOUNT");
    const Icon = TYPE_ICON[account.accountType];
    const negative = account.balance < 0;

    return (
        <Link
            href={`/financial/banks/accounts/${account.id}`}
            className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/50"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                <Icon className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{account.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {TYPE_LABEL[account.accountType]}
                    {number && ` · ${number}`}
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
}
