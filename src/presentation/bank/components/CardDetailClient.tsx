"use client";

import { useRef, useState } from "react";
import { cardLabel } from "@/lib/bank-identity-label";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { formatBankNumber } from "@/lib/format-bank-number";
import { StatementPanel } from "./StatementPanel";
import { PayCardSheet } from "./PayCardSheet";
import { MovementRow } from "./MovementRow";
import { DeleteCardPaymentButton } from "./DeleteCardPaymentButton";
import { money, shortDate } from "../lib/format-money";
import { computeStatementDue, inStatementPeriod } from "@/domain/services/bank-balance";
import { cn } from "@/lib/utils";
import type { BankCardDetail, CardPeriodView } from "@/application/services/bank-service";
import type { BankMovement } from "@/domain/entities/bank";

/**
 * Los movimientos agrupados por mes, del más reciente al más viejo.
 *
 * El mes se lee en UTC porque la fecha es hora de pared etiquetada como UTC:
 * en la zona del dispositivo, un consumo del 1 a primera hora caería en el mes
 * anterior.
 */
function groupByMonth(movements: BankMovement[]): { label: string; items: BankMovement[] }[] {
    const sorted = [...movements].sort((a, b) => b.date.localeCompare(a.date));
    const groups: { label: string; items: BankMovement[] }[] = [];
    for (const movement of sorted) {
        const label = new Date(movement.date).toLocaleDateString("es-EC", {
            month: "long", year: "numeric", timeZone: "UTC",
        });
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(movement);
        else groups.push({ label, items: [movement] });
    }
    return groups;
}

/** Días entre hoy y la fecha de vencimiento. Negativo si ya venció. */
function daysUntil(date: string): number {
    const diff = Date.parse(`${date}T00:00:00Z`) - Date.now();
    return Math.ceil(diff / 86_400_000);
}

/** Cómo está un período, en una palabra. */
function periodStatus(period: CardPeriodView): { label: string; tone: string } {
    if (period.isCurrent) return { label: "En curso", tone: "border-indigo-500/30 bg-indigo-500/10 text-indigo-500" };
    if (!period.statement) return { label: "Sin estado", tone: "border-border bg-muted text-muted-foreground" };
    return computeStatementDue(period.statement) <= 0
        ? { label: "Pagado", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" }
        : { label: "Cerrado", tone: "border-amber-500/30 bg-amber-500/10 text-amber-500" };
}

export function CardDetailClient({ initialData }: { initialData: BankCardDetail }) {
    const { card, statements, movements, periodMovements } = initialData;
    const periods = initialData.periods ?? [];
    // 0 = el período en curso; cuanto mayor, más atrás en el tiempo.
    const [selected, setSelected] = useState(0);
    const selectorRef = useRef<HTMLDivElement>(null);
    const withoutSource = new Set(initialData.paymentsWithoutSource ?? []);
    const number = formatBankNumber(card);
    const open = card.openStatement;
    const isCredit = card.cardType === "CREDIT";

    const usedPct = card.creditLimit
        ? Math.min(100, Math.round((card.debt / Number(card.creditLimit)) * 100))
        : null;

    const closed = statements.filter(s => s.id !== open?.id);
    // Lo que vence es el estado que aún se debe —normalmente el recién
    // cerrado—, no el abierto, que vence el mes que viene.
    const payable = card.payableStatement ?? null;
    const dueStatement = payable ?? open;
    const remaining = dueStatement ? daysUntil(dueStatement.dueDate) : null;

    // Sin día de corte no hay estado de cuenta, y sin estado no hay «periodo»:
    // la lista del periodo salía vacía aunque la tarjeta tuviera meses de
    // consumos y pagos encima, y la deuda de arriba no tenía nada que la
    // explicara. En ese caso se enseña la historia entera, por meses.
    const hasCycle = periods.length > 0 || !!open;
    const history = hasCycle ? [] : groupByMonth(movements);

    const period: CardPeriodView | null = periods[selected] ?? null;
    const shownMovements = period
        ? movements
            .filter(m => inStatementPeriod(m.date, period.periodStart, period.periodEnd))
            .sort((a, b) => b.date.localeCompare(a.date))
        : periodMovements;

    const showPeriod = (statementId: string) => {
        const index = periods.findIndex(p => p.statement?.id === statementId);
        if (index < 0) return;
        setSelected(index);
        selectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const renderMovement = (movement: BankMovement) => (
        <MovementRow
            key={`${movement.transactionId}-${movement.direction}`}
            movement={movement}
            withoutSource={
                movement.direction === "PAYMENT"
                && withoutSource.has(movement.transactionId)
            }
            action={movement.cardPaymentId ? (
                <DeleteCardPaymentButton paymentId={movement.cardPaymentId} amount={movement.amount} />
            ) : undefined}
        />
    );

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
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-rose-400">
                            {money(card.debt)}
                        </h2>
                        {isCredit && card.debt > 0 && (
                            <PayCardSheet card={card} />
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {dueStatement && remaining !== null && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[11px] text-amber-200">
                                Vence {shortDate(`${dueStatement.dueDate}T00:00:00Z`)}
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

            {period && (
                <div ref={selectorRef} className="flex scroll-mt-20 items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setSelected(i => Math.min(periods.length - 1, i + 1))}
                        disabled={selected >= periods.length - 1}
                        aria-label="Período anterior"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col items-center">
                        <span className="truncate text-sm font-semibold tabular-nums">
                            {shortDate(`${period.periodStart}T00:00:00Z`)} – {shortDate(`${period.periodEnd}T00:00:00Z`)}
                        </span>
                        <span className={cn(
                            "mt-0.5 rounded-full border px-2 py-px text-[10px] font-medium",
                            periodStatus(period).tone,
                        )}>
                            {periodStatus(period).label}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelected(i => Math.max(0, i - 1))}
                        disabled={selected === 0}
                        aria-label="Período siguiente"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            {period?.statement ? (
                <StatementPanel
                    key={period.statement.id}
                    statement={period.statement}
                    cardId={card.id}
                    debt={card.debt}
                    payable={payable?.id === period.statement.id}
                />
            ) : period ? (
                <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
                    <div className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">Consumos</span>
                        <span className="font-semibold tabular-nums">
                            {money(shownMovements.filter(m => m.direction === "CHARGE").reduce((sum, m) => sum + m.amount, 0))}
                        </span>
                    </div>
                    <div className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">Pagos</span>
                        <span className="font-semibold tabular-nums text-emerald-500">
                            {money(shownMovements.filter(m => m.direction === "PAYMENT").reduce((sum, m) => sum + m.amount, 0))}
                        </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Este período es anterior a que la tarjeta tuviera día de corte, así que no
                        tiene estado de cuenta: solo se listan sus movimientos.
                    </p>
                </section>
            ) : open ? (
                <StatementPanel statement={open} cardId={card.id} debt={card.debt} payable={payable?.id === open.id} />
            ) : null}

            {hasCycle ? (
                <section className="flex flex-col gap-2">
                    <h2 className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Consumos y pagos del período
                    </h2>
                    {shownMovements.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-10 text-center">
                            <Inbox className="h-8 w-8 opacity-20" />
                            <p className="text-sm text-muted-foreground">
                                Sin consumos ni pagos en este período.
                            </p>
                        </div>
                    ) : (
                        shownMovements.map(renderMovement)
                    )}
                </section>
            ) : (
                <section className="flex flex-col gap-2">
                    <h2 className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Consumos y pagos
                    </h2>
                    {isCredit && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Esta tarjeta no tiene día de corte ni de pago, así que se muestra
                            toda su historia. Configúralos en Bancos → Editar y la verás por
                            estado de cuenta, con su vencimiento.
                        </p>
                    )}
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-10 text-center">
                            <Inbox className="h-8 w-8 opacity-20" />
                            <p className="text-sm text-muted-foreground">
                                Todavía no hay consumos ni pagos con esta tarjeta.
                            </p>
                        </div>
                    ) : (
                        history.map(group => (
                            <div key={group.label} className="flex flex-col gap-2">
                                <h3 className="pt-2 text-xs font-semibold capitalize text-muted-foreground">
                                    {group.label}
                                </h3>
                                {group.items.map(renderMovement)}
                            </div>
                        ))
                    )}
                </section>
            )}

            {closed.length > 0 && (
                <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
                    <h2 className="text-sm font-semibold">Estados anteriores</h2>
                    {closed.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => showPeriod(s.id)}
                            className="flex justify-between gap-3 rounded-lg text-left text-sm transition-colors hover:bg-muted/50"
                        >
                            <span className="min-w-0 truncate text-muted-foreground">
                                {shortDate(`${s.periodStart}T00:00:00Z`)} – {shortDate(`${s.periodEnd}T00:00:00Z`)}
                            </span>
                            <span className={cn(
                                "shrink-0 font-semibold tabular-nums",
                                computeStatementDue(s) <= 0 ? "text-emerald-500" : "text-amber-500",
                            )}>
                                {computeStatementDue(s) <= 0
                                    ? `${money(s.paidAmount)} pagado`
                                    // Mismo tope que el panel: con saldo a favor se
                                    // debe menos que lo que suma el estado.
                                    : `${money(Math.min(computeStatementDue(s), Math.max(0, card.debt)))} pendiente`}
                            </span>
                        </button>
                    ))}
                </section>
            )}
        </div>
    );
}
