"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Landmark, Pencil, Scale } from "lucide-react";
import { BankBalanceHero } from "./BankBalanceHero";
import { AccountRow } from "./AccountRow";
import { CardRow } from "./CardRow";
import { InstitutionFormSheet } from "./InstitutionFormSheet";
import { AccountFormSheet } from "./AccountFormSheet";
import { CardFormSheet } from "./CardFormSheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { money, shortDate } from "../lib/format-money";
import type {
    BankOverview, BankAccountWithBalance, BankCardWithDebt,
} from "@/application/services/bank-service";

/**
 * Disparador del formulario de mantenimiento. Reenvía sus props: `FormSheet`
 * monta el trigger con `asChild`, así que el `onClick` que abre la hoja llega
 * aquí como prop y un componente que la descarte se pinta pero no abre nada.
 */
function EditButton({ label, ...props }: { label: string } & React.ComponentProps<"button">) {
    return (
        <button
            type="button"
            aria-label={label}
            {...props}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
            <Pencil className="h-3.5 w-3.5" />
        </button>
    );
}

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

    // Vacío es no tener nada, ni siquiera un emisor. Una institución sola ya es
    // algo que el usuario registró —o que nació de un escaneo— y ocultarla hacía
    // que la pantalla dijera «no registras nada» con cinco bancos guardados.
    const isEmpty = institutions.length === 0 && accounts.length === 0 && cards.length === 0;

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

            {/* Conciliar está siempre a mano: el aviso depende de que existan
                identidades sin revisar, pero los números pendientes de atribuir
                se acumulan aunque no haya ninguna, y sin este enlace la pantalla
                quedaba inalcanzable salvo escribiendo la URL. */}
            <Link
                href="/financial/banks/reconcile"
                className={cn(
                    "flex items-start gap-2.5 rounded-2xl border p-3 text-[11px] leading-relaxed transition-colors",
                    initialData.unconfirmedCount > 0
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-card text-muted-foreground hover:border-primary/50",
                )}
            >
                {initialData.unconfirmedCount > 0
                    ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    : <Scale className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>
                    {initialData.unconfirmedCount > 0 ? (
                        <>
                            <b>{initialData.unconfirmedCount} cuentas sin revisar</b> detectadas en
                            escaneos. No entran a ningún saldo hasta que las confirmes.{" "}
                        </>
                    ) : (
                        <>
                            Revisa los números que los escaneos aún no han sabido atribuir a
                            ninguna de tus cuentas.{" "}
                        </>
                    )}
                    <b>Conciliar →</b>
                </span>
            </Link>

            {/* Ya no hay orden obligatorio: el formulario de cuenta y el de
                tarjeta crean el emisor al vuelo si hace falta. */}
            <div className="flex flex-wrap gap-2">
                <InstitutionFormSheet
                    trigger={<Button size="sm" variant="outline">+ Institución</Button>}
                />
                <AccountFormSheet
                    institutions={institutions}
                    trigger={
                        <Button size="sm" variant="outline">+ Cuenta</Button>
                    }
                />
                <CardFormSheet
                    institutions={institutions}
                    accounts={accounts}
                    trigger={
                        <Button size="sm" variant="outline">+ Tarjeta</Button>
                    }
                />
            </div>

            {isEmpty ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-12 text-center">
                    <Landmark className="h-10 w-10 opacity-20" />
                    <p className="font-medium text-foreground">Todavía no registras cuentas</p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                        {institutions.length === 0
                            ? "Empieza por tu banco: sin institución no se puede registrar una cuenta."
                            : "Añade una cuenta para empezar a ver saldos y deuda por tarjeta."}
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
                            <AccountRow
                                key={account.id}
                                account={account}
                                // El efectivo lo gestiona el servicio, no el usuario.
                                action={account.accountType === "CASH" ? undefined : (
                                    <AccountFormSheet
                                        institutions={institutions}
                                        account={account}
                                        trigger={<EditButton label={`Editar ${account.name}`} />}
                                    />
                                )}
                            />
                        ))}
                        {group.cards.map(card => (
                            <CardRow
                                key={card.id}
                                card={card}
                                accountName={card.accountId ? accountNameById.get(card.accountId) : undefined}
                                action={
                                    <CardFormSheet
                                        institutions={institutions}
                                        accounts={accounts}
                                        card={card}
                                        trigger={<EditButton label={`Editar ${card.name}`} />}
                                    />
                                }
                            />
                        ))}

                        {group.accounts.length === 0 && group.cards.length === 0 && (
                            <p className="rounded-2xl border border-dashed bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                                Sin cuentas ni tarjetas todavía.
                            </p>
                        )}
                    </section>
                ))
            )}
        </div>
    );
}
