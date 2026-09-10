import type { FinancialTransactionStatus, FinancialTransactionType } from "./entities/financial";
import type { UUID } from "./core";

// ─── Pagination ──────────────────────────────────────────────

export interface PaginationParams {
    /** 1-based page number */
    page: number;
    /** Items per page */
    pageSize: number;
}

// ─── Orden de la tabla de transacciones ──────────────────────

/**
 * Los únicos campos por los que la tabla deja ordenar.
 *
 * Son tres y no más a propósito: categoría e institución se guardan como id, y
 * ordenar por él daría un orden que al usuario no le dice nada. Ordenar por su
 * nombre exigiría un join que esta consulta no hace.
 */
export const TRANSACTION_SORT_FIELDS = ["date", "description", "amount"] as const;

export type TransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];

export interface TransactionSort {
    field: TransactionSortField;
    direction: "asc" | "desc";
}

/**
 * Convierte lo que venga de la URL en un orden utilizable, o en nada.
 *
 * La lista blanca es la frontera de seguridad, no una comodidad: el campo
 * termina en un `.order()` de PostgREST, que construye SQL con él. Cualquier
 * cosa fuera de {@link TRANSACTION_SORT_FIELDS} se descarta entera en vez de
 * saneárse, y la lista se queda con su orden por defecto.
 */
export function normalizeTransactionSort(
    field: unknown,
    direction: unknown,
): TransactionSort | undefined {
    if (typeof field !== "string") return undefined;
    if (!(TRANSACTION_SORT_FIELDS as readonly string[]).includes(field)) return undefined;
    return {
        field: field as TransactionSortField,
        direction: direction === "asc" ? "asc" : "desc",
    };
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}

// ─── Financial Transaction Filters ───────────────────────────

export interface TransactionSearchFilters {
    query?: string;
    status?: FinancialTransactionStatus;
    types?: FinancialTransactionType[];
    categoryId?: UUID;
    institutionId?: UUID;

    dateFrom?: string;
    dateTo?: string;
    amountMin?: number;
    amountMax?: number;
    tags?: string[];
    currency?: string;
}
