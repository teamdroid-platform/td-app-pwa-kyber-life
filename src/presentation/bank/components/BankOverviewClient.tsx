"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Landmark } from "lucide-react";
import { BankBalanceHero } from "./BankBalanceHero";
import { AccountRow } from "./AccountRow";
import { CardRow } from "./CardRow";
import { money, shortDate } from "../lib/format-money";
import type {
    BankOverview, BankAccountWithBalance, BankCardWithDebt,
} from "@/application/services/bank-service";

interface Group {
    id: string | null;
    name: string;
    accounts: BankAccountWithBalance[];
    cards: BankCardWithDebt[];
    total: number;
}

/**
 * Resumen del módulo: primero la respuesta —cuánto tengo disponible—, después
 * cuentas y tarjetas agrupadas por emisor. El efectivo no tiene institución,
 * así que cae en su propio grupo al final.
 */
export function BankOverviewClient({ initialData }: { initialData: BankOverview }) {
    const { institutions, accounts, cards } = initialData;

    const accountNameById = useMemo(
        () => new Map(accounts.map(a => [a.id, a.name])),
        [accounts],
    );

    const groups = useMemo<Group[]>(() => {
        const byInstitution: Group[] = institutions.map(inst => {
            const ownAccounts = accounts.filter(a => a.institutionId === inst.id);
            const ownCards = cards.filter(c => c.institutionId === inst.id);
            return {
                id: inst.id,
                name: inst.name,
                accounts: ownAccounts,
                cards: ownCards,
                total: ownAccounts.reduce((sum, a) => sum + a.balance, 0),
            };
        }).filter(g => g.accounts.length > 0 || g.cards.length > 0);

        const loose = accounts.filter(a => !a.institutionId);
        if (loose.length > 0) {
            byInstitution.push({
                id: null,
                name: "Efectivo",
                accounts: loose,
                cards: [],
                total: loose.reduce((sum, a) => sum + a.balance, 0),
            });
        }

        return byInstitution;
    }, [institutions, accounts, cards]);

    const isEmpty = accounts.length === 0 && cards.length === 0;

    return (
        <div className="flex flex-col gap-4">
            <BankBalanceHero
                totalAvailable={initialData.totalAvailable}
                totalDebt={initialData.totalDebt}
                totalAvailableCredit={initialData.totalAvailableCredit}
            />

            <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
                    <span className="text-[11px] text-muted-foreground">Efectivo en mano</span>
                    <span className="text-lg font-semibold tabular-nums">
                        {money(initialData.cashBalance)}
                    </span>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3">
                    <span className="text-[11px] text-muted-foreground">Próximo pago</span>
                    <span className="text-lg font-semibold tabular-nums text-amber-500">
                        {initialData.nextDueDate ? shortDate(initialData.nextDueDate) : "—"}
                    </span>
                </div>
            </div>

            {initialData.unconfirmedCount > 0 && (
                <Link
                    href="/financial/banks/reconcile"
                    className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400"
                >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        <b>{initialData.unconfirmedCount} cuentas sin identificar</b> detectadas en
                        escaneos anteriores. No entran a ningún saldo hasta que las confirmes.{" "}
                        <b>Conciliar →</b>
                    </span>
                </Link>
            )}

            {isEmpty ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-12 text-center">
                    <Landmark className="h-10 w-10 opacity-20" />
                    <p className="font-medium text-foreground">Todavía no registras cuentas</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        Añade tu banco y sus cuentas para empezar a ver saldos y deuda por tarjeta.
                    </p>
                </div>
            ) : (
                groups.map(group => (
                    <section key={group.id ?? "cash"} className="flex flex-col gap-2">
                        <header className="flex items-center gap-2 pt-1">
                            <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted-foreground">
                                {group.name}
                            </h2>
                            <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                                {money(group.total)}
                            </span>
                        </header>

                        {group.accounts.map(account => (
                            <AccountRow key={account.id} account={account} />
                        ))}
                        {group.cards.map(card => (
                            <CardRow
                                key={card.id}
                                card={card}
                                accountName={card.accountId ? accountNameById.get(card.accountId) : undefined}
                            />
                        ))}
                    </section>
                ))
            )}
        </div>
    );
}
