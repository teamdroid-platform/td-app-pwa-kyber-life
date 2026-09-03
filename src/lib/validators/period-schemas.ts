import { z } from "zod";
import { MAX_CYCLE_START_DAY, MIN_CYCLE_START_DAY, PERIOD_SCOPES } from "@/domain/entities/period";

// Derivado de PERIOD_SCOPES, no re-declarado: un tercer ámbito que se agregue
// ahí entra aquí solo, en vez de quedar rechazado en silencio en el borde de
// la action por un enum que nadie recordó actualizar.
export const periodScopeSchema = z.enum(PERIOD_SCOPES);

export const cycleStartDaySchema = z
    .number()
    .int()
    .min(MIN_CYCLE_START_DAY)
    .max(MAX_CYCLE_START_DAY);

export const setCycleStartDaySchema = z.object({
    scope: periodScopeSchema,
    cycleStartDay: cycleStartDaySchema,
});
