"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import type {
    FinancialInstitution,
    FinancialInstitutionType,
    FinancialCategory,
} from "@/domain/entities/financial";
import type { BankAccount, BankCard, BankInstitution } from "@/domain/entities/bank";

export interface TransactionFormOptions {
    institutions: FinancialInstitution[];
    categories: FinancialCategory[];
    institutionTypes: FinancialInstitutionType[];
    /** Cuentas y tarjetas confirmadas, para el paso de pago. */
    bankAccounts: BankAccount[];
    bankCards: BankCard[];
    /** Emisores, para dar de alta una cuenta o tarjeta desde ese mismo paso. */
    bankInstitutions: BankInstitution[];
}

const EMPTY: TransactionFormOptions = {
    institutions: [], categories: [], institutionTypes: [],
    bankAccounts: [], bankCards: [], bankInstitutions: [],
};

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
                // Mezclado con EMPTY: una respuesta a la que le falte una lista
                // dejaría un `undefined` donde los pickers esperan un array, y
                // el fallo aparecería lejos de aquí.
                setOptions({ ...EMPTY, ...result.data });
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

    /**
     * Suma lo que el paso de pago acaba de crear, sin recargar.
     *
     * Recargar la ruta aquí tiraría lo que el usuario lleva escrito en el
     * wizard, así que la lista se actualiza en memoria y el servidor ya quedó
     * al día por su cuenta.
     */
    const addBankEntities = useCallback((added: {
        account?: BankAccount;
        card?: BankCard;
        institution?: BankInstitution | null;
    }) => {
        setOptions((prev) => ({
            ...prev,
            bankAccounts: added.account ? [...prev.bankAccounts, added.account] : prev.bankAccounts,
            bankCards: added.card ? [...prev.bankCards, added.card] : prev.bankCards,
            bankInstitutions: added.institution
                ? [...prev.bankInstitutions, added.institution]
                : prev.bankInstitutions,
        }));
    }, []);

    return {
        ...options,
        loading,
        error,
        reload,
        setInstitutions,
        setCategories,
        addBankEntities,
    };
}
