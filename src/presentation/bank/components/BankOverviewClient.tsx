"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle, ChevronDown, ChevronRight, CreditCard, Landmark, Merge, Plus, Scale, Wallet,
} from "lucide-react";
import { BankBalanceHero } from "./BankBalanceHero";
import { AccountRow } from "./AccountRow";
import { CardRow } from "./CardRow";
import { InstitutionFormSheet } from "./InstitutionFormSheet";
import { AccountFormSheet } from "./AccountFormSheet";
import { CardFormSheet } from "./CardFormSheet";
import { MergeInstitutionsSheet, type MergeCandidate } from "./MergeInstitutionsSheet";
import { MergeIntoSheet } from "./MergeIntoSheet";
import { RowActionsSheet, KebabButton } from "./RowActionsSheet";
import { FormSheet } from "@/components/ui/form-sheet";
import { cn } from "@/lib/utils";
import { accountLabel } from "@/lib/bank-identity-label";
import { findDuplicateInstitutions } from "@/lib/institution-duplicates";
import { money } from "../lib/format-money";
import type {
    BankOverview, BankAccountWithBalance, BankCardWithDebt,
} from "@/application/services/bank-service";
import type { BankInstitution } from "@/domain/entities/bank";

interface Group {
    id: string | null;
    name: string;
    accounts: BankAccountWithBalance[];
    cards: BankCardWithDebt[];
    total: number;
}

/** Una opción del alta, con la misma forma que las del selector de pago. */
function CreateTile({
    label, hint, icon, iconClass, ...props
}: {
    label: string;
    hint: string;
    icon: React.ReactNode;
    iconClass: string;
} & React.ComponentProps<"button">) {
    return (
        <button
            type="button"
            {...props}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/60 p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
        >
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", iconClass)}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
    );
}

/** Lo que tiene un emisor, para el subtítulo de su menú. */
function describeGroup(counts?: { accounts: number; cards: number }): string {
    if (!counts || counts.accounts + counts.cards === 0) return "Sin cuentas ni tarjetas";
    const parts: string[] = [];
    if (counts.accounts > 0) parts.push(counts.accounts === 1 ? "1 cuenta" : `${counts.accounts} cuentas`);
    if (counts.cards > 0) parts.push(counts.cards === 1 ? "1 tarjeta" : `${counts.cards} tarjetas`);
    return parts.join(" · ");
}

/**
 * Resumen del módulo: primero la respuesta —cuánto tengo disponible—, después
 * cuentas y tarjetas agrupadas por emisor. El efectivo no tiene institución,
 * así que cae en su propio grupo al final.
 */
export function BankOverviewClient({ initialData }: { initialData: BankOverview }) {
    const { institutions, accounts, cards } = initialData;
    const [addOpen, setAddOpen] = useState(false);
    const [mergeGroupKey, setMergeGroupKey] = useState<string | null>(null);
    // El emisor cuyo menú está abierto, y el que se está unificando a mano.
    const [menuFor, setMenuFor] = useState<BankInstitution | null>(null);
    const [mergingInto, setMergingInto] = useState<BankInstitution | null>(null);
    // Todo abierto de entrada: plegar por defecto escondería los saldos, que
    // son la razón de entrar a la pantalla.
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

    const accountNameById = useMemo(
        () => new Map(accounts.map(a => [a.id, accountLabel(a)])),
        [accounts],
    );

    const institutionById = useMemo(
        () => new Map(institutions.map(i => [i.id, i])),
        [institutions],
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
        });

        // El efectivo no tiene emisor por diseño; lo demás sin emisor está a
        // medio registrar y tiene que verse para poder arreglarlo.
        const cash = accounts.filter(a => !a.institutionId && a.accountType === "CASH");
        if (cash.length > 0) {
            byInstitution.push({
                id: null,
                name: "Efectivo",
                accounts: cash,
                cards: [],
                total: cash.reduce((sum, a) => sum + a.balance, 0),
            });
        }

        const orphanAccounts = accounts.filter(a => !a.institutionId && a.accountType !== "CASH");
        const orphanCards = cards.filter(c => !c.institutionId);
        if (orphanAccounts.length > 0 || orphanCards.length > 0) {
            byInstitution.push({
                id: "__sin-institucion__",
                name: "Sin institución",
                accounts: orphanAccounts,
                cards: orphanCards,
                total: orphanAccounts.reduce((sum, a) => sum + a.balance, 0),
            });
        }

        return byInstitution;
    }, [institutions, accounts, cards]);

    // Los emisores repetidos son el problema real del usuario: la misma
    // cooperativa registrada tres veces, dos de ellas nacidas de un escaneo.
    // La app los detecta y ofrece unirlos; buscarlos a mano era la parte cara.
    const duplicateGroups = useMemo(
        () => findDuplicateInstitutions(institutions),
        [institutions],
    );

    const countsById = useMemo(() => {
        const map = new Map<string, { accounts: number; cards: number; total: number }>();
        for (const group of groups) {
            if (group.id) {
                map.set(group.id, {
                    accounts: group.accounts.length,
                    cards: group.cards.length,
                    total: group.total,
                });
            }
        }
        return map;
    }, [groups]);

    const mergeGroup = duplicateGroups.find(g => g.fingerprint === mergeGroupKey);
    const mergeCandidates: MergeCandidate[] = (mergeGroup?.members ?? []).map(
        (institution: BankInstitution) => ({
            institution,
            ...(countsById.get(institution.id) ?? { accounts: 0, cards: 0, total: 0 }),
        }),
    );

    // Vacío es no tener nada, ni siquiera un emisor. Una institución sola ya es
    // algo que el usuario registró —o que nació de un escaneo— y ocultarla hacía
    // que la pantalla dijera «no registras nada» con cinco bancos guardados.
    const isEmpty = institutions.length === 0 && accounts.length === 0 && cards.length === 0;

    const closeAdd = () => setAddOpen(false);
    const toggleGroup = (key: string) => setCollapsed(current => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });

    const subtitle = accounts.length === 0 && cards.length === 0
        ? "Registra tus bancos, cuentas y tarjetas"
        : `${institutions.length} instituciones · ${accounts.length} cuentas · ${cards.length} tarjetas`;

    return (
        <div className="flex flex-col gap-3">
            <header className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Bancos</h1>
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    aria-label="Añadir cuenta, tarjeta o institución"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/50 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                >
                    <Plus className="h-5 w-5" />
                </button>
            </header>

            <BankBalanceHero
                totalAvailable={initialData.totalAvailable}
                totalDebt={initialData.totalDebt}
                totalAvailableCredit={initialData.totalAvailableCredit}
                cashBalance={initialData.cashBalance}
                nextDueDate={initialData.nextDueDate}
            />

            {duplicateGroups.map(group => (
                <button
                    key={group.fingerprint}
                    type="button"
                    onClick={() => setMergeGroupKey(group.fingerprint)}
                    className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-left transition-colors hover:bg-amber-500/15"
                >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-500">
                        <Merge className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold">
                            {group.members.length} emisores parecen el mismo
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                            «{group.label}» está repetido
                        </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-500">Unificar</span>
                </button>
            ))}

            {/* Conciliar está siempre a mano: el aviso depende de que existan
                identidades sin revisar, pero los números pendientes de atribuir
                se acumulan aunque no haya ninguna, y sin este enlace la pantalla
                quedaba inalcanzable salvo escribiendo la URL. */}
            <Link
                href="/financial/banks/reconcile"
                className={cn(
                    "flex items-center gap-3 rounded-2xl border p-3 transition-colors",
                    initialData.unconfirmedCount > 0
                        ? "border-amber-500/30 bg-amber-500/10"
                        : "bg-card hover:border-primary/50",
                )}
            >
                <span className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    initialData.unconfirmedCount > 0
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-muted text-muted-foreground",
                )}>
                    {initialData.unconfirmedCount > 0
                        ? <AlertTriangle className="h-4 w-4" />
                        : <Scale className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">
                        {initialData.unconfirmedCount > 0
                            ? `${initialData.unconfirmedCount} cuentas sin revisar`
                            : "Conciliar números sin atribuir"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                        {initialData.unconfirmedCount > 0
                            ? "No entran a ningún saldo hasta que las confirmes"
                            : "Los escaneos no supieron de qué cuenta son"}
                    </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>

            {isEmpty ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-12 text-center">
                    <Landmark className="h-10 w-10 opacity-20" />
                    <p className="font-medium text-foreground">Todavía no registras cuentas</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        {institutions.length === 0
                            ? "Empieza por tu banco: sin institución no se puede registrar una cuenta."
                            : "Añade una cuenta para empezar a ver saldos y deuda por tarjeta."}
                    </p>
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="mt-2 rounded-xl border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                    >
                        Añadir
                    </button>
                </div>
            ) : (
                groups.map(group => {
                    const key = group.id ?? "__efectivo__";
                    const isCollapsed = collapsed.has(key);
                    const count = group.accounts.length + group.cards.length;

                    return (
                        <section key={key} className="flex flex-col gap-1.5">
                            {/* La cabecera es el control de plegado: con tres
                                emisores vacíos la lista se llenaba de cajas y
                                enterraba las cuentas de verdad. */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(key)}
                                    aria-expanded={!isCollapsed}
                                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
                                >
                                    {isCollapsed
                                        ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                    <h2 className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                        {group.name}
                                    </h2>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {count === 0 ? "vacía" : count === 1 ? "1 ítem" : `${count} ítems`}
                                    </span>
                                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground/80">
                                        {money(group.total)}
                                    </span>
                                </button>

                                {/* Solo los emisores de verdad: «Efectivo» y
                                    «Sin institución» son cajones, no bancos, y
                                    no hay nada que unificar en ellos. */}
                                {institutionById.get(key) && (
                                    <KebabButton
                                        label={`Acciones de ${group.name}`}
                                        onClick={() => setMenuFor(institutionById.get(key)!)}
                                    />
                                )}
                            </div>

                            {!isCollapsed && (
                                count > 0 ? (
                                    <div className="divide-y divide-border/50 overflow-hidden rounded-2xl border bg-card">
                                        {group.accounts.map(account => (
                                            <AccountRow
                                                key={account.id}
                                                account={account}
                                                institutions={institutions}
                                            />
                                        ))}
                                        {group.cards.map(card => (
                                            <CardRow
                                                key={card.id}
                                                card={card}
                                                accountName={card.accountId ? accountNameById.get(card.accountId) : undefined}
                                                institutions={institutions}
                                                accounts={accounts}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="rounded-2xl border border-dashed bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                                        Sin cuentas ni tarjetas todavía.
                                    </p>
                                )
                            )}
                        </section>
                    );
                })
            )}

            {menuFor && (
                <RowActionsSheet
                    open
                    onOpenChange={open => { if (!open) setMenuFor(null); }}
                    title={menuFor.name}
                    description={describeGroup(countsById.get(menuFor.id))}
                    actions={[
                        {
                            label: "Unificar con otra institución",
                            hint: "Mueve sus cuentas y tarjetas a la que elijas",
                            icon: <Merge className="h-4 w-4" />,
                            onSelect: () => {
                                const source = menuFor;
                                setMenuFor(null);
                                setMergingInto(source);
                            },
                        },
                    ]}
                />
            )}

            {mergingInto && (
                <MergeIntoSheet
                    open
                    onOpenChange={open => { if (!open) setMergingInto(null); }}
                    source={mergingInto}
                    sourceCounts={countsById.get(mergingInto.id) ?? { accounts: 0, cards: 0 }}
                    options={institutions
                        .filter(i => i.id !== mergingInto.id)
                        .map(institution => ({
                            institution,
                            ...(countsById.get(institution.id) ?? { accounts: 0, cards: 0, total: 0 }),
                        }))}
                />
            )}

            {mergeGroup && (
                <MergeInstitutionsSheet
                    key={mergeGroup.fingerprint}
                    open
                    onOpenChange={open => { if (!open) setMergeGroupKey(null); }}
                    label={mergeGroup.label}
                    candidates={mergeCandidates}
                />
            )}

            {/* Una sola puerta al alta. Tres botones sueltos competían entre sí
                y ninguno decía qué cabía dentro. */}
            <FormSheet
                open={addOpen}
                onOpenChange={setAddOpen}
                title="¿Qué quieres añadir?"
                bodyClassName="space-y-2 py-3"
            >
                <AccountFormSheet
                    institutions={institutions}
                    onCreated={closeAdd}
                    trigger={(
                        <CreateTile
                            label="Cuenta"
                            hint="Ahorros, corriente, efectivo…"
                            icon={<Landmark className="h-4 w-4" />}
                            iconClass="bg-emerald-500/15 text-emerald-500"
                        />
                    )}
                />
                <CardFormSheet
                    institutions={institutions}
                    accounts={accounts}
                    onCreated={closeAdd}
                    trigger={(
                        <CreateTile
                            label="Tarjeta"
                            hint="Crédito o débito"
                            icon={<CreditCard className="h-4 w-4" />}
                            iconClass="bg-amber-500/15 text-amber-500"
                        />
                    )}
                />
                <InstitutionFormSheet
                    onCreated={closeAdd}
                    trigger={(
                        <CreateTile
                            label="Institución"
                            hint="Un banco o cooperativa, sin cuentas todavía"
                            icon={<Wallet className="h-4 w-4" />}
                            iconClass="bg-sky-500/15 text-sky-500"
                        />
                    )}
                />
            </FormSheet>
        </div>
    );
}
