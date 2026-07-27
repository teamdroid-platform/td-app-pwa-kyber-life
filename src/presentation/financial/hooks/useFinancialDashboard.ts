"use client";

import { useCallback, useEffect, useState } from "react";
import { getDashboardOverviewAction } from "@/app/actions/financial-dashboard";
import type { FinancialKPIs, MonthlyBreakdown, TypeBreakdown, CategoryBreakdown, InstitutionBreakdown, DailyBreakdown } from "@/application/services/financial-dashboard-service";

interface DashboardState {
    kpis: FinancialKPIs | null;
    monthly: MonthlyBreakdown[];
    typeBreakdown: TypeBreakdown[];
    categoryBreakdown: CategoryBreakdown[];
    institutionBreakdown: InstitutionBreakdown[];
    dailyBreakdown: DailyBreakdown[];
    loading: boolean;
    error: string | null;
}

const INITIAL_STATE: DashboardState = {
    kpis: null,
    monthly: [],
    typeBreakdown: [],
    categoryBreakdown: [],
    institutionBreakdown: [],
    dailyBreakdown: [],
    loading: true,
    error: null,
};

/**
 * Live financial dashboard hook. Always fetches fresh data from the backend via
 * a single server action — no IndexedDB/offline cache. Refetches whenever the
 * date range changes or `refresh()` is called (e.g. from the realtime
 * subscription).
 *
 * It used to fan out into six parallel server actions, each one an independent
 * HTTP request that re-read the user's entire transaction history. Now one
 * request returns every block from a single range-narrowed read.
 */
export function useFinancialDashboard(startDate?: string, endDate?: string) {
    const [state, setState] = useState<DashboardState>(INITIAL_STATE);
    // True only while a *user-visible* refetch is in flight (a date/filter change),
    // so the UI can show an "updating" loader. Background refreshes (realtime /
    // polling) run silently and do NOT flip this, avoiding a loader flash.
    const [refetching, setRefetching] = useState(false);

    const fetchData = useCallback(async (silent = false) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        if (!silent) setRefetching(true);
        try {
            const result = await getDashboardOverviewAction(startDate, endDate);

            if (!result.success) {
                setState(prev => ({ ...prev, loading: false, error: result.error }));
                return;
            }

            setState({
                kpis: result.data.kpis,
                monthly: result.data.monthly,
                typeBreakdown: result.data.typeBreakdown,
                categoryBreakdown: result.data.categoryBreakdown,
                institutionBreakdown: result.data.institutionBreakdown,
                dailyBreakdown: result.data.dailyBreakdown,
                loading: false,
                error: null,
            });
        } catch (err) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: (err as Error).message,
            }));
        } finally {
            if (!silent) setRefetching(false);
        }
    }, [startDate, endDate]);

    // A change in the date range is a user action → show the visible loader.
    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    // `refresh()` defaults to a silent background refetch (realtime / polling),
    // so it never triggers the "updating" loader. Pass { silent: false } to opt in.
    const refresh = useCallback(async (opts?: { silent?: boolean }) => {
        await fetchData(opts?.silent ?? true);
    }, [fetchData]);

    return { ...state, refetching, refresh };
}
