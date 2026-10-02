import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { computeRunningBalances } from "@/domain/services/financial-balance";
import type { FinancialTransaction } from "@/domain/entities/financial";

const USER = "u1";

function tx(id: string, amount: number, createdAt: string): FinancialTransaction {
    return {
        id, ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED", amount, currency: "USD",
        description: id, merchant: null, notes: null, possibleDuplicate: false, isDeleted: false,
        tags: [], date: "2026-09-25T17:00:00.000Z", createdAt, updatedAt: createdAt,
        paidWithCredit: false,
    } as FinancialTransaction;
}

// El caso real: dos pagos de tarjeta a la misma hora. La lista los mostraba
// en un orden y el saldo corriente los acumulaba en el otro, así que leyendo
// la columna de saldos de abajo arriba subía, bajaba y la transferencia de al
// lado parecía restar dinero que no tocó.
describe("dos movimientos a la misma hora", () => {
    it("la lista los ordena al revés del saldo: el último registrado arriba", async () => {
        const repo = new InMemoryFinancialTransactionRepository();
        await repo.create(tx("visa", 1405.99, "2026-09-28T19:23:20.000Z"));
        await repo.create(tx("mastercard", 319.5, "2026-09-28T19:24:49.000Z"));

        const page = await repo.findPaginated(USER, {}, { page: 1, pageSize: 20 });
        const listed = page.data.map(t => t.id);

        expect(listed).toEqual(["mastercard", "visa"]);
    });

    it("leída de abajo arriba, la columna de saldos baja en cada gasto", async () => {
        const repo = new InMemoryFinancialTransactionRepository();
        await repo.create(tx("visa", 1405.99, "2026-09-28T19:23:20.000Z"));
        await repo.create(tx("mastercard", 319.5, "2026-09-28T19:24:49.000Z"));

        const page = await repo.findPaginated(USER, {}, { page: 1, pageSize: 20 });
        const running = computeRunningBalances(page.data);
        // De la fila de abajo (la más vieja) a la de arriba.
        const column = [...page.data].reverse().map(t => running[t.id!].balance);

        expect(column).toEqual([-1405.99, -1725.49]);
    });
});
