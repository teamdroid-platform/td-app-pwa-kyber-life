"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeStatementDue } from "@/domain/services/bank-balance";
import { payStatementAction, setStatementTotalAction } from "@/app/actions/bank";
import { accountLabel } from "@/lib/bank-identity-label";
import { money, shortDate } from "../lib/format-money";
import { cn } from "@/lib/utils";
import type { BankCardStatement } from "@/domain/entities/bank";
import type { BankAccountWithBalance } from "@/application/services/bank-service";

interface StatementPanelProps {
    statement: BankCardStatement;
    accounts: BankAccountWithBalance[];
}

export function StatementPanel({ statement, accounts }: StatementPanelProps) {
    const router = useRouter();
    const [paying, setPaying] = useState(false);
    const [editingTotal, setEditingTotal] = useState(false);
    const [totalDraft, setTotalDraft] = useState(String(statement.totalAmount ?? ""));

    const declared = statement.totalAmount;
    // La diferencia solo existe cuando el banco declaró su propio total. Es la
    // medida de cuánto se le escapó al escaneo ese mes, no un error a esconder.
    const gap = declared != null
        ? Math.round((Number(declared) - Number(statement.computedAmount)) * 100) / 100
        : null;
    const due = computeStatementDue(statement);

    // De momento se paga desde la primera cuenta activa. Con una sola cuenta
    // bancaria registrada acierta siempre; elegir entre varias es un sheet que
    // se añade cuando haga falta.
    const source = accounts.find(a => a.accountType !== "CASH") ?? accounts[0];

    async function handlePay() {
        if (!source) return;
        setPaying(true);
        const result = await payStatementAction({
            statementId: statement.id,
            sourceAccountId: source.id,
            amount: due,
            date: new Date().toISOString(),
        });
        setPaying(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success(`Pago de ${money(due)} registrado`);
        router.refresh();
    }

    async function handleSaveTotal() {
        const parsed = Number(totalDraft.replace(",", "."));
        if (Number.isNaN(parsed) || parsed < 0) {
            toast.error("Escribe el total que dice tu estado de cuenta");
            return;
        }
        const result = await setStatementTotalAction({
            statementId: statement.id,
            totalAmount: parsed,
        });
        if (!result.success) {
            toast.error(result.error);
            return;
        }
        setEditingTotal(false);
        toast.success("Total actualizado");
        router.refresh();
    }

    return (
        <section className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
                <h2 className="min-w-0 truncate text-sm font-semibold">
                    Estado · {shortDate(`${statement.periodStart}T00:00:00Z`)} – {shortDate(`${statement.periodEnd}T00:00:00Z`)}
                </h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                    vence {shortDate(`${statement.dueDate}T00:00:00Z`)}
                </span>
            </div>

            <Row label="Calculado por la app" value={money(statement.computedAmount)} />

            {editingTotal ? (
                <div className="flex items-center gap-2">
                    <Input
                        inputMode="decimal"
                        value={totalDraft}
                        onChange={e => setTotalDraft(e.target.value)}
                        placeholder="658.90"
                        aria-label="Total declarado por el banco"
                        autoFocus
                    />
                    <Button size="sm" onClick={handleSaveTotal}>Guardar</Button>
                </div>
            ) : (
                <button
                    onClick={() => setEditingTotal(true)}
                    className="flex justify-between gap-3 text-left text-sm"
                >
                    <span className="text-muted-foreground">
                        Declarado por el banco {declared == null && "· tocar para escribir"}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-amber-500">
                        {declared == null ? "—" : money(Number(declared))}
                    </span>
                </button>
            )}

            {gap != null && gap !== 0 && (
                <Row label="Diferencia sin explicar" value={money(gap)} tone="bad" />
            )}

            <Row label="Pagado" value={money(statement.paidAmount)} tone="good" />

            {due > 0 && (
                source ? (
                    <Button onClick={handlePay} disabled={paying} className="mt-1 w-full">
                        {paying ? "Registrando…" : `Pagar ${money(due)} desde ${accountLabel(source)}`}
                    </Button>
                ) : (
                    <p className="mt-1 text-xs leading-relaxed text-amber-500">
                        Registra una cuenta para poder pagar este estado.
                    </p>
                )
            )}
        </section>
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
