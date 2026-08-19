"use client";

import { cardLabel } from "@/lib/bank-identity-label";
import Link from "next/link";
import { ChevronLeft, Inbox } from "lucide-react";
import { formatBankNumber } from "@/lib/format-bank-number";
import { StatementPanel } from "./StatementPanel";
import { MovementRow } from "./MovementRow";
import { money, shortDate } from "../lib/format-money";
import { computeStatementDue } from "@/domain/services/bank-balance";
import { cn } from "@/lib/utils";
import type { BankCardDetail } from "@/application/services/bank-service";

/** Días entre hoy y la fecha de vencimiento. Negativo si ya venció. */
function daysUntil(date: string): number {
    const diff = Date.parse(`${date}T00:00:00Z`) - Date.now();
    return Math.ceil(diff / 86_400_000);
}

export function CardDetailClient({ initialData }: { initialData: BankCardDetail }) {
    const { card, statements, periodMovements, payableAccounts } = initialData;
    const number = formatBankNumber(card);
    const open = card.openStatement;
    const isCredit = card.cardType === "CREDIT";

    const usedPct = card.creditLimit
        ? Math.min(100, Math.round((card.debt / Number(card.creditLimit)) * 100))
        : null;

    const closed = statements.filter(s => s.id !== open?.id);
    const remaining = open ? daysUntil(open.dueDate) : null;

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
                    <h1 className="truncate text-xl font-bold tracking-tight">{cardLabel(card)}</h1>
                    <p className="truncate text-xs text-muted-foreground">
                        {card.institutionName ?? (isCredit ? "Crédito" : "Débito")}
                        {number && ` · ${number}`}
                    </p>
                </div>
            </header>

            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0d101d] from-45% to-[#26101c] px-5 py-4 shadow-lg shadow-black/30">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-4 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-rose-600/20 blur-3xl"
                />
                <div className="relative flex flex-col gap-2.5">
                    <p className="text-sm font-medium text-white/85">Deuda total</p>
                    <h2 className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-rose-400">
                        {money(card.debt)}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {open && remaining !== null && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[11px] text-amber-200">
                                Vence {shortDate(`${open.dueDate}T00:00:00Z`)}
                                {remaining >= 0 ? ` · en ${remaining} días` : " · vencido"}
                            </span>
                        )}
                        {card.availableCredit != null && (
                            <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/80">
                                Cupo libre {money(card.availableCredit)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {usedPct !== null && (
                <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-sm font-semibold">Cupo usado</h2>
                        <span className="text-sm font-semibold tabular-nums">{usedPct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                            className={cn(
                                "block h-full rounded-full",
                                usedPct >= 80
                                    ? "bg-gradient-to-r from-amber-500 to-rose-500"
                                    : "bg-emerald-500",
                            )}
                            style={{ width: `${usedPct}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Límite de crédito {money(Number(card.creditLimit))}
                    </p>
                </section>
            )}

            {open && <StatementPanel statement={open} accounts={payableAccounts} />}

            <section className="flex flex-col gap-2">
                <h2 className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Consumos del período
                </h2>
                {periodMovements.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-10 text-center">
                        <Inbox className="h-8 w-8 opacity-20" />
                        <p className="text-sm text-muted-foreground">
                            Sin consumos en este período.
                        </p>
                    </div>
                ) : (
                    periodMovements.map(movement => (
                        <MovementRow
                            key={`${movement.transactionId}-${movement.direction}`}
                            movement={movement}
                        />
                    ))
                )}
            </section>

            {closed.length > 0 && (
                <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
                    <h2 className="text-sm font-semibold">Estados anteriores</h2>
                    {closed.map(s => (
                        <div key={s.id} className="flex justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-muted-foreground">
                                {shortDate(`${s.periodStart}T00:00:00Z`)} – {shortDate(`${s.periodEnd}T00:00:00Z`)}
                            </span>
                            <span className={cn(
                                "shrink-0 font-semibold tabular-nums",
                                computeStatementDue(s) <= 0 ? "text-emerald-500" : "text-amber-500",
                            )}>
                                {computeStatementDue(s) <= 0
                                    ? `${money(s.paidAmount)} pagado`
                                    : `${money(computeStatementDue(s))} pendiente`}
                            </span>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}
