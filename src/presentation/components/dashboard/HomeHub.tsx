"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
    BarChart3, ChevronRight, ClipboardList, Inbox, Landmark, LineChart,
    Mic, MessageSquareText, Receipt, Scale, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NewTransactionDialog } from "@/presentation/financial/components/ai-capture/NewTransactionDialog";
import { daysAgoLabel, type BalanceFreshness } from "@/lib/balance-freshness";
import type { CaptureMethod } from "@/presentation/financial/components/ai-capture/CaptureMethodChooser";

const WAYS: { id: CaptureMethod; label: string; Icon: typeof Mic; primary?: boolean }[] = [
    { id: "voice", label: "Audio", Icon: Mic, primary: true },
    { id: "text", label: "Texto", Icon: MessageSquareText },
    { id: "form", label: "Formulario", Icon: ClipboardList },
];

function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h2 className="mb-2 ml-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            {children}
        </h2>
    );
}

interface RowLinkProps {
    href: string;
    icon: ReactNode;
    iconClassName: string;
    title: string;
    hint: string;
    /** Cuántas cosas esperan detrás de esta fila. Sin número, va la flecha. */
    count?: number;
}

/** Una fila de lista: icono, qué es, por qué aparece y a dónde lleva. */
function RowLink({ href, icon, iconClassName, title, hint, count }: RowLinkProps) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 border-b border-border-base px-3 py-2.5 transition-colors last:border-b-0 hover:bg-bg-tertiary/40"
        >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", iconClassName)}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-text-primary">{title}</span>
                <span className="block truncate text-[11px] text-text-tertiary">{hint}</span>
            </span>
            {count != null && count > 0 ? (
                <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    {count}
                </span>
            ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
            )}
        </Link>
    );
}

interface PanelCardProps {
    href: string;
    icon: ReactNode;
    iconClassName: string;
    title: string;
    hint: string;
}

/** Uno de los dos paneles del sistema, como destino y no como resumen. */
function PanelCard({ href, icon, iconClassName, title, hint }: PanelCardProps) {
    return (
        <Link
            href={href}
            className="flex flex-col gap-2 rounded-2xl border border-border-base bg-bg-secondary p-3 transition-colors hover:border-border-strong"
        >
            <span className={cn("grid h-8 w-8 place-items-center rounded-xl", iconClassName)}>
                {icon}
            </span>
            <span>
                <span className="block text-[13px] font-semibold text-text-primary">{title}</span>
                <span className="block text-[11px] leading-snug text-text-tertiary">{hint}</span>
            </span>
        </Link>
    );
}

export interface HomeHubProps {
    userFirstName?: string;
    /** La fecha ya escrita: el servidor la formatea para que no baile al hidratar. */
    todayLabel: string;
    balances: BalanceFreshness;
    /** Escaneos que esperan revisión en la bandeja. */
    pendingScans: number;
}

/**
 * El inicio: qué hacer, qué está esperando y a dónde ir.
 *
 * No repite los paneles. Los gráficos de finanzas viven en `/financial` y los
 * de compras en `/market/analytics`; tenerlos también aquí obligaba a esperar
 * dos consultas pesadas antes de poder tocar el único botón por el que la
 * mayoría entra — anotar lo que acaba de gastar.
 *
 * La jerarquía la hace el tamaño, no un bloque de color: la acción principal
 * es una tarjeta como las demás, más grande y con una línea verde al canto.
 */
export function HomeHub({ userFirstName, todayLabel, balances, pendingScans }: HomeHubProps) {
    const greeting = userFirstName ? `Hola, ${userFirstName}` : "Bienvenido";

    // El corte de saldo aparece siempre que haya cuentas: es una tarea que se
    // repite, no una alerta. Lo que cambia es si urge o solo está a mano.
    const balanceHint = balances.lastAsOf
        ? `Último corte ${daysAgoLabel(balances.lastAsOf)}`
        : "Aún sin registrar";

    const hasAttention = balances.total > 0 || pendingScans > 0;

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-8">
            <header>
                <h1 className="text-2xl font-bold tracking-tight text-text-primary">{greeting}</h1>
                <p className="mt-0.5 text-[13px] text-text-tertiary">{todayLabel}</p>
            </header>

            {/* ── Acción principal ── */}
            <section className="relative overflow-hidden rounded-3xl border border-border-base bg-bg-secondary p-4 sm:p-5">
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500" />
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/[0.07] to-transparent"
                />

                <div className="relative">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400">
                        Registrar
                    </p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
                        Anotar un movimiento
                    </h2>
                    <p className="mt-1 text-[13px] text-text-tertiary">
                        Dilo, escríbelo en una frase o llena el formulario.
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {WAYS.map(({ id, label, Icon, primary }) => (
                            <NewTransactionDialog key={id} startWith={id}>
                                <button
                                    type="button"
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition-colors",
                                        primary
                                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/70"
                                            : "border-border-base bg-bg-primary text-text-secondary hover:border-border-strong",
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="text-[11px] font-semibold">{label}</span>
                                </button>
                            </NewTransactionDialog>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Lo que espera ── */}
            {hasAttention && (
                <section>
                    <SectionTitle>Requiere tu atención</SectionTitle>
                    <div className="overflow-hidden rounded-2xl border border-border-base bg-bg-secondary">
                        {balances.total > 0 && (
                            <RowLink
                                href="/financial/balances"
                                icon={<Scale className="h-4 w-4" />}
                                iconClassName="bg-amber-500/15 text-amber-400"
                                title="Registrar saldos a la fecha"
                                hint={balanceHint}
                                count={balances.pending}
                            />
                        )}
                        {pendingScans > 0 && (
                            <RowLink
                                href="/financial/scans"
                                icon={<Inbox className="h-4 w-4" />}
                                iconClassName="bg-sky-500/15 text-sky-400"
                                title="Escaneos pendientes"
                                hint={pendingScans === 1
                                    ? "1 recibo por confirmar"
                                    : `${pendingScans} recibos por confirmar`}
                                count={pendingScans}
                            />
                        )}
                    </div>
                </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
                {/* ── Paneles ── */}
                <section>
                    <SectionTitle>Paneles</SectionTitle>
                    <div className="grid grid-cols-2 gap-2">
                        <PanelCard
                            href="/financial"
                            icon={<BarChart3 className="h-4 w-4" />}
                            iconClassName="bg-emerald-500/15 text-emerald-400"
                            title="Panel financiero"
                            hint="Saldos, flujo y categorías"
                        />
                        <PanelCard
                            href="/market/analytics"
                            icon={<LineChart className="h-4 w-4" />}
                            iconClassName="bg-sky-500/15 text-sky-400"
                            title="Panel de compras"
                            hint="Precios, productos y ahorro"
                        />
                    </div>
                </section>

                {/* ── Accesos ── */}
                <section>
                    <SectionTitle>Ir a</SectionTitle>
                    <div className="overflow-hidden rounded-2xl border border-border-base bg-bg-secondary">
                        <RowLink
                            href="/financial/banks"
                            icon={<Landmark className="h-4 w-4" />}
                            iconClassName="bg-bg-tertiary text-text-secondary"
                            title="Bancos"
                            hint="Cuentas, tarjetas e instituciones"
                        />
                        <RowLink
                            href="/financial/transactions"
                            icon={<Receipt className="h-4 w-4" />}
                            iconClassName="bg-bg-tertiary text-text-secondary"
                            title="Transacciones"
                            hint="Historial y filtros"
                        />
                        <RowLink
                            href="/market/purchases"
                            icon={<ShoppingBag className="h-4 w-4" />}
                            iconClassName="bg-bg-tertiary text-text-secondary"
                            title="Compras"
                            hint="Listas, plantillas y productos"
                        />
                        <RowLink
                            href="/market/purchases/new"
                            icon={<ShoppingCart className="h-4 w-4" />}
                            iconClassName="bg-bg-tertiary text-text-secondary"
                            title="Nueva compra"
                            hint="Empezar la lista del súper"
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
