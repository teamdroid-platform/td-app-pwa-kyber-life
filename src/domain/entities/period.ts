import { UUID } from "../core";

/** Los ámbitos que tienen ciclo propio. */
export type PeriodScope = 'FINANCIAL' | 'MARKET';

export const PERIOD_SCOPES: readonly PeriodScope[] = ['FINANCIAL', 'MARKET'] as const;

/**
 * El día de corte que se aplica mientras el usuario no guarde otro.
 *
 * Finanzas conserva el 22 que la app usaba escrito a mano, para que nadie vea
 * cambiar sus cifras sin haber tocado nada. Compras arranca en mes natural,
 * que es lo que su preset "Mes" ya hacía.
 */
export const DEFAULT_CYCLE_START_DAY: Record<PeriodScope, number> = {
    FINANCIAL: 22,
    MARKET: 1,
};

export const MIN_CYCLE_START_DAY = 1;
export const MAX_CYCLE_START_DAY = 31;

export interface PeriodSettings {
    ownerUserId: UUID;
    scope: PeriodScope;
    cycleStartDay: number;
}
