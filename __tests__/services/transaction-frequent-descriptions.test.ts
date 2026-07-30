import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { FinancialTransaction } from "@/domain/entities/financial";

const OWNER = "user-1";

let nextId = 0;

function tx(overrides: Partial<FinancialTransaction>): FinancialTransaction {
    nextId += 1;
    return {
        id: `tx-${nextId}`,
        ownerUserId: OWNER,
        type: "EXPENSE",
        status: "CONFIRMED",
        amount: 10,
        currency: "USD",
        date: "2026-07-01T10:00:00.000Z",
        description: "Compra semanal",
        possibleDuplicate: false,
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z",
        isDeleted: false,
        ...overrides,
    } as FinancialTransaction;
}

async function seed(transactions: FinancialTransaction[]) {
    const repo = new InMemoryFinancialTransactionRepository();
    for (const t of transactions) await repo.create(t);
    return repo;
}

/**
 * The in-memory repository mirrors what the Supabase RPC does, so the ordering
 * rules are pinned here rather than only in SQL nobody runs in tests.
 */
describe("frequent descriptions", () => {
    it("orders by how often each description was used", async () => {
        const repo = await seed([
            tx({ description: "Almuerzo" }),
            tx({ description: "Compra semanal" }),
            tx({ description: "Compra semanal" }),
            tx({ description: "Compra semanal" }),
            tx({ description: "Gasolina" }),
            tx({ description: "Gasolina" }),
        ]);

        expect(await repo.getFrequentDescriptions(OWNER)).toEqual([
            "Compra semanal",
            "Gasolina",
            "Almuerzo",
        ]);
    });

    it("breaks ties with the most recent use", async () => {
        const repo = await seed([
            tx({ description: "Vieja", date: "2026-01-01T10:00:00.000Z" }),
            tx({ description: "Reciente", date: "2026-07-20T10:00:00.000Z" }),
        ]);

        expect(await repo.getFrequentDescriptions(OWNER)).toEqual(["Reciente", "Vieja"]);
    });

    it("only counts the requested type", async () => {
        const repo = await seed([
            tx({ description: "Sueldo", type: "INCOME" }),
            tx({ description: "Sueldo", type: "INCOME" }),
            tx({ description: "Compra semanal", type: "EXPENSE" }),
        ]);

        expect(await repo.getFrequentDescriptions(OWNER, "INCOME")).toEqual(["Sueldo"]);
        expect(await repo.getFrequentDescriptions(OWNER, "EXPENSE")).toEqual(["Compra semanal"]);
    });

    it("ignores discarded movements — they shouldn't shape today's suggestions", async () => {
        const repo = await seed([
            tx({ description: "Borrada", status: "DELETED" }),
            tx({ description: "Archivada", status: "ARCHIVED" }),
            tx({ description: "Rechazada", status: "REJECTED" }),
            tx({ description: "Vigente" }),
        ]);

        expect(await repo.getFrequentDescriptions(OWNER)).toEqual(["Vigente"]);
    });

    it("skips empty descriptions and caps the list", async () => {
        const repo = await seed([
            tx({ description: "   " }),
            ...["A", "B", "C", "D", "E", "F"].map((d) => tx({ description: d })),
        ]);

        const result = await repo.getFrequentDescriptions(OWNER, null, 5);
        expect(result).toHaveLength(5);
        expect(result).not.toContain("   ");
    });

    it("keeps each owner's descriptions to themselves", async () => {
        const repo = await seed([
            tx({ description: "Mía" }),
            tx({ description: "Ajena", ownerUserId: "user-2" }),
        ]);

        expect(await repo.getFrequentDescriptions(OWNER)).toEqual(["Mía"]);
    });
});
