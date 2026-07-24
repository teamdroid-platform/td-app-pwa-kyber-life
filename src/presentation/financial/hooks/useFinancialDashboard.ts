"use client";

import { useCallback, useEffect, useState } from "react";
import {
    getFinancialKPIsAction,
    getMonthlyBreakdownAction,
    getTypeBreakdownAction,
    getCategoryBreakdownAction,
    getInstitutionBreakdownAction,
    getDailyBreakdownAction,
} from "@/app/actions/financial-dashboard";
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
 * server actions — no IndexedDB/offline cache. Refetches whenever the date range
 * changes or `refresh()` is called (e.g. from the realtime subscription).
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
            const [kpiRes, monthlyRes, typeRes, categoryRes, institutionRes, dailyRes] = await Promise.all([
                getFinancialKPIsAction(startDate, endDate),
                getMonthlyBreakdownAction(6, startDate, endDate),
                getTypeBreakdownAction(startDate, endDate),
                getCategoryBreakdownAction(startDate, endDate),
                getInstitutionBreakdownAction(startDate, endDate),
                getDailyBreakdownAction(startDate, endDate),
            ]);

            setState({
                kpis: kpiRes.success && kpiRes.data ? kpiRes.data : null,
                monthly: monthlyRes.success && monthlyRes.data ? monthlyRes.data : [],
                typeBreakdown: typeRes.success && typeRes.data ? typeRes.data : [],
                categoryBreakdown: categoryRes.success && categoryRes.data ? categoryRes.data : [],
                institutionBreakdown: institutionRes.success && institutionRes.data ? institutionRes.data : [],
                dailyBreakdown: dailyRes.success && dailyRes.data ? dailyRes.data : [],
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
