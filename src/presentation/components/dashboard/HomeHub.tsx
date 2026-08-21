"use client";

import type { BalanceFreshness } from "@/lib/balance-freshness";
import { buildAlerts } from "@/lib/home-overview";
import { HomeMobile } from "./HomeMobile";
import { HomeDesktop, type HomeMetrics } from "./HomeDesktop";

export type { HomeMetrics };

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
     * En un teléfono no se piden: el tablero no se ve a ese ancho y esas
     * consultas recorren el historial. Sin ellas, {@link HomeDesktop} no se
     * monta — esconderlo por CSS habría pagado igual la espera del servidor,
     * que es justo lo que se quería ahorrar.
     */
    metrics: HomeMetrics | null;
}

/**
 * El inicio: el saludo, y debajo la pantalla que toque según el ancho.
 *
 * Son dos pantallas distintas, no una que se reacomoda, y por eso son dos
 * componentes con el nombre del ancho en el que se dibujan:
 *
 * - {@link HomeMobile} por debajo de `lg` — registrar, lo que espera, los dos
 *   paneles y a dónde ir. Sin cifras ni gráficas: se leen mal en media
 *   pantalla y cuestan las consultas pesadas.
 * - {@link HomeDesktop} de `lg` para arriba — el tablero completo.
 *
 * El saludo vive aquí porque es lo único que comparten: repetido en cada
 * pantalla saldría dos veces en el árbol y habría que esconder uno.
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
                <h1 className="text-2xl font-bold tracking-tight text-text-primary">{greeting}</h1>
                <p className="mt-0.5 text-[13px] text-text-tertiary">{todayLabel}</p>
            </header>

            <div className="lg:hidden">
                <HomeMobile balances={balances} pendingScans={pendingScans} />
            </div>

            {metrics && (
                <div className="hidden lg:block">
                    <HomeDesktop metrics={metrics} alerts={alerts} />
                </div>
            )}
        </div>
    );
}
