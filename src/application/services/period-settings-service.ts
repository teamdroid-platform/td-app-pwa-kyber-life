import type { IPeriodSettingsRepository } from "@/domain/repositories/period";
import type { UUID } from "@/domain/core";
import {
    DEFAULT_CYCLE_START_DAY, PERIOD_SCOPES, type PeriodScope, type PeriodSettings,
} from "@/domain/entities/period";
import { cycleStartDaySchema } from "@/lib/validators/period-schemas";

/**
 * Resuelve el día de corte de cada ámbito, aplicando el defecto cuando el
 * usuario nunca lo configuró. Ningún consumidor necesita conocer los defectos:
 * pide el día y recibe uno válido siempre.
 */
export class PeriodSettingsService {
    constructor(private readonly repository: IPeriodSettingsRepository) {}

    async getCycleStartDay(ownerUserId: UUID, scope: PeriodScope): Promise<number> {
        const found = await this.repository.findByOwner(ownerUserId, scope);
        return found?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY[scope];
    }

    /** Los dos ámbitos de una sola lectura, para la pantalla de ajustes. */
    async getAllCycleStartDays(ownerUserId: UUID): Promise<Record<PeriodScope, number>> {
        const saved = await this.repository.findAllByOwner(ownerUserId);
        const byScope = new Map(saved.map(s => [s.scope, s.cycleStartDay]));

        return PERIOD_SCOPES.reduce((acc, scope) => {
            acc[scope] = byScope.get(scope) ?? DEFAULT_CYCLE_START_DAY[scope];
            return acc;
        }, {} as Record<PeriodScope, number>);
    }

    /**
     * Valida antes de escribir, para que el CHECK de la base sea la segunda
     * línea de defensa y no la primera: un día inválido debe fallar con un
     * mensaje de Zod, no con un error de Postgres.
     */
    async setCycleStartDay(
        ownerUserId: UUID,
        scope: PeriodScope,
        cycleStartDay: number,
    ): Promise<PeriodSettings> {
        const validated = cycleStartDaySchema.parse(cycleStartDay);
        return this.repository.upsert(ownerUserId, scope, validated);
    }
}
