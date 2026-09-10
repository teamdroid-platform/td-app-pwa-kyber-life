import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { FinancialTransaction } from "@/domain/entities/financial";
import { normalizeTransactionSort, type TransactionSort } from "@/domain/pagination";

/**
 * El orden de la tabla de transacciones.
 *
 * Importa que viaje hasta la consulta y no se resuelva en memoria sobre la
 * página cargada: la lista tiene scroll infinito, así que ordenar solo lo
 * traído mostraría veinte filas de ciento cincuenta y siete y parecería el
 * total.
 */
describe("Orden de la paginación de transacciones", () => {
    let repository: InMemoryFinancialTransactionRepository;
    const mockUserId = "user-123";

    /** Tres movimientos con fecha, descripción e importe deliberadamente cruzados. */
    const rows: Array<Pick<FinancialTransaction, "id" | "date" | "description" | "amount">> = [
        { id: "b", date: "2026-05-10T10:00:00Z", description: "Bravo", amount: 300 },
        { id: "a", date: "2026-05-20T10:00:00Z", description: "Alfa", amount: 100 },
        { id: "c", date: "2026-05-15T10:00:00Z", description: "Charlie", amount: 200 },
    ];

    beforeEach(async () => {
        repository = new InMemoryFinancialTransactionRepository();
        for (const row of rows) {
            await repository.create({
                ...row,
                ownerUserId: mockUserId,
                currency: "USD",
                type: "EXPENSE",
                status: "CONFIRMED",
                categoryId: null,
                institutionId: null,
                merchant: null,
                notes: null,
                possibleDuplicate: false,
                isDeleted: false,
                tags: [],
                createdAt: row.date,
                updatedAt: row.date,
            } as FinancialTransaction);
        }
    });

    async function idsSortedBy(sort?: TransactionSort) {
        const result = await repository.findPaginated(mockUserId, {}, { page: 1, pageSize: 10 }, sort);
        return result.data.map((t) => t.id);
    }

    it("ordena por fecha descendente cuando no se pide nada", async () => {
        expect(await idsSortedBy()).toEqual(["a", "c", "b"]);
    });

    it("ordena por fecha ascendente", async () => {
        expect(await idsSortedBy({ field: "date", direction: "asc" })).toEqual(["b", "c", "a"]);
    });

    it("ordena por importe en las dos direcciones", async () => {
        expect(await idsSortedBy({ field: "amount", direction: "asc" })).toEqual(["a", "c", "b"]);
        expect(await idsSortedBy({ field: "amount", direction: "desc" })).toEqual(["b", "c", "a"]);
    });

    it("ordena por descripción alfabéticamente", async () => {
        expect(await idsSortedBy({ field: "description", direction: "asc" })).toEqual(["a", "b", "c"]);
    });
});

describe("normalizeTransactionSort", () => {
    it("acepta los tres campos ordenables", () => {
        expect(normalizeTransactionSort("amount", "asc")).toEqual({ field: "amount", direction: "asc" });
        expect(normalizeTransactionSort("description", "desc")).toEqual({ field: "description", direction: "desc" });
        expect(normalizeTransactionSort("date", "asc")).toEqual({ field: "date", direction: "asc" });
    });

    it("rechaza cualquier otro campo en vez de pasarlo a la consulta", () => {
        // El valor llega de la URL y termina en un `.order()`, que construye SQL:
        // la lista blanca es la frontera, no una comodidad.
        expect(normalizeTransactionSort("owner_user_id", "asc")).toBeUndefined();
        expect(normalizeTransactionSort("date; drop table", "asc")).toBeUndefined();
        expect(normalizeTransactionSort("categoryId", "asc")).toBeUndefined();
    });

    it("cae a descendente cuando la dirección no es válida", () => {
        expect(normalizeTransactionSort("amount", "sideways")).toEqual({ field: "amount", direction: "desc" });
        expect(normalizeTransactionSort("amount", undefined)).toEqual({ field: "amount", direction: "desc" });
    });

    it("no devuelve orden cuando no se pidió campo", () => {
        expect(normalizeTransactionSort(undefined, "asc")).toBeUndefined();
    });
});
