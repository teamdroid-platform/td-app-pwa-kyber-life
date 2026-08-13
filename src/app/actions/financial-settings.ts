"use server";

import { financialSettingsService, bankService } from "@/infrastructure/container";
import { FinancialInstitution, FinancialCategory } from "@/domain/entities/financial";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { revalidatePath } from "next/cache";
import { UUID } from "@/domain/core";

async function getRequiredUser(): Promise<{ id: string }> {
    return { id: await requireUserId() };
}

export async function getInstitutionTypesAction() {
    const user = await getRequiredUser();
    return financialSettingsService.getInstitutionTypes(user.id);
}

export async function createInstitutionTypeAction(data: any) {
    const user = await getRequiredUser();
    const result = await financialSettingsService.createInstitutionType(user.id, data);
    revalidatePath("/financial/settings");
    return result;
}

export async function getInstitutionsAction() {
    const user = await getRequiredUser();
    return financialSettingsService.getInstitutions(user.id);
}

export async function createInstitutionAction(data: Partial<FinancialInstitution>) {
    const user = await getRequiredUser();
    const result = await financialSettingsService.createInstitution(user.id, data);
    revalidatePath("/financial/settings");
    return result;
}

export async function updateInstitutionAction(id: UUID, data: Partial<FinancialInstitution>) {
    console.log("UPDATE INSTITUTION ACTION CALLED:", { id, data });
    const user = await getRequiredUser();
    try {
        const result = await financialSettingsService.updateInstitution(user.id, id, data);
        console.log("UPDATE RESULT:", result);
        revalidatePath("/financial/settings");
        return result;
    } catch (error) {
        console.error("UPDATE ERROR:", error);
        throw error;
    }
}

export async function deleteInstitutionAction(id: UUID) {
    const user = await getRequiredUser();
    await financialSettingsService.deleteInstitution(user.id, id);
    revalidatePath("/financial/settings");
}

export async function getInstitutionTransactionCountAction(id: UUID) {
    const user = await getRequiredUser();
    return financialSettingsService.getInstitutionTransactionCount(user.id, id);
}

export async function getInstitutionTransactionStatsAction() {
    const user = await getRequiredUser();
    return financialSettingsService.getInstitutionTransactionStats(user.id);
}

export async function getCategoryTransactionStatsAction() {
    const user = await getRequiredUser();
    return financialSettingsService.getCategoryTransactionStats(user.id);
}

export async function mergeInstitutionAction(sourceId: UUID, targetId: UUID) {
    const user = await getRequiredUser();
    const result = await financialSettingsService.mergeInstitution(user.id, sourceId, targetId);
    revalidatePath("/financial/settings");
    return result;
}

export async function getCategoriesAction() {
    const user = await getRequiredUser();
    return financialSettingsService.getCategories(user.id);
}

/**
 * Everything the transaction forms need to populate their pickers, in ONE
 * server action.
 *
 * Why a single call: each server action is its own HTTP request, so firing four
 * of them in parallel from the client means four independent `auth.getUser()`
 * calls. With an expired access token they all try to refresh at once and — as
 * Supabase rotates (one-time-uses) the refresh token — the losers fail with
 * "Unauthorized", which used to blank out the pickers. Bundled here, the refresh
 * happens once per request and `React.cache` shares it across the four reads.
 */
export async function getTransactionFormOptionsAction() {
    try {
        const user = await getRequiredUser();
        const [institutions, categories, institutionTypes, bankOverview] = await Promise.all([
            financialSettingsService.getInstitutions(user.id),
            financialSettingsService.getCategories(user.id),
            financialSettingsService.getInstitutionTypes(user.id),
            // Las cuentas y tarjetas del módulo Bancos viajan en la misma
            // llamada: el paso de pago las necesita y una request aparte
            // costaría otro round-trip de auth, que es justo lo que este
            // bundle existe para evitar.
            bankService.getOverview(user.id),
        ]);
        return {
            success: true as const,
            data: {
                institutions,
                categories: categories.filter((c: FinancialCategory) => !c.isDeleted),
                institutionTypes,
                bankAccounts: bankOverview.accounts.filter(a => !a.isUnconfirmed),
                bankCards: bankOverview.cards.filter(c => !c.isUnconfirmed),
            },
        };
    } catch (error) {
        console.error("Error loading transaction form options:", error);
        return { success: false as const, error: (error as Error).message };
    }
}

export async function createCategoryAction(data: Partial<FinancialCategory>) {
    const user = await getRequiredUser();
    const result = await financialSettingsService.createCategory(user.id, data);
    revalidatePath("/financial/settings");
    return result;
}

export async function updateCategoryAction(id: UUID, data: Partial<FinancialCategory>) {
    const user = await getRequiredUser();
    const result = await financialSettingsService.updateCategory(user.id, id, data);
    revalidatePath("/financial/settings");
    return result;
}

export async function getCategoryTransactionCountAction(id: UUID) {
    const user = await getRequiredUser();
    return financialSettingsService.getCategoryTransactionCount(user.id, id);
}

export async function deleteCategoryAction(id: UUID) {
    const user = await getRequiredUser();
    const result = await financialSettingsService.deleteCategory(user.id, id);
    revalidatePath("/financial/settings");
    return result;
}
