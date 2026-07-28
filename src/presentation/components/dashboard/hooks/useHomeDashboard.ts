"use client";

import { useCallback, useEffect, useState } from "react";
import { getDashboardOverviewAction } from "@/app/actions/financial-dashboard";
import { getMarketDailySpendAction, getMarketTopProductsAction } from "@/app/actions/analytics";
import type {
    DailyBreakdown,
    CategoryBreakdown,
    FinancialKPIs,
} from "@/application/services/financial-dashboard-service";

export interface FinancialOverviewData {
    kpis: FinancialKPIs | null;
    daily: DailyBreakdown[];
    categories: CategoryBreakdown[];
}

export interface MarketProduct {
    id: string;
    name: string;
    value: number;
}

export interface MarketOverviewData {
    daily: { date: string; total: number }[];
    topProducts: MarketProduct[];
}

const EMPTY_FINANCIAL: FinancialOverviewData = { kpis: null, daily: [], categories: [] };
const EMPTY_MARKET: MarketOverviewData = { daily: [], topProducts: [] };

/**
 * Financial column of the hub dashboard: KPIs (balance / income / expense),
 * the income-vs-expense trend and the category breakdown, all for one shared
 * date range. Degrades gracefully — a failing source leaves its slice empty.
 */
export function useFinancialOverview(startDate?: string, endDate?: string) {
    const [data, setData] = useState<FinancialOverviewData>(EMPTY_FINANCIAL);
    const [loading, setLoading] = useState(true);

    // One server action for all three blocks: they used to be three parallel
    // requests, each re-reading the user's whole transaction history.
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getDashboardOverviewAction(startDate, endDate);
            setData(
                result.success
                    ? { kpis: result.data.kpis, daily: result.data.dailyBreakdown, categories: result.data.categoryBreakdown }
                    : EMPTY_FINANCIAL,
            );
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    return { data, loading, refresh: fetchAll };
}

/**
 * Market column of the hub dashboard: the spend distribution and the top
 * products (which also power the frequent-products table), for one shared
 * date range. A high product limit lets the summary count distinct items.
 */
export function useMarketOverview(startDate?: string, endDate?: string) {
    const [data, setData] = useState<MarketOverviewData>(EMPTY_MARKET);
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [daily, top] = await Promise.all([
                getMarketDailySpendAction(startDate, endDate),
                getMarketTopProductsAction(startDate, endDate, 100),
            ]);
            setData({
                daily: daily.success && daily.data ? daily.data : [],
                topProducts: top.success && top.data ? top.data : [],
            });
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    return { data, loading, refresh: fetchAll };
}
