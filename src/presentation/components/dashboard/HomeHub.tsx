"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
    BarChart3, ChevronRight, ClipboardList, Inbox, Landmark,
    Mic, MessageSquareText, Receipt, Scale, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NewTransactionDialog } from "@/presentation/financial/components/ai-capture/NewTransactionDialog";
import type { BalanceFreshness } from "@/lib/balance-freshness";
import type { CaptureMethod } from "@/presentation/financial/components/ai-capture/CaptureMethodChooser";

/**
 * Las tres vías, cada una con su color.
 *
 * El tinte no adorna: son tres botones del mismo tamaño y sin él la única
 * diferencia entre ellos sería leer la etiqueta. El verde encabeza porque es
 * el color con el que el sistema habla de dinero.
 */
const WAYS: { id: CaptureMethod; label: string; Icon: typeof Mic; className: string }[] = [
    {
        id: "voice", label: "Audio", Icon: Mic,
        className: "border-emerald-500/40 bg-emerald-500/12 text-emerald-300 hover:border-emerald-500/70",
    },
    {
        id: "text", label: "Texto", Icon: MessageSquareText,
        className: "border-violet-500/40 bg-violet-500/12 text-violet-300 hover:border-violet-500/70",
    },
    {
        id: "form", label: "Formulario", Icon: ClipboardList,
        className: "border-amber-500/40 bg-amber-500/12 text-amber-300 hover:border-amber-500/70",
    },
];

function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h2 className="mb-2 ml-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            {children}
        </h2>
    );
}

/** Contador de una fila de atención: dice cuánto espera, o que no espera nada. */
function CountBadge({ count, tone }: { count: number; tone: "amber" | "sky" }) {
    const pending = count > 0;
    return (
        <span className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums",
            !pending
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : tone === "amber"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-sky-500/40 bg-sky-500/10 text-sky-400",
        )}>
            {pending ? count : "Al día"}
        </span>
    );
}

interface RowLinkProps {
    href: string;
    icon: ReactNode;
    iconClassName: string;
    title: string;
    /** Solo donde hace falta: en «atención» el título y el contador bastan. */
    hint?: string;
    trailing?: ReactNode;
}

/** Una fila de lista: icono con el color de su módulo, qué es y a dónde lleva. */
function RowLink({ href, icon, iconClassName, title, hint, trailing }: RowLinkProps) {
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
                {hint && <span className="block truncate text-[11px] text-text-tertiary">{hint}</span>}
            </span>
            {trailing ?? <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />}
        </Link>
    );
}

/**
 * El motivo que va detrás de cada panel.
 *
 * Es ornamento, no los datos del usuario: dibujar su serie real aquí costaría
 * las dos consultas pesadas que este inicio existe para no hacer, y una cifra
 * a medias engaña más que una forma. Por eso no lleva ejes, ni números, ni
 * nada que se pueda leer como una medición.
 */
function FinanceMotif() {
    return (
        <svg
            aria-hidden viewBox="0 0 160 44" preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-11 w-full"
        >
            <defs>
                <linearGradient id="home-motif-finance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#10b981" stopOpacity="0.5" />
                    <stop offset="1" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d="M0,34 L20,28 L40,32 L60,18 L80,24 L100,10 L120,16 L140,6 L160,12 L160,44 L0,44 Z"
                fill="url(#home-motif-finance)"
            />
            <path
                d="M0,34 L20,28 L40,32 L60,18 L80,24 L100,10 L120,16 L140,6 L160,12"
                fill="none" stroke="#34d399" strokeWidth="1.6" strokeOpacity="0.8"
            />
        </svg>
    );
}

function MarketMotif() {
    const bars = [22, 14, 28, 10, 24, 18, 30, 16];
    return (
        <svg
            aria-hidden viewBox="0 0 160 44" preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-11 w-full"
        >
            {bars.map((height, index) => (
                <rect
                    key={index}
                    x={4 + index * 20} y={44 - height} width="14" height={height} rx="2"
                    fill="#22d3ee" fillOpacity={index % 2 === 0 ? 0.38 : 0.28}
                />
            ))}
        </svg>
    );
}

interface PanelCardProps {
    href: string;
    icon: ReactNode;
    iconClassName: string;
    title: string;
    hint: string;
    motif: ReactNode;
}

/** Uno de los dos paneles del sistema, como destino y no como resumen. */
function PanelCard({ href, icon, iconClassName, title, hint, motif }: PanelCardProps) {
    return (
        <Link
            href={href}
            className="relative overflow-hidden rounded-2xl border border-border-base bg-bg-secondary p-3 pb-10 transition-colors hover:border-border-strong"
        >
            {motif}
            <span className={cn("relative grid h-8 w-8 place-items-center rounded-xl", iconClassName)}>
                {icon}
            </span>
            <span className="relative mt-2 block text-[13px] font-semibold text-text-primary">{title}</span>
            <span className="relative block text-[11px] leading-snug text-text-tertiary">{hint}</span>
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
 * Cada acción lleva el color de su módulo. En una pantalla que es toda
 * acciones, el color es lo que las distingue de un vistazo: en gris, once
 * accesos son once filas iguales que hay que leer una por una.
 */
export function HomeHub({ userFirstName, todayLabel, balances, pendingScans }: HomeHubProps) {
    const greeting = userFirstName ? `Hola, ${userFirstName}` : "Bienvenido";

    // El corte de saldo aparece siempre que haya cuentas: es una tarea que se
    // repite, no una alerta. Lo que cambia es si urge o solo está a mano.
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
                        {WAYS.map(({ id, label, Icon, className }) => (
                            <NewTransactionDialog key={id} startWith={id}>
                                <button
                                    type="button"
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition-colors",
                                        className,
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="text-[11px] font-bold">{label}</span>
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
                                trailing={<CountBadge count={balances.pending} tone="amber" />}
                            />
                        )}
                        {pendingScans > 0 && (
                            <RowLink
                                href="/financial/scans"
                                icon={<Inbox className="h-4 w-4" />}
                                iconClassName="bg-sky-500/15 text-sky-400"
                                title="Escaneos pendientes"
                                trailing={<CountBadge count={pendingScans} tone="sky" />}
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
                            motif={<FinanceMotif />}
                        />
                        <PanelCard
                            href="/market/analytics"
                            icon={<ShoppingCart className="h-4 w-4" />}
                            iconClassName="bg-cyan-500/15 text-cyan-300"
                            title="Panel de compras"
                            hint="Precios, productos y ahorro"
                            motif={<MarketMotif />}
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
                            iconClassName="bg-blue-500/15 text-blue-300"
                            title="Bancos"
                            hint="Cuentas, tarjetas e instituciones"
                        />
                        <RowLink
                            href="/financial/transactions"
                            icon={<Receipt className="h-4 w-4" />}
                            iconClassName="bg-violet-500/15 text-violet-300"
                            title="Transacciones"
                            hint="Historial y filtros"
                        />
                        <RowLink
                            href="/market/purchases"
                            icon={<ShoppingBag className="h-4 w-4" />}
                            iconClassName="bg-rose-500/15 text-rose-300"
                            title="Compras"
                            hint="Listas, plantillas y productos"
                        />
                        <RowLink
                            href="/market/purchases/new"
                            icon={<ShoppingCart className="h-4 w-4" />}
                            iconClassName="bg-cyan-500/15 text-cyan-300"
                            title="Nueva compra"
                            hint="Empezar la lista del súper"
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
