"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, Landmark, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdentityBadge } from "./IdentityBadge";
import { money } from "../lib/format-money";
import { formatIdentityNumber } from "@/lib/format-bank-number";
import { ACCOUNT_TYPE_ACRONYM, ACCOUNT_TYPE_LABEL } from "@/lib/bank-identity-label";
import { daysAgoLabel } from "@/lib/balance-freshness";
import { registerBalanceSnapshotsAction } from "@/app/actions/bank";
import type { AccountBalanceStatus } from "@/application/services/bank-service";

/** Fecha de hoy en el formato que espera `<input type="date">`. */
function todayInput(): string {
    return new Date().toISOString().slice(0, 10);
}

/** El emisor con el que se agrupa una cuenta; el efectivo no tiene ninguno. */
function issuerOf(entry: AccountBalanceStatus): string {
    return entry.account.institutionName?.trim() || "Sin institución";
}

interface BalanceBoardClientProps {
    entries: AccountBalanceStatus[];
}

/**
 * Poner al día todos los saldos de una sentada.
 *
 * El corte de una cuenta suelta ya se pone desde su ficha. Lo que faltaba era
 * el día en que el usuario se sienta con el banco abierto: entrar cuenta por
 * cuenta, abrir un menú y un formulario cada vez, y volver a escribir la misma
 * fecha cuatro veces. Aquí la fecha se escribe una sola vez arriba y cada
 * cuenta solo pide su número.
 *
 * Lo que se deja en blanco no se toca: no llenar una casilla es decir «esa no
 * la miré», no «esa está en cero».
 */
export function BalanceBoardClient({ entries }: BalanceBoardClientProps) {
    const router = useRouter();
    const [asOf, setAsOf] = useState(todayInput);
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    // Agrupadas por emisor, en el mismo orden en que llegan: la lista de una
    // cuenta detrás de otra sin decir de qué banco es obliga a leer el número
    // entero para ubicarse.
    const groups = useMemo(() => {
        const byIssuer = new Map<string, AccountBalanceStatus[]>();
        for (const entry of entries) {
            const issuer = issuerOf(entry);
            const list = byIssuer.get(issuer);
            if (list) list.push(entry);
            else byIssuer.set(issuer, [entry]);
        }
        return Array.from(byIssuer, ([issuer, accounts]) => ({ issuer, accounts }));
    }, [entries]);

    const filled = useMemo(
        () => Object.entries(values).filter(([, raw]) => raw.trim() !== ""),
        [values],
    );

    async function save() {
        const parsed = filled.map(([accountId, raw]) => ({
            accountId,
            balance: Number(raw.replace(",", ".")),
        }));

        if (parsed.some(entry => Number.isNaN(entry.balance))) {
            toast.error("Hay un saldo que no es un número");
            return;
        }

        setSaving(true);
        const result = await registerBalanceSnapshotsAction({
            asOf: new Date(`${asOf}T00:00:00`).toISOString(),
            entries: parsed,
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success(
            result.data === 1 ? "1 saldo registrado" : `${result.data} saldos registrados`,
        );
        setValues({});
        router.refresh();
    }

    return (
        <div className="flex flex-col gap-3">
            <header className="flex items-center gap-3">
                <Link
                    href="/dashboard"
                    aria-label="Volver al inicio"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xl font-bold tracking-tight">Saldos a la fecha</h1>
                    <p className="truncate text-xs text-muted-foreground">
                        Escribe el saldo que muestra cada cuenta. Lo que no llenes se queda como estaba.
                    </p>
                </div>
            </header>

            {entries.length === 0 ? (
                <p className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                    No tienes cuentas activas todavía. Regístralas en{" "}
                    <Link href="/financial/banks" className="font-semibold text-foreground underline">
                        Bancos
                    </Link>{" "}
                    y vuelve aquí a declarar sus saldos.
                </p>
            ) : (
                <>
                    <label
                        htmlFor="board-as-of"
                        className="flex items-center gap-3 rounded-2xl border bg-card p-3"
                    >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                            <CalendarDays className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Fecha del corte
                        </span>
                        <Input
                            id="board-as-of"
                            type="date"
                            value={asOf}
                            onChange={e => setAsOf(e.target.value)}
                            className="h-9 w-[9.5rem] shrink-0"
                        />
                    </label>

                    {groups.map(({ issuer, accounts }) => (
                        <section key={issuer} className="overflow-hidden rounded-2xl border bg-card">
                            <h2 className="flex items-center gap-2 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                {issuer === "Sin institución"
                                    ? <Wallet className="h-3.5 w-3.5" />
                                    : <Landmark className="h-3.5 w-3.5" />}
                                {issuer}
                            </h2>

                            {accounts.map(({ account, lastAsOf, lastBalance }) => {
                                const number = formatIdentityNumber(account);
                                const acronym = ACCOUNT_TYPE_ACRONYM[account.accountType];
                                const type = ACCOUNT_TYPE_LABEL[account.accountType];

                                return (
                                    <div
                                        key={account.id}
                                        className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
                                    >
                                        <label htmlFor={`balance-${account.id}`} className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <IdentityBadge acronym={acronym} title={type} />
                                                <span className="truncate font-mono text-sm font-semibold">
                                                    {number || type}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                                {lastAsOf
                                                    ? `${money(lastBalance ?? 0)} · ${daysAgoLabel(lastAsOf)}`
                                                    : "sin registrar"}
                                            </span>
                                        </label>

                                        <Input
                                            id={`balance-${account.id}`}
                                            inputMode="decimal"
                                            placeholder="0,00"
                                            value={values[account.id] ?? ""}
                                            onChange={e => setValues(prev => ({
                                                ...prev, [account.id]: e.target.value,
                                            }))}
                                            className="h-9 w-28 shrink-0 text-right font-semibold tabular-nums"
                                        />
                                    </div>
                                );
                            })}
                        </section>
                    ))}

                    <Button className="w-full" onClick={save} disabled={saving || filled.length === 0}>
                        {saving
                            ? "Guardando…"
                            : filled.length === 0
                                ? "Escribe al menos un saldo"
                                : `Guardar ${filled.length} ${filled.length === 1 ? "saldo" : "saldos"}`}
                    </Button>

                    <p className="rounded-2xl border border-dashed p-3 text-[11px] leading-relaxed text-muted-foreground">
                        Cada saldo queda como un corte con su fecha: desde ahí, la app vuelve a
                        contar sumando solo los movimientos posteriores.
                    </p>
                </>
            )}
        </div>
    );
}
