"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Bell, ChevronRight, Inbox, Landmark, Scale, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BalanceFreshness } from "@/lib/balance-freshness";
import { buildAlerts, formatMoney, formatPercent, type DonutSlice } from "@/lib/home-overview";
import { CaptureCard } from "./home/CaptureCard";
import { StatTile } from "./home/StatTile";
import { TrendCard } from "./home/TrendCard";
import { CategoryDonutCard } from "./home/CategoryDonutCard";
import { QuickAccess } from "./home/QuickAccess";
import { RecentActivityCard, type ActivityItem } from "./home/RecentActivityCard";
import { AlertsCard } from "./home/AlertsCard";
import { CARD_LINK, IconTile, SectionLabel, type Tint } from "./home/ui";

/** Todo lo que el servidor midió para esta pantalla, ya en cifras. */
export interface HomeMetrics {
    currency: string;
    /** Suma de los últimos cortes de saldo conocidos. */
    totalBalance: number;
    accounts: number;
    /** De esas cuentas, cuántas tienen un corte con el que sumar. */
    accountsWithBalance: number;
    monthIncome: number;
    monthExpenses: number;
    /** Ingresos menos gastos del periodo. */
    monthNet: number;
    /** Variación del gasto contra el mes anterior; `null` si no hay con qué comparar. */
    expensesDeltaPct: number | null;
    /** Movimientos detectados que nadie ha confirmado. */
    pendingTransactions: number;
    /** Un punto por día del periodo. */
    series: { dates: string[]; income: number[]; expenses: number[]; net: number[] };
    /** Saldo y gasto acumulados del periodo, para las miniaturas de las cifras. */
    balanceSeries: number[];
    expensesSeries: number[];
    /** Gasto del súper por categoría, sobre todo el historial de compras. */
    purchases: { slices: DonutSlice[]; total: number };
    recent: ActivityItem[];
    /** «Este mes». Rotula el periodo del que hablan las cifras y la gráfica. */
    periodLabel: string;
}

export interface HomeHubProps {
    userFirstName?: string;
    /** La fecha ya escrita: el servidor la formatea para que no baile al hidratar. */
    todayLabel: string;
    balances: BalanceFreshness;
    /** Escaneos que esperan revisión en la bandeja. */
    pendingScans: number;
    /**
     * Las cifras del tablero, o `null` cuando el servidor no las midió.
     *
     * En un teléfono no se piden: el tablero no se ve a ese ancho, y esas
     * consultas recorren el historial. Sin ellas, el bloque de escritorio
     * sencillamente no se declara — esconderlo por CSS habría pagado igual la
     * espera del servidor, que es lo que se quería ahorrar.
     */
    metrics: HomeMetrics | null;
}

/**
 * El inicio.
 *
 * Dos pantallas en un mismo árbol, no dos componentes: lo que comparten —la
 * captura y los accesos— se declara una sola vez, y cada bloque propio de un
 * ancho se esconde en el otro con `lg:hidden` / `hidden lg:*`. Duplicar el
 * árbol montaría dos veces los diálogos de captura.
 *
 * - **Móvil** conserva la estructura de siempre: registrar, lo que espera, los
 *   dos paneles y a dónde ir. Cifras y gráficas no entran ahí: cuestan las
 *   consultas pesadas y se leen mal en media pantalla.
 * - **Escritorio** es el tablero: las cuatro cifras del periodo, el flujo, el
 *   reparto del gasto del súper, los accesos, la actividad y los avisos.
 *
 * Cada acción lleva el color de su módulo. En una pantalla que es casi toda
 * accesos, el color es lo que los distingue de un vistazo.
 */
export function HomeHub({ userFirstName, todayLabel, balances, pendingScans, metrics }: HomeHubProps) {
    const greeting = userFirstName ? `Bienvenido, ${userFirstName}` : "Bienvenido";
    const alerts = metrics
        ? buildAlerts({
            pendingScans,
            pendingBalances: balances.pending,
            pendingTransactions: metrics.pendingTransactions,
        })
        : [];

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-8 lg:max-w-[1500px]">
            <header>
                <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                    {greeting}
                </h1>
                <p className="mt-0.5 text-[13px] text-text-tertiary">{todayLabel}</p>
            </header>

            {/* Una sola rejilla para el cuerpo. En móvil no hace nada —las secciones
                caen una debajo de otra en el orden de siempre— y en escritorio
                reparte doce columnas: la captura se queda con cuatro y las ocho
                restantes las llenan las cifras y los dos paneles. */}
            <div className="grid gap-5 lg:grid-cols-12">

                <CaptureCard className="lg:col-span-4 lg:row-span-2 lg:row-start-1" />

                {/* El tablero de escritorio solo se declara cuando el servidor lo midió.
                    En un teléfono `metrics` llega en `null` y estos bloques no
                    existen: esconderlos por CSS habría pagado igual la espera de
                    las consultas que los llenan. */}
                {metrics && (
                    <>
                        {/* ── Las cuatro cifras del periodo ── */}
                    <div className="hidden lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:grid lg:grid-cols-4 lg:gap-3">
                        <StatTile
                            href="/financial/balances"
                            label="Saldo total"
                            value={formatMoney(metrics.totalBalance, metrics.currency)}
                            note={`${metrics.monthNet >= 0 ? "+" : "−"}${formatMoney(Math.abs(metrics.monthNet), metrics.currency)} ${metrics.periodLabel.toLowerCase()}`}
                            trend={metrics.monthNet === 0 ? "flat" : metrics.monthNet > 0 ? "up" : "down"}
                            tint="emerald"
                            series={metrics.balanceSeries}
                            gradientId="home-spark-balance"
                        />
                        <StatTile
                            href="/financial/transactions"
                            label={`Gastos ${metrics.periodLabel.toLowerCase()}`}
                            value={formatMoney(metrics.monthExpenses, metrics.currency)}
                            note={metrics.expensesDeltaPct === null
                                ? "Sin gasto en el periodo anterior"
                                : `${formatPercent(metrics.expensesDeltaPct)} vs periodo anterior`}
                            trend={metrics.expensesDeltaPct === null || metrics.expensesDeltaPct === 0
                                ? "flat"
                                : metrics.expensesDeltaPct > 0 ? "up" : "down"}
                            invertTrendColor
                            tint="violet"
                            series={metrics.expensesSeries}
                            gradientId="home-spark-expenses"
                        />
                        <StatTile
                            href="/financial/banks"
                            label="Cuentas conectadas"
                            value={String(metrics.accounts)}
                            note={metrics.accounts === 0
                                ? "Sin cuentas registradas"
                                : metrics.accountsWithBalance === metrics.accounts
                                    ? "Todas con saldo declarado"
                                    : `${metrics.accountsWithBalance} con saldo declarado`}
                            tint="blue"
                            icon={<Landmark className="h-4 w-4" />}
                            gradientId="home-spark-accounts"
                        />
                        <StatTile
                            href="/financial/scans"
                            label="Alertas pendientes"
                            value={String(alerts.length)}
                            note={alerts.length === 0 ? "Nada pendiente" : "Requieren atención"}
                            tint="amber"
                            icon={<Bell className="h-4 w-4" />}
                            gradientId="home-spark-alerts"
                        />
                    </div>

                    {/* ── Los dos paneles del sistema (solo escritorio) ── */}
                    <div className="hidden lg:col-span-8 lg:col-start-5 lg:row-start-2 lg:grid lg:grid-cols-[5fr_3fr] lg:gap-3">
                        <TrendCard
                            dates={metrics.series.dates}
                            income={metrics.series.income}
                            expenses={metrics.series.expenses}
                            net={metrics.series.net}
                            totals={{ income: metrics.monthIncome, expenses: metrics.monthExpenses, net: metrics.monthNet }}
                            currency={metrics.currency}
                            periodLabel={metrics.periodLabel}
                        />
                        <CategoryDonutCard
                            slices={metrics.purchases.slices}
                            total={metrics.purchases.total}
                            currency={metrics.currency}
                            caption="Gasto por categoría (histórico)"
                        />
                    </div>
                    </>
                )}

                {/* ── Lo que espera (solo móvil) ──
                    Las dos fichas están siempre: son dos sitios a los que se entra
                    a diario, y esconderlas al quedar en cero las volvía difíciles
                    de encontrar. Con nada pendiente dicen «Al día», que es una
                    respuesta, no un hueco. La de saldos es la excepción: sin
                    ninguna cuenta registrada no hay saldo que declarar. */}
                <section className="lg:hidden">
                    <SectionLabel>Requiere tu atención</SectionLabel>
                    {/* Flex y no rejilla: cuando solo hay una, ocupa la fila entera
                        en vez de dejar media pantalla vacía al lado. */}
                    <div className="flex gap-2">
                        {balances.total > 0 && (
                            <AttentionChip
                                href="/financial/balances"
                                icon={<Scale className="h-4 w-4" />}
                                tint="amber"
                                label="Saldos"
                                count={balances.pending}
                            />
                        )}
                        <AttentionChip
                            href="/financial/scans"
                            icon={<Inbox className="h-4 w-4" />}
                            tint="sky"
                            label="Escaneos"
                            count={pendingScans}
                        />
                    </div>
                </section>

                {/* ── Los dos paneles, como destino (solo móvil) ── */}
                <section className="lg:hidden">
                    <SectionLabel>Paneles</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                        <PanelCard
                            href="/financial"
                            icon={<BarChart3 className="h-4 w-4" />}
                            tint="emerald"
                            title="Panel financiero"
                            hint="Saldos, flujo y categorías"
                        />
                        <PanelCard
                            href="/market/analytics"
                            icon={<ShoppingCart className="h-4 w-4" />}
                            tint="cyan"
                            title="Panel de compras"
                            hint="Precios, productos y ahorro"
                        />
                    </div>
                </section>

                <div className="lg:col-span-12 lg:row-start-3">
                    <QuickAccess />
                </div>

                {/* Actividad y avisos: escritorio también. */}
                {metrics && (
                    <>
                        <div className="hidden lg:col-span-7 lg:row-start-4 lg:block">
                        <RecentActivityCard items={metrics.recent} />
                    </div>
                    <div className="hidden lg:col-span-5 lg:row-start-4 lg:block">
                        <AlertsCard alerts={alerts} />
                    </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** Contador de una ficha de atención: dice cuánto espera, o que no espera nada. */
function CountBadge({ count, tint }: { count: number; tint: "amber" | "sky" }) {
    const pending = count > 0;
    return (
        <span className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums",
            !pending
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : tint === "amber"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-sky-500/40 bg-sky-500/10 text-sky-400",
        )}>
            {pending ? count : "Al día"}
        </span>
    );
}

/**
 * Lo que espera, en media fila.
 *
 * Iban una debajo de otra y entre las dos empujaban los accesos fuera de la
 * pantalla. Puestas en paralelo caben en el alto de una sola, y como lo que se
 * lee de ellas es el número, perder el subtítulo no cuesta nada.
 */
function AttentionChip({ href, icon, tint, label, count }: {
    href: string;
    icon: ReactNode;
    tint: "amber" | "sky";
    label: string;
    count: number;
}) {
    return (
        <Link href={href} className={cn(CARD_LINK, "flex min-w-0 flex-1 items-center gap-2.5 p-2.5")}>
            <IconTile tint={tint} size="sm">{icon}</IconTile>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">{label}</span>
            <CountBadge count={count} tint={tint} />
        </Link>
    );
}

/** Uno de los dos paneles del sistema, como destino y no como resumen. */
function PanelCard({ href, icon, tint, title, hint }: {
    href: string;
    icon: ReactNode;
    tint: Tint;
    title: string;
    hint: string;
}) {
    return (
        <Link href={href} className={cn(CARD_LINK, "flex flex-col gap-2 p-3")}>
            <span className="flex items-center justify-between gap-2">
                <IconTile tint={tint} size="sm">{icon}</IconTile>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
            </span>
            <span>
                <span className="block text-[13px] font-semibold text-text-primary">{title}</span>
                <span className="block text-[11px] leading-snug text-text-tertiary">{hint}</span>
            </span>
        </Link>
    );
}
