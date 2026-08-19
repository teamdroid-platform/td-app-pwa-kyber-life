"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Info, CheckCircle2, AlertTriangle, CreditCard, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/ui/form-sheet";
import { ReconcileGroupCard } from "./ReconcileGroupCard";
import { AccountFormSheet } from "./AccountFormSheet";
import { CardFormSheet } from "./CardFormSheet";
import { formatBankNumber, formatIdentityNumber } from "@/lib/format-bank-number";
import { confirmReconcileAction, assignGroupAction } from "@/app/actions/bank-reconcile";
import type { ReconcileState, ReconcileGroup } from "@/app/actions/bank-reconcile";
import type { BankAccount, BankCard } from "@/domain/entities/bank";

const SECTIONS = [
    {
        id: "exact" as const,
        title: "Resueltas",
        hint: "Los últimos 4 dígitos bastaron para identificarlas.",
    },
    {
        id: "inferred" as const,
        title: "Inferidas",
        hint: "Menos de 4 dígitos, pero un solo candidato compatible. Revisa la evidencia.",
    },
    {
        id: "pending" as const,
        title: "Pendientes",
        hint: "Ambiguas o sin candidato. No entran a ningún saldo hasta que decidas.",
    },
];

/**
 * Conciliación del historial, en tres secciones por orden de esfuerzo: lo que
 * se resolvió solo, lo que se infirió y hay que revisar, y lo que necesita que
 * el usuario decida.
 */
export function ReconcileClient({ initialData }: { initialData: ReconcileState }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);

    // Qué grupo reclamó el usuario como suyo, y de qué tipo dice que es.
    const [claiming, setClaiming] = useState<ReconcileGroup | null>(null);
    const [claimKind, setClaimKind] = useState<"ACCOUNT" | "CARD" | null>(null);

    // La identidad sin emisor que se está corrigiendo.
    const [fixingAccount, setFixingAccount] = useState<BankAccount | null>(null);
    const [fixingCard, setFixingCard] = useState<BankCard | null>(null);

    const total = initialData.exact.length + initialData.inferred.length + initialData.pending.length;
    const { accounts: sinEmisorCuentas, cards: sinEmisorTarjetas } = initialData.missingIssuer;
    const sinEmisor = sinEmisorCuentas.length + sinEmisorTarjetas.length;

    async function confirmar() {
        setConfirming(true);
        const result = await confirmReconcileAction();
        setConfirming(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        const { confirmed, skipped, relinked } = result.data;
        toast.success(
            `${confirmed} identidades confirmadas, ${relinked} movimientos re-apuntados`,
        );
        // Apartar en silencio sería peor que fallar: el usuario creería que
        // entraron a los saldos.
        if (skipped > 0) {
            toast.warning(
                skipped === 1
                    ? "1 identidad se quedó fuera: le falta el emisor"
                    : `${skipped} identidades se quedaron fuera: les falta el emisor`,
            );
        }
        router.refresh();
    }

    /** Liga el grupo reclamado a la identidad recién creada. */
    async function ligarNueva(kind: "ACCOUNT" | "CARD", targetId: string) {
        const group = claiming;
        setClaiming(null);
        setClaimKind(null);
        if (!group) return;

        const result = await assignGroupAction({
            observationIds: group.observationIds, kind, targetId,
        });
        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success("Registrada y ligada a este número");
        router.refresh();
    }

    return (
        <div className="flex flex-col gap-3">
            <header className="flex items-center gap-3">
                <Link
                    href="/financial/banks"
                    aria-label="Volver a Bancos"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xl font-bold tracking-tight">Conciliar cuentas</h1>
                    <p className="truncate text-xs text-muted-foreground">
                        {initialData.exact.length} exactas · {initialData.inferred.length} inferidas
                        {" · "}{initialData.pending.length} pendientes
                    </p>
                </div>
            </header>

            {/* El motivo por el que confirmar fallaba, dicho antes de intentarlo
                y con la salida al lado. */}
            {sinEmisor > 0 && (
                <section className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="flex items-start gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-500">
                            <AlertTriangle className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold">
                                {sinEmisor === 1
                                    ? "1 identidad no se puede confirmar"
                                    : `${sinEmisor} identidades no se pueden confirmar`}
                            </span>
                            <span className="block text-[11px] leading-relaxed text-muted-foreground">
                                Nacieron de un escaneo que no dedujo el banco. Sin emisor no
                                entran a los saldos.
                            </span>
                        </span>
                    </div>

                    <div className="flex flex-col gap-1">
                        {sinEmisorCuentas.map(account => (
                            <button
                                key={account.id}
                                type="button"
                                onClick={() => setFixingAccount(account)}
                                className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-amber-500/50"
                            >
                                <Landmark className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                <span className="min-w-0 flex-1 font-mono text-[12px] font-semibold">
                                    {formatIdentityNumber(account) || "Cuenta sin número"}
                                </span>
                                <span className="shrink-0 text-[11px] font-semibold text-amber-500">
                                    Asignar emisor
                                </span>
                            </button>
                        ))}
                        {sinEmisorTarjetas.map(card => (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => setFixingCard(card)}
                                className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-amber-500/50"
                            >
                                <CreditCard className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                <span className="min-w-0 flex-1 font-mono text-[12px] font-semibold">
                                    {formatIdentityNumber(card) || "Tarjeta sin número"}
                                </span>
                                <span className="shrink-0 text-[11px] font-semibold text-amber-500">
                                    Asignar emisor
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {total === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 opacity-20" />
                    <p className="font-medium text-foreground">No hay nada que conciliar</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        Todos los números detectados en tus escaneos ya están identificados.
                    </p>
                </div>
            ) : (
                <>
                    <p className="flex items-start gap-2.5 rounded-2xl border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            Nada de esto <b>entra a tus saldos hasta que lo confirmes</b>.
                            Marca como ajena cualquier cuenta que no sea tuya.
                        </span>
                    </p>

                    {SECTIONS.map(section => {
                        const groups = initialData[section.id];
                        if (groups.length === 0) return null;

                        return (
                            <section key={section.id} className="flex flex-col gap-1.5">
                                <header className="px-1">
                                    <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                        {section.title} · {groups.length}
                                    </h2>
                                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
                                        {section.hint}
                                    </p>
                                </header>

                                {/* Una sola caja dividida: cada grupo era una
                                    tarjeta con su borde, y cuatro pendientes
                                    llenaban la pantalla. */}
                                <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border bg-card">
                                    {groups.map(group => (
                                        <ReconcileGroupCard
                                            key={group.key}
                                            group={group}
                                            identities={initialData.identities}
                                            section={section.id}
                                            onClaim={setClaiming}
                                        />
                                    ))}
                                </div>
                            </section>
                        );
                    })}

                    <Button onClick={confirmar} disabled={confirming} className="mt-1 w-full">
                        {confirming
                            ? "Confirmando…"
                            : `Confirmar y re-apuntar ${initialData.totalMovements} movimientos`}
                    </Button>
                </>
            )}

            {/* «Es mía»: primero qué es, después el alta con el número puesto. */}
            <FormSheet
                open={claiming !== null && claimKind === null}
                onOpenChange={open => { if (!open) setClaiming(null); }}
                title="¿Qué es este número?"
                bodyClassName="space-y-2 py-3"
            >
                <ClaimTile
                    label="Una cuenta"
                    hint="Ahorros, corriente, inversión"
                    icon={<Landmark className="h-4 w-4" />}
                    iconClass="bg-emerald-500/15 text-emerald-500"
                    onClick={() => setClaimKind("ACCOUNT")}
                />
                <ClaimTile
                    label="Una tarjeta"
                    hint="Crédito o débito"
                    icon={<CreditCard className="h-4 w-4" />}
                    iconClass="bg-amber-500/15 text-amber-500"
                    onClick={() => setClaimKind("CARD")}
                />
            </FormSheet>

            {claiming && claimKind === "ACCOUNT" && (
                <AccountFormSheet
                    institutions={initialData.institutions}
                    defaultNumber={claimNumber(claiming)}
                    open
                    onOpenChange={open => { if (!open) { setClaiming(null); setClaimKind(null); } }}
                    onCreated={({ account }) => ligarNueva("ACCOUNT", account.id)}
                />
            )}
            {claiming && claimKind === "CARD" && (
                <CardFormSheet
                    institutions={initialData.institutions}
                    accounts={initialData.accounts}
                    defaultNumber={claimNumber(claiming)}
                    open
                    onOpenChange={open => { if (!open) { setClaiming(null); setClaimKind(null); } }}
                    onCreated={({ card }) => ligarNueva("CARD", card.id)}
                />
            )}

            {/* Corregir la que no tiene emisor: el mismo formulario de siempre,
                que ya obliga a elegirlo antes de guardar. */}
            {fixingAccount && (
                <AccountFormSheet
                    institutions={initialData.institutions}
                    account={fixingAccount}
                    open
                    onOpenChange={open => { if (!open) setFixingAccount(null); }}
                />
            )}
            {fixingCard && (
                <CardFormSheet
                    institutions={initialData.institutions}
                    accounts={initialData.accounts}
                    card={fixingCard}
                    open
                    onOpenChange={open => { if (!open) setFixingCard(null); }}
                />
            )}
        </div>
    );
}

/** El número del grupo, en la forma fiel que el formulario sabe parsear. */
function claimNumber(group: ReconcileGroup): string {
    return formatBankNumber({
        prefixDigits: group.prefixDigits,
        lastFour: group.suffixDigits,
    });
}

function ClaimTile({
    label, hint, icon, iconClass, onClick,
}: {
    label: string;
    hint: string;
    icon: React.ReactNode;
    iconClass: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/60 p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
        >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconClass}`}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
            </span>
        </button>
    );
}
