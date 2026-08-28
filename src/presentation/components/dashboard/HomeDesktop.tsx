"use client";

import { useState } from "react";
import { Bell, Landmark } from "lucide-react";
import { formatMoney, formatPercent, type AlertItem, type DonutSlice } from "@/lib/home-overview";
import { cn } from "@/lib/utils";
import { CaptureCard } from "./home/CaptureCard";
import { StatTile } from "./home/StatTile";
import { TrendCard } from "./home/TrendCard";
import { CategoryDonutCard } from "./home/CategoryDonutCard";
import { QuickAccess } from "./home/QuickAccess";
import { RecentActivityCard, type ActivityItem } from "./home/RecentActivityCard";
import { AlertsCard } from "./home/AlertsCard";
import { CARD } from "./home/ui";
import { BalanceModeSwitch, balanceValue } from "@/presentation/financial/components/BalanceModeSwitch";
import type { BalanceSet } from "@/application/services/balance-service";
import type { BalanceMode } from "@/domain/entities/balance";

/** Todo lo que el servidor midió para esta pantalla, ya en cifras. */
export interface HomeMetrics {
    currency: string;
    /** Los tres balances del mes corriente, para el selector de la cifra de saldo. */
    balances: BalanceSet;
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

export interface HomeDesktopProps {
    metrics: HomeMetrics;
    /** Los avisos ya derivados: la cifra de arriba y la tarjeta de abajo cuentan lo mismo. */
    alerts: readonly AlertItem[];
}

/**
 * El inicio a partir de `lg`: el tablero.
 *
 * Doce columnas: la captura se queda con cuatro y ocupa las dos filas de
 * arriba; las ocho restantes las llenan las cuatro cifras del periodo y los
 * dos paneles. Debajo, los accesos a todo el ancho y, al pie, la actividad
 * reciente junto a los avisos.
 *
 * `metrics` llega aquí sin `null` a propósito: en un teléfono el servidor no
 * mide nada y `HomeHub` no monta este componente. Esconderlo por CSS habría
 * pagado igual la espera de las consultas que lo llenan.
 */
export function HomeDesktop({ metrics, alerts }: HomeDesktopProps) {
    // Arranca en el modo de ajustes; no se recuerda entre cargas, a propósito.
    const [balanceMode, setBalanceMode] = useState<BalanceMode>(() => metrics.balances.defaultMode);
    const balanceValueStr = formatMoney(balanceValue(metrics.balances, balanceMode), metrics.currency);

    return (
        <div className="grid gap-5 lg:grid-cols-12">

            <CaptureCard className="lg:col-span-4 lg:row-span-2 lg:row-start-1" />

            {/* ── Las cuatro cifras del periodo ── */}
            <div className="lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:grid lg:grid-cols-4 lg:gap-3">
                {/* No es un `StatTile`: lleva el selector de balance como
                    etiqueta, y ese control ya es interactivo — envolverlo en un
                    `<Link>` como los demás abriría un `<a>` dentro de otro `<a>`
                    (el aviso de "N cuentas sin saldo declarado" del propio
                    selector) en cuanto el modo activo fuera Total. */}
                <div className={cn(CARD, "relative flex flex-col justify-center gap-2 overflow-hidden p-3.5")}>
                    <BalanceModeSwitch
                        balances={metrics.balances}
                        mode={balanceMode}
                        onModeChange={setBalanceMode}
                        rangeLabel={metrics.periodLabel}
                        size="compact"
                    />
                    <span className={cn(
                        "relative block whitespace-nowrap font-bold leading-none tracking-tight text-text-primary",
                        balanceValueStr.length > 13 ? "text-[17px]" : balanceValueStr.length > 10 ? "text-[19px]" : "text-[22px]",
                    )}>
                        {balanceValueStr}
                    </span>
                </div>
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
                    tint="red"
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

            {/* ── Los dos paneles del sistema ── */}
            <div className="lg:col-span-8 lg:col-start-5 lg:row-start-2 lg:grid lg:grid-cols-[5fr_3fr] lg:gap-3">
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

            <div className="lg:col-span-12 lg:row-start-3">
                <QuickAccess />
            </div>

            <div className="lg:col-span-7 lg:row-start-4">
                <RecentActivityCard items={metrics.recent} />
            </div>
            <div className="lg:col-span-5 lg:row-start-4">
                <AlertsCard alerts={alerts} />
            </div>
        </div>
    );
}
