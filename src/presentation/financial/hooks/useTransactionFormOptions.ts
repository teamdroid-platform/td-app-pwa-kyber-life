"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import type {
    FinancialInstitution,
    FinancialInstitutionType,
    FinancialCategory,
} from "@/domain/entities/financial";

export interface TransactionFormOptions {
    institutions: FinancialInstitution[];
    categories: FinancialCategory[];
    institutionTypes: FinancialInstitutionType[];
}

const EMPTY: TransactionFormOptions = { institutions: [], categories: [], institutionTypes: [] };

/** One retry covers the common transient case (a token refresh racing the request). */
const RETRY_DELAY_MS = 600;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Loads the institutions / categories / types that every transaction form's
 * pickers need, through a single server action.
 *
 * Resilience matters here: when this data failed to load the pickers silently
 * rendered as "you have none yet", which reads as data loss. So a failed attempt
 * is retried once, the previously loaded lists are never overwritten with empty
 * ones, and a persistent failure is surfaced via `error` instead of looking like
 * an empty account.
 */
export function useTransactionFormOptions(onLoaded?: (options: TransactionFormOptions) => void) {
    const [options, setOptions] = useState<TransactionFormOptions>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Keep the callback out of the effect's deps so callers can pass an inline fn.
    const onLoadedRef = useRef(onLoaded);
    useEffect(() => {
        onLoadedRef.current = onLoaded;
    });

    const activeRef = useRef(true);
    useEffect(() => {
        activeRef.current = true;
        return () => {
            activeRef.current = false;
        };
    }, []);

    // Starts with an await on purpose: the state already begins as "loading",
    // so the mount effect below never sets state synchronously.
    const load = useCallback(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
            const result = await getTransactionFormOptionsAction().catch((e: unknown) => ({
                success: false as const,
                error: e instanceof Error ? e.message : "Error desconocido",
            }));

            if (!activeRef.current) return;

            if (result.success) {
                setOptions(result.data);
                setError(null);
                setLoading(false);
                onLoadedRef.current?.(result.data);
                return;
            }

            if (attempt === 0) {
                await delay(RETRY_DELAY_MS);
                continue;
            }

            // Keep whatever was already loaded rather than blanking the pickers.
            setError(result.error ?? "No se pudieron cargar las opciones");
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Fetching on mount is the legitimate "subscribe to an external system"
        // case for an effect; `load` only touches state after its first await.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    /** Manual retry (from a handler): flips back to the loading state first. */
    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        await load();
    }, [load]);

    const setInstitutions = useCallback((institutions: FinancialInstitution[]) => {
        setOptions((prev) => ({ ...prev, institutions }));
    }, []);

    const setCategories = useCallback((categories: FinancialCategory[]) => {
        setOptions((prev) => ({ ...prev, categories }));
    }, []);

    return {
        ...options,
        loading,
        error,
        reload,
        setInstitutions,
        setCategories,
    };
}
