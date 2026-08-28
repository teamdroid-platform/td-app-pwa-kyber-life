"use server";

import { z } from "zod";
import { balanceService, balanceSettingsRepository } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import {
    balanceModeSchema, balanceRangeSchema, balanceScopeRuleSchema,
} from "@/lib/validators/balance-schemas";

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

function fail(error: unknown) {
    if (error instanceof z.ZodError) {
        return { success: false as const, error: `Validation failed: ${formatZodError(error)}` };
    }
    return { success: false as const, error: (error as Error).message };
}

/** Los tres balances de una sola vez: el selector no vuelve al servidor. */
export async function getBalanceSetAction(startDate?: string, endDate?: string) {
    try {
        const range = balanceRangeSchema.parse({ startDate, endDate });
        const userId = await requireUserId();

        const data = await balanceService.getBalanceSet(userId, {
            startDate: range.startDate ? new Date(range.startDate) : undefined,
            endDate: range.endDate ? new Date(range.endDate) : undefined,
        });
        return { success: true as const, data };
    } catch (error) {
        console.error("Error fetching balance set:", error);
        return fail(error);
    }
}

/** Modo por defecto y excepciones guardadas, para la pantalla de ajustes. */
export async function getBalanceScopeAction() {
    try {
        const userId = await requireUserId();
        const [settings, rules] = await Promise.all([
            balanceSettingsRepository.getSettings(userId),
            balanceSettingsRepository.getRules(userId),
        ]);
        return { success: true as const, data: { settings, rules } };
    } catch (error) {
        console.error("Error fetching balance scope:", error);
        return fail(error);
    }
}

export async function setBalanceDefaultModeAction(mode: string) {
    try {
        const validated = balanceModeSchema.parse(mode);
        const userId = await requireUserId();
        const data = await balanceSettingsRepository.setDefaultMode(userId, validated);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error saving default balance mode:", error);
        return fail(error);
    }
}

/**
 * Guarda una excepción. Al alternar un banco entero, `clearTargetIds` trae los
 * ids de sus cuentas y tarjetas: sus excepciones se borran para que el banco
 * quede limpio. Si no, arrastraría excepciones que la interfaz ya no muestra.
 */
export async function setBalanceScopeRuleAction(input: unknown) {
    try {
        const validated = balanceScopeRuleSchema.parse(input);
        const userId = await requireUserId();

        if (validated.clearTargetIds?.length) {
            await balanceSettingsRepository.clearRulesForTargets(userId, validated.clearTargetIds);
        }

        const data = await balanceSettingsRepository.setRule(
            userId, validated.targetType, validated.targetId, validated.included,
        );
        return { success: true as const, data };
    } catch (error) {
        console.error("Error saving balance scope rule:", error);
        return fail(error);
    }
}

export async function clearBalanceScopeAction() {
    try {
        const userId = await requireUserId();
        await balanceSettingsRepository.clearRules(userId);
        return { success: true as const, data: null };
    } catch (error) {
        console.error("Error clearing balance scope:", error);
        return fail(error);
    }
}
