import { UUID } from "../core";
import { BalanceMode, BalanceScopeRule, BalanceSettings, BalanceScopeTargetType } from "../entities/balance";

/**
 * Guarda solo lo que el usuario cambió: el modo por defecto y las excepciones
 * de alcance. Sin filas, el comportamiento por defecto aplica entero.
 */
export interface IBalanceSettingsRepository {
    /** Null cuando el usuario nunca configuró nada. */
    getSettings(userId: UUID): Promise<BalanceSettings | null>;
    setDefaultMode(userId: UUID, mode: BalanceMode): Promise<BalanceSettings>;
    getRules(userId: UUID): Promise<BalanceScopeRule[]>;
    /** Crea o actualiza la regla de ese objetivo. */
    setRule(userId: UUID, targetType: BalanceScopeTargetType, targetId: UUID, included: boolean): Promise<BalanceScopeRule>;
    /**
     * Borra las reglas de una lista de objetivos, que vuelven a heredar de su
     * banco. Con un solo id sirve además para quitar una excepción suelta.
     */
    clearRulesForTargets(userId: UUID, targetIds: readonly UUID[]): Promise<void>;
    /** Borra todas las reglas del usuario. */
    clearRules(userId: UUID): Promise<void>;
}
