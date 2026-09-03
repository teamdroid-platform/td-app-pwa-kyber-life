"use client";

import { createContext, useContext, useMemo } from "react";
import { cycleRangeContaining } from "@/lib/date-range";

const CycleStartDayContext = createContext<number | null>(null);

/**
 * Reparte el día de corte del ámbito bajo el que se monta.
 *
 * El layout de cada módulo lo monta con SU día, así que el hook no necesita
 * saber de ámbitos: un componente recibe el ciclo correcto por estar donde
 * está. Y como el valor llega en el HTML del servidor, los `useState` que se
 * inicializan con él arrancan ya en su sitio, sin parpadeo ni desajuste de
 * hidratación.
 */
export function PeriodSettingsProvider({
    cycleStartDay,
    children,
}: {
    cycleStartDay: number;
    children: React.ReactNode;
}) {
    return (
        <CycleStartDayContext.Provider value={cycleStartDay}>
            {children}
        </CycleStartDayContext.Provider>
    );
}

export function useCycleStartDay(): number {
    const value = useContext(CycleStartDayContext);
    if (value === null) {
        throw new Error("useCycleStartDay requiere un PeriodSettingsProvider por encima");
    }
    return value;
}

/** El ciclo que contiene hoy, en YYYY-MM-DD. */
export function useCycleRange(): { start: string; end: string } {
    const cycleStartDay = useCycleStartDay();
    return useMemo(() => cycleRangeContaining(cycleStartDay), [cycleStartDay]);
}
