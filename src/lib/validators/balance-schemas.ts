import { z } from "zod";
import { BALANCE_MODES } from "@/domain/entities/balance";

// Derivado de BALANCE_MODES, no re-declarado: un cuarto modo que se agregue
// ahí entra aquí solo, en vez de quedar rechazado en silencio en el borde de
// la action por un enum que nadie recordó actualizar.
export const balanceModeSchema = z.enum(BALANCE_MODES);

export const balanceRangeSchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const balanceScopeRuleSchema = z.object({
    targetType: z.enum(['INSTITUTION', 'ACCOUNT', 'CARD']),
    targetId: z.string().uuid(),
    included: z.boolean(),
    /** Ids de cuentas y tarjetas del banco, para limpiar sus excepciones. */
    clearTargetIds: z.array(z.string().uuid()).optional(),
});
