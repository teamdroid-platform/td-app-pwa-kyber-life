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
        className: "border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-900/30",
    },
    {
        id: "text", label: "Texto", Icon: MessageSquareText,
        className: "border-violet-500/30 bg-violet-950/20 text-violet-300 hover:border-violet-500/50 hover:bg-violet-900/30",
    },
    {
        id: "form", label: "Formulario", Icon: ClipboardList,
        className: "border-amber-500/30 bg-amber-950/20 text-amber-300 hover:border-amber-500/50 hover:bg-amber-900/30",
    },
];

function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h2 className="mb-2 ml-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
            {children}
        </h2>
    );
}

/** Contador de una fila de atención: dice cuánto espera, o que no espera nada. */
function CountBadge({ count, tone }: { count: number; tone: "amber" | "sky" }) {
    const pending = count > 0;
    return (
        <span className={cn(
            "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums select-none",
            !pending
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : tone === "amber"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-sky-500/30 bg-sky-500/10 text-sky-400",
        )}>
            {pending ? count : "Al día"}
        </span>
    );
}

interface AttentionChipProps {
    href: string;
    icon: ReactNode;
    iconClassName: string;
    /** Una palabra: en media pantalla no cabe más, y el contador dice el resto. */
    label: string;
    count: number;
    tone: "amber" | "sky";
}

/**
 * Lo que espera, en media fila.
 */
function AttentionChip({ href, icon, iconClassName, label, count, tone }: AttentionChipProps) {
    return (
        <Link
            href={href}
            className="group relative overflow-hidden flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-sm p-3 shadow-md shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-indigo-500/40 active:scale-[0.99]"
        >
            <div
                className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"
                aria-hidden="true"
            />
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border/20", iconClassName)}>
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white group-hover:text-indigo-200 transition-colors">
                {label}
            </span>
            <CountBadge count={count} tone={tone} />
        </Link>
    );
}

interface RowLinkProps {
    href: string;
    icon: ReactNode;
    iconClassName: string;
    title: string;
    hint: string;
}

/** Una fila de lista: icono con el color de su módulo, qué es y a dónde lleva. */
function RowLink({ href, icon, iconClassName, title, hint }: RowLinkProps) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-slate-800/40"
        >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border/20", iconClassName)}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-white group-hover:text-indigo-200 transition-colors">{title}</span>
                <span className="block truncate text-[11px] text-slate-400">{hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
        </Link>
    );
}

/**
 * El motivo que va detrás de cada panel.
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
            <rect
                x="0" y="0" width="160" height="44"
                fill="none"
            />
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
            className="group relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-sm p-3.5 pb-10 shadow-md shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-indigo-500/40 active:scale-[0.99]"
        >
            <div
                className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"
                aria-hidden="true"
            />
            {motif}
            <span className={cn("relative grid h-8 w-8 place-items-center rounded-xl border border-border/20", iconClassName)}>
                {icon}
            </span>
            <span className="relative mt-2 block text-[13px] font-bold text-white group-hover:text-indigo-200 transition-colors">{title}</span>
            <span className="relative block text-[11px] leading-snug text-slate-400">{hint}</span>
        </Link>
    );
}

export interface HomeMobileProps {
    balances: BalanceFreshness;
    /** Escaneos que esperan revisión en la bandeja. */
    pendingScans: number;
}

export function HomeMobile({ balances, pendingScans }: HomeMobileProps) {
    return (
        <div className="flex flex-col gap-5">
            {/* ── Acción principal ── */}
            <section className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-sm p-4 sm:p-5 shadow-md shadow-black/20">
                <div
                    className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
                    aria-hidden="true"
                />
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500/80 rounded-r" />
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-indigo-500/[0.06] to-transparent"
                />

                <div className="relative">
                    <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Registrar un movimiento
                    </h2>
                    <p className="mt-1 text-[13px] text-slate-400">
                        Dilo, escríbelo en una frase o llena el formulario.
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {WAYS.map(({ id, label, Icon, className }) => (
                            <NewTransactionDialog key={id} startWith={id}>
                                <button
                                    type="button"
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 shadow-sm transition-all active:scale-[0.98]",
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
            <section>
                <SectionTitle>Requiere tu atención</SectionTitle>
                <div className="flex gap-2">
                    {balances.total > 0 && (
                        <AttentionChip
                            href="/financial/balances"
                            icon={<Scale className="h-4 w-4" />}
                            iconClassName="border border-amber-500/30 bg-amber-500/10 text-amber-400"
                            label="Saldos"
                            count={balances.pending}
                            tone="amber"
                        />
                    )}
                    <AttentionChip
                        href="/financial/scans"
                        icon={<Inbox className="h-4 w-4" />}
                        iconClassName="border border-sky-500/30 bg-sky-500/10 text-sky-400"
                        label="Escaneos"
                        count={pendingScans}
                        tone="sky"
                    />
                </div>
            </section>

            {/* ── Paneles ── */}
            <section>
                <SectionTitle>Paneles</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                    <PanelCard
                        href="/financial"
                        icon={<BarChart3 className="h-4 w-4" />}
                        iconClassName="border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        title="Panel financiero"
                        hint="Saldos, flujo y categorías"
                        motif={<FinanceMotif />}
                    />
                    <PanelCard
                        href="/market/analytics"
                        icon={<ShoppingCart className="h-4 w-4" />}
                        iconClassName="border border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                        title="Panel de compras"
                        hint="Precios, productos y ahorro"
                        motif={<MarketMotif />}
                    />
                </div>
            </section>

            {/* ── Accesos ── */}
            <section>
                <SectionTitle>Ir a</SectionTitle>
                <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900/60 backdrop-blur-sm shadow-md shadow-black/20 divide-y divide-slate-800/80">
                    <div
                        className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"
                        aria-hidden="true"
                    />
                    <RowLink
                        href="/financial/transactions"
                        icon={<Receipt className="h-4 w-4" />}
                        iconClassName="border border-violet-500/30 bg-violet-500/10 text-violet-300"
                        title="Transacciones"
                        hint="Historial y filtros"
                    />
                    <RowLink
                        href="/financial/banks"
                        icon={<Landmark className="h-4 w-4" />}
                        iconClassName="border border-blue-500/30 bg-blue-500/10 text-blue-300"
                        title="Bancos"
                        hint="Cuentas, tarjetas e instituciones"
                    />
                    <RowLink
                        href="/market/purchases"
                        icon={<ShoppingBag className="h-4 w-4" />}
                        iconClassName="border border-rose-500/30 bg-rose-500/10 text-rose-300"
                        title="Compras"
                        hint="Listas, plantillas y productos"
                    />
                    <RowLink
                        href="/market/purchases/new"
                        icon={<ShoppingCart className="h-4 w-4" />}
                        iconClassName="border border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                        title="Nueva compra"
                        hint="Empezar la lista del súper"
                    />
                </div>
            </section>
        </div>
    );
}
