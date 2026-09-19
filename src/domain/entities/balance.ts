import { BaseEntity, UUID } from "../core";

/** Los tres balances que la app sabe calcular. */
export type BalanceMode = 'TOTAL' | 'PERIOD' | 'PERIOD_WITH_CREDIT';

export const BALANCE_MODES: readonly BalanceMode[] = ['TOTAL', 'PERIOD', 'PERIOD_WITH_CREDIT'] as const;

/** El que se usa mientras el usuario no configure otro. */
export const DEFAULT_BALANCE_MODE: BalanceMode = 'PERIOD';

export type BalanceScopeTargetType = 'INSTITUTION' | 'ACCOUNT' | 'CARD';

/**
 * Una excepción a "todo entra al balance". Solo se guardan las excepciones:
 * un banco sin regla está incluido, y una cuenta sin regla hereda la de su
 * banco. Así una cuenta que el escáner cree mañana entra sola.
 */
export interface BalanceScopeRule extends BaseEntity {
    ownerUserId: UUID;
    targetType: BalanceScopeTargetType;
    targetId: UUID;
    included: boolean;
}

export interface BalanceSettings {
    ownerUserId: UUID;
    defaultMode: BalanceMode;
    /**
     * Si la lista de transacciones muestra el saldo acumulado bajo cada monto.
     * Apagado de fábrica: es un dato de más en cada fila y quien no lleve la
     * lista como un libro diario no lo necesita.
     */
    showRunningBalance: boolean;
}

/** El valor de {@link BalanceSettings.showRunningBalance} sin configuración. */
export const DEFAULT_SHOW_RUNNING_BALANCE = false;
