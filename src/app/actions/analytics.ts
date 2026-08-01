"use server";

import { analyticsService, initializeContainer } from "@/infrastructure/container";
import { cookies } from "next/headers";
import { resolveUserId } from "./_auth";

initializeContainer();

async function getUserId() {
    const cookieStore = await cookies();
    const session = cookieStore.get("kyber_session");
    if (!session || !session.value) throw new Error("Unauthorized");
    return session.value;
}

export async function getMonthlyExpensesAction(monthsBack: number = 6) {
    try {
        const userId = await getUserId();
        const data = await analyticsService.getMonthlyExpenses(userId, monthsBack);
        return { success: true, data };
    } catch (e: any) {
        return { error: e.message };
    }
}

export async function getCategorySpendingAction() {
    try {
        const userId = await getUserId();
        const data = await analyticsService.getCategorySpending(userId);
        return { success: true, data };
    } catch (e: any) {
        return { error: e.message };
    }
}

export async function getFrequentProductsAction(mode: 'count' | 'units') {
    try {
        const userId = await getUserId();
        const data = await analyticsService.getFrequentProducts(userId, mode);
        return { success: true, data };
    } catch (e: any) {
        return { error: e.message };
    }
}

// ... existing code ...
export async function getPriceAnalyticsAction(brandProductId: string) {
    try {
        const userId = await resolveUserId();
        // Run parallel
        const [history, latest] = await Promise.all([
            analyticsService.getPriceHistory(userId, brandProductId),
            analyticsService.getLatestPrices(userId, brandProductId)
        ]);
        return { success: true, data: { history, latest } };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getGenericPriceAnalyticsAction(genericItemId: string) {
    try {
        const userId = await resolveUserId();
        const [history, latest] = await Promise.all([
            analyticsService.getGenericPriceHistory(userId, genericItemId),
            analyticsService.getGenericLatestPrices(userId, genericItemId)
        ]);
        return { success: true, data: { history, latest } };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ── Dashboard hub: range-aware market analytics (data-source-agnostic auth) ──

/**
 * Both market blocks of the hub dashboard —the spend trend curve and the top
 * products bar chart— in one action.
 *
 * They used to be two, which meant two HTTP requests each resolving the
 * session on its own, right while the user stares at the loading robot on a
 * cold launch. Bundled, the session is resolved once and the two queries run
 * in parallel on the server.
 */
export async function getMarketOverviewAction(startDate?: string, endDate?: string, limit: number = 8) {
    try {
        const userId = await resolveUserId();
        const [daily, topProducts] = await Promise.all([
            analyticsService.getDailyExpenses(
                userId,
                startDate ? new Date(startDate) : undefined,
                endDate ? new Date(endDate) : undefined,
            ),
            analyticsService.getTopSpendingProducts(userId, limit, startDate, endDate),
        ]);
        return { success: true, data: { daily, topProducts } };
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
}
