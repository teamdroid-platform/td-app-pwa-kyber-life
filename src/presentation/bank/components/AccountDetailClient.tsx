"use client";

import { accountLabel } from "@/lib/bank-identity-label";
import { useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBankNumber } from "@/lib/format-bank-number";
import { BankBalanceHero } from "./BankBalanceHero";
import { MovementRow } from "./MovementRow";
import { BalanceSnapshotSheet } from "./BalanceSnapshotSheet";
import { money, shortDate } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankAccountDetail } from "@/application/services/bank-service";
import type { BankMovement } from "@/domain/entities/bank";

const TYPE_LABEL: Record<string, string> = {
    CHECKING: "Corriente", SAVINGS: "Ahorros",
    CASH: "Efectivo", INVESTMENT: "Inversión",
};

/** Agrupa por día conservando el orden (los movimientos ya vienen ordenados). */
function groupByDay(movements: BankMovement[], running: number[]) {
    const groups: { day: string; items: { movement: BankMovement; balance?: number }[] }[] = [];

    movements.forEach((movement, index) => {
        const day = movement.date.slice(0, 10);
        const last = groups[groups.length - 1];
        const entry = { movement, balance: running[index] };
        if (last && last.day === day) last.items.push(entry);
        else groups.push({ day, items: [entry] });
    });

    return groups;
}

export function AccountDetailClient({ initialData }: { initialData: BankAccountDetail }) {
    const { account, snapshots, movements, running } = initialData;
    const number = formatBankNumber(account);
    const latestSnapshot = snapshots[0];

    const days = useMemo(() => groupByDay(movements, running), [movements, running]);

    // Lo que se movió desde el corte. Es la cifra que explica por qué el saldo
    // de hoy no es el que declaró el banco.
    const sinceSnapshot = latestSnapshot
        ? Math.round((account.balance - Number(latestSnapshot.balance)) * 100) / 100
        : null;

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center gap-3">
                <Link
                    href="/financial/banks"
                    aria-label="Volver a Bancos"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xl font-bold tracking-tight">{accountLabel(account)}</h1>
                    <p className="truncate text-xs text-muted-foreground">
                        {account.institutionName ?? TYPE_LABEL[account.accountType]}
                        {number && ` · ${number}`}
                    </p>
                </div>
            </header>

            <BankBalanceHero
                totalAvailable={account.balance}
                totalDebt={0}
                totalAvailableCredit={0}
            />

            {latestSnapshot ? (
                <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-sm font-semibold">Conciliación</h2>
                        <BalanceSnapshotSheet
                            accountId={account.id}
                            trigger={
                                <button className="text-xs font-semibold text-primary">
                                    Registrar saldo
                                </button>
                            }
                        />
                    </div>

                    <Row
                        label={`Último corte declarado · ${shortDate(latestSnapshot.asOf)}`}
                        value={money(Number(latestSnapshot.balance))}
                    />
                    <Row
                        label={`Movimientos desde entonces (${movements.length})`}
                        value={`${sinceSnapshot! < 0 ? "−" : "+"}${money(sinceSnapshot!)}`}
                        tone={sinceSnapshot! < 0 ? "bad" : "good"}
                    />
                    <Row label="Saldo calculado" value={money(account.balance)} tone="good" />
                </section>
            ) : (
                <section className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-muted/30 p-4">
                    <p className="text-sm font-medium">Sin corte de saldo</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Registra el saldo que dice tu banco y desde ahí la app suma solo
                        los movimientos posteriores.
                    </p>
                    <BalanceSnapshotSheet
                        accountId={account.id}
                        trigger={<Button size="sm" variant="outline">Registrar saldo</Button>}
                    />
                </section>
            )}

            {days.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-10 text-center">
                    <Inbox className="h-8 w-8 opacity-20" />
                    <p className="text-sm text-muted-foreground">
                        Todavía no hay movimientos en esta cuenta.
                    </p>
                </div>
            ) : (
                days.map(({ day, items }) => (
                    <section key={day} className="flex flex-col gap-2">
                        <h2 className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {shortDate(`${day}T00:00:00Z`)}
                        </h2>
                        {items.map(({ movement, balance }) => (
                            <MovementRow
                                key={`${movement.transactionId}-${movement.direction}`}
                                movement={movement}
                                runningBalance={balance}
                            />
                        ))}
                    </section>
                ))
            )}
        </div>
    );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
    return (
        <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 text-muted-foreground">{label}</span>
            <span className={cn(
                "shrink-0 font-semibold tabular-nums",
                tone === "good" && "text-emerald-500",
                tone === "bad" && "text-rose-500",
            )}>
                {value}
            </span>
        </div>
    );
}
