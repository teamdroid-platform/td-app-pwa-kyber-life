import type { FinancialScannerTransaction } from "@/domain/entities/financial";

/** Las columnas por las que la bandeja deja ordenar. */
export const SCAN_SORT_FIELDS = ["date", "description", "amount"] as const;

export type ScanSortField = (typeof SCAN_SORT_FIELDS)[number];

export interface ScanSort {
    field: ScanSortField;
    direction: "asc" | "desc";
}

/**
 * Ordena los escaneos pendientes.
 *
 * Se resuelve en el cliente a propósito, y aquí sí es correcto: la pantalla
 * recibe todos los escaneos por confirmar de una vez, así que ordenar lo que
 * tiene es ordenar el total. En la tabla de transacciones no valía, porque el
 * scroll infinito dejaba fuera la mayor parte de las filas.
 *
 * Lo que no tiene el dato va siempre al final, ordene como ordene: un escaneo
 * sin importe no es uno de cero: es uno que el escáner no supo leer, y colarlo
 * entre los más baratos lo haría pasar por un dato que no es.
 */
export function sortScans(scans: FinancialScannerTransaction[], sort: ScanSort): FinancialScannerTransaction[] {
    const factor = sort.direction === "asc" ? 1 : -1;

    return [...scans].sort((a, b) => {
        const left = valueOf(a, sort.field);
        const right = valueOf(b, sort.field);

        const leftMissing = left === null;
        const rightMissing = right === null;
        if (leftMissing && rightMissing) return 0;
        if (leftMissing) return 1;
        if (rightMissing) return -1;

        if (typeof left === "number" && typeof right === "number") {
            return (left - right) * factor;
        }
        return String(left).localeCompare(String(right), "es") * factor;
    });
}

function valueOf(scan: FinancialScannerTransaction, field: ScanSortField): string | number | null {
    if (field === "amount") return scan.amount ?? null;
    if (field === "description") return scan.description?.trim() || scan.summary?.trim() || scan.merchant?.trim() || null;
    return scan.date ?? null;
}

export interface ScanPage {
    items: FinancialScannerTransaction[];
    page: number;
    totalPages: number;
    /** Índice 1-based del primero y del último de la página, para "Mostrando 1-10 de 186". */
    from: number;
    to: number;
    total: number;
}

/**
 * Corta la página pedida.
 *
 * Si la página ya no existe se devuelve la última en vez de nada: aprobar
 * escaneos desde el final va vaciando páginas, y quedarse en blanco ahí
 * parecería un error de la pantalla y no el resultado del propio trabajo.
 */
export function paginateScans(scans: FinancialScannerTransaction[], page: number, pageSize: number): ScanPage {
    const total = scans.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const items = scans.slice(start, start + pageSize);

    return {
        items,
        page: safePage,
        totalPages,
        from: total === 0 ? 0 : start + 1,
        to: total === 0 ? 0 : start + items.length,
        total,
    };
}
