import { sortScans, paginateScans, SCAN_SORT_FIELDS } from "@/presentation/financial/lib/scan-table";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";

/**
 * Orden y paginación de la bandeja de escaneos.
 *
 * Aquí se resuelven en el cliente, y eso es correcto: la pantalla ya recibe el
 * conjunto completo de escaneos pendientes. Es lo contrario del caso de la
 * tabla de transacciones, donde el scroll infinito obligaba a que ordenara la
 * consulta para no mentir sobre lo que se está ordenando.
 */
function scan(over: Partial<FinancialScannerTransaction> = {}): FinancialScannerTransaction {
    return {
        id: over.id ?? "s1",
        ownerUserId: "user-1",
        status: "PENDING",
        createdAt: "2026-07-23T10:00:00Z",
        updatedAt: "2026-07-23T10:00:00Z",
        isDeleted: false,
        ...over,
    } as FinancialScannerTransaction;
}

describe("sortScans", () => {
    const rows = [
        scan({ id: "b", date: "2026-07-10T10:00:00Z", description: "Bravo", amount: 300 }),
        scan({ id: "a", date: "2026-07-20T10:00:00Z", description: "Alfa", amount: 100 }),
        scan({ id: "c", date: "2026-07-15T10:00:00Z", description: "Charlie", amount: 200 }),
    ];

    const ids = (field: (typeof SCAN_SORT_FIELDS)[number], direction: "asc" | "desc") =>
        sortScans(rows, { field, direction }).map((r) => r.id);

    it("ordena por fecha en las dos direcciones", () => {
        expect(ids("date", "desc")).toEqual(["a", "c", "b"]);
        expect(ids("date", "asc")).toEqual(["b", "c", "a"]);
    });

    it("ordena por importe", () => {
        expect(ids("amount", "asc")).toEqual(["a", "c", "b"]);
    });

    it("ordena por descripción alfabéticamente", () => {
        expect(ids("description", "asc")).toEqual(["a", "b", "c"]);
    });

    it("no altera el arreglo que recibe", () => {
        const original = [...rows];
        sortScans(rows, { field: "amount", direction: "asc" });
        expect(rows).toEqual(original);
    });

    it("manda al final lo que no tiene ese dato, ordene como ordene", () => {
        // Un escaneo sin importe no es "cero": es que el escáner no lo encontró.
        // Colarlo entre los más baratos lo haría pasar por un dato que no es.
        const conHuecos = [
            scan({ id: "sin", amount: null }),
            scan({ id: "con", amount: 50 }),
        ];

        expect(sortScans(conHuecos, { field: "amount", direction: "asc" }).map((r) => r.id)).toEqual(["con", "sin"]);
        expect(sortScans(conHuecos, { field: "amount", direction: "desc" }).map((r) => r.id)).toEqual(["con", "sin"]);
    });
});

describe("paginateScans", () => {
    const rows = Array.from({ length: 23 }, (_, i) => scan({ id: `s${i + 1}` }));

    it("corta la página pedida", () => {
        const result = paginateScans(rows, 1, 10);
        expect(result.items.map((r) => r.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]);
        expect(result.from).toBe(1);
        expect(result.to).toBe(10);
    });

    it("cuenta bien la última página incompleta", () => {
        const result = paginateScans(rows, 3, 10);
        expect(result.items).toHaveLength(3);
        expect(result.from).toBe(21);
        expect(result.to).toBe(23);
        expect(result.totalPages).toBe(3);
    });

    it("devuelve la última página cuando se pide una que ya no existe", () => {
        // Pasa de verdad: apruebas escaneos desde la última página hasta que la
        // página deja de existir. Quedarse en blanco ahí parecería un error.
        const result = paginateScans(rows, 9, 10);
        expect(result.page).toBe(3);
        expect(result.items).toHaveLength(3);
    });

    it("no se cae con la lista vacía", () => {
        const result = paginateScans([], 1, 10);
        expect(result.items).toEqual([]);
        expect(result.totalPages).toBe(1);
        expect(result.from).toBe(0);
        expect(result.to).toBe(0);
    });
});
