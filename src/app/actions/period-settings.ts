"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { periodSettingsService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { periodScopeSchema, setCycleStartDaySchema } from "@/lib/validators/period-schemas";

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

function fail(error: unknown) {
    if (error instanceof z.ZodError) {
        return { success: false as const, error: `Validation failed: ${formatZodError(error)}` };
    }
    return { success: false as const, error: (error as Error).message };
}

export async function getCycleStartDayAction(scope: string) {
    try {
        const validated = periodScopeSchema.parse(scope);
        const userId = await requireUserId();
        const data = await periodSettingsService.getCycleStartDay(userId, validated);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error fetching cycle start day:", error);
        return fail(error);
    }
}

/** Los dos ámbitos de una sola vez, para la pantalla de ajustes. */
export async function getAllCycleStartDaysAction() {
    try {
        const userId = await requireUserId();
        const data = await periodSettingsService.getAllCycleStartDays(userId);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error fetching cycle start days:", error);
        return fail(error);
    }
}

export async function setCycleStartDayAction(input: unknown) {
    try {
        const validated = setCycleStartDaySchema.parse(input);
        const userId = await requireUserId();
        const data = await periodSettingsService.setCycleStartDay(
            userId, validated.scope, validated.cycleStartDay,
        );

        // Las cuatro pantallas cuyo rango por defecto sale de esta preferencia.
        revalidatePath("/dashboard");
        revalidatePath("/financial");
        revalidatePath("/financial/transactions");
        revalidatePath("/market/analytics");

        return { success: true as const, data };
    } catch (error) {
        console.error("Error saving cycle start day:", error);
        return fail(error);
    }
}
