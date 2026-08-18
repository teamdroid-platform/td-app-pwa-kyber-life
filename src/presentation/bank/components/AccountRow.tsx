"use client";

import Link from "next/link";
import { ChevronRight, Landmark, Wallet, PiggyBank, TrendingUp } from "lucide-react";
import { formatLastFour } from "@/lib/format-bank-number";
import { ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL } from "@/lib/bank-identity-label";
import { IdentityBadge } from "./IdentityBadge";
import { money, shortDate } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankAccountWithBalance } from "@/application/services/bank-service";

const TYPE_ICON = {
    CHECKING: Landmark,
    SAVINGS: PiggyBank,
    CASH: Wallet,
    INVESTMENT: TrendingUp,
} as const;

interface AccountRowProps {
    account: BankAccountWithBalance;
}

/**
 * Una cuenta dentro del grupo de su emisor.
 *
 * Cada dato una sola vez: el título decía «Ahorros ••••0814» y el subtítulo
 * repetía «Ahorros · ••••0814» — el mismo texto dos veces, cortado arriba y
 * entero abajo. Ahora el acrónimo dice qué es, el número dice cuál, y la
 * segunda línea guarda lo que ninguno de los dos cuenta.
 *
 * Sin botón de editar: iba fuera de la tarjeta, así que ninguna fila medía
 * igual. Tocar la fila lleva al detalle, donde editar ya vive.
 */
export function AccountRow({ account }: AccountRowProps) {
    const Icon = TYPE_ICON[account.accountType];
    const negative = account.balance < 0;
    const number = formatLastFour(account);

    return (
        <Link
            href={`/financial/banks/accounts/${account.id}`}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500">
                <Icon className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <IdentityBadge
                        acronym={ACCOUNT_TYPE_ACRONYM[account.accountType]}
                        title={ACCOUNT_TYPE_LABEL[account.accountType]}
                    />
                    {number && <span className="font-mono text-sm font-semibold">{number}</span>}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                    {ACCOUNT_TYPE_LABEL[account.accountType]}
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

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
    );
}
