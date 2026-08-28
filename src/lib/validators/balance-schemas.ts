import { z } from "zod";

export const balanceModeSchema = z.enum(['TOTAL', 'PERIOD', 'PERIOD_WITH_CREDIT']);

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
