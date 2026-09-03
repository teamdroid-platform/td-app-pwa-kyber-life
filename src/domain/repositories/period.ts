import { UUID } from "../core";
import { PeriodScope, PeriodSettings } from "../entities/period";

/**
 * Guarda solo lo que el usuario cambió. Sin fila para un ámbito, el defecto de
 * ese ámbito aplica entero: quien nunca entra a la pantalla de ajustes no tiene
 * ninguna fila y ve el comportamiento de siempre.
 */
export interface IPeriodSettingsRepository {
    /** Null cuando el usuario nunca configuró ese ámbito. */
    findByOwner(ownerUserId: UUID, scope: PeriodScope): Promise<PeriodSettings | null>;
    /** Los ámbitos que el usuario sí configuró, para pintarlos juntos en ajustes. */
    findAllByOwner(ownerUserId: UUID): Promise<PeriodSettings[]>;
    upsert(ownerUserId: UUID, scope: PeriodScope, cycleStartDay: number): Promise<PeriodSettings>;
}
