import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { FinancialTransaction } from "@/domain/entities/financial";

/**
 * The dashboards moved their range/status narrowing from an in-memory filter to
 * the repository (SQL). These lock the *semantics* of that move: the boundaries
 * must stay inclusive and the status set unchanged, so switching where the
 * filtering happens can't silently shift which transactions are counted.
 *
 * Old in-memory rule:  reject if `tDate < startDate` or `tDate > endDate`
 * New SQL rule:        keep if `date >= startDate` and `date <= endDate`
 * Both are inclusive on each end — that equivalence is what's asserted here.
 */

const USER = "user-1";
const START = new Date("2026-06-22T00:00:00.000Z");
const END = new Date("2026-07-21T23:59:59.999Z");

function tx(over: Partial<FinancialTransaction> & { id: string; date: string }): FinancialTransaction {
    return {
        ownerUserId: USER,
        type: "EXPENSE",
        status: "CONFIRMED",
        amount: 10,
        currency: "USD",
        description: "t",
        possibleDuplicate: false,
        isDeleted: false,
        ...over,
    } as FinancialTransaction;
}

/** The exact filter the dashboards used to apply in memory. */
function legacyFilterActive(transactions: FinancialTransaction[], startDate?: Date, endDate?: Date) {
    return transactions.filter((t) => {
        if (t.status !== "CONFIRMED" && t.status !== "REVIEWED" && t.status !== "MANUAL") return false;
        if (startDate || endDate) {
            const tDate = new Date(t.date);
            if (startDate && tDate < startDate) return false;
            if (endDate && tDate > endDate) return false;
        }
        return true;
    });
}

const ALL: FinancialTransaction[] = [
    tx({ id: "before", date: "2026-06-21T23:59:59.999Z" }),   // 1 ms before the start
    tx({ id: "start-edge", date: "2026-06-22T00:00:00.000Z" }), // exactly the start
    tx({ id: "inside", date: "2026-07-01T12:00:00.000Z" }),
    tx({ id: "end-edge", date: "2026-07-21T23:59:59.999Z" }),   // exactly the end
    tx({ id: "after", date: "2026-07-22T00:00:00.001Z" }),      // just past the end
    tx({ id: "rejected", date: "2026-07-01T12:00:00.000Z", status: "REJECTED" }),
    tx({ id: "detected", date: "2026-07-01T12:00:00.000Z", status: "DETECTED" }),
    tx({ id: "reviewed", date: "2026-07-02T12:00:00.000Z", status: "REVIEWED" }),
    tx({ id: "manual", date: "2026-07-03T12:00:00.000Z", status: "MANUAL" }),
];

async function repoWithAll() {
    const repo = new InMemoryFinancialTransactionRepository();
    for (const t of ALL) await repo.create(t);
    return repo;
}

const ids = (list: FinancialTransaction[]) => list.map((t) => t.id).sort();

describe("dashboard range/status narrowing", () => {
    it("keeps both range boundaries inclusive", async () => {
        const repo = await repoWithAll();
        const result = await repo.findForDashboard(USER, { startDate: START, endDate: END });

        expect(ids(result)).toEqual(ids(
            ALL.filter((t) => ["start-edge", "inside", "end-edge", "reviewed", "manual"].includes(t.id!)),
        ));
        // Explicitly: the edges are in, the neighbours are out.
        expect(result.some((t) => t.id === "start-edge")).toBe(true);
        expect(result.some((t) => t.id === "end-edge")).toBe(true);
        expect(result.some((t) => t.id === "before")).toBe(false);
        expect(result.some((t) => t.id === "after")).toBe(false);
    });

    it("counts exactly the same statuses as the old in-memory filter", async () => {
        const repo = await repoWithAll();
        const result = await repo.findForDashboard(USER, { startDate: START, endDate: END });

        expect(ids(result)).toEqual(ids(legacyFilterActive(ALL, START, END)));
        expect(result.some((t) => t.status === "REJECTED")).toBe(false);
        expect(result.some((t) => t.status === "DETECTED")).toBe(false);
    });

    it("returns every active transaction when there is no range (Todo el tiempo)", async () => {
        const repo = await repoWithAll();
        const result = await repo.findForDashboard(USER, {});

        expect(ids(result)).toEqual(ids(legacyFilterActive(ALL)));
        // Everything except the two non-active ones (REJECTED / DETECTED).
        expect(result).toHaveLength(ALL.length - 2);
    });

    it("matches the legacy filter for an open-ended range (only start, only end)", async () => {
        const repo = await repoWithAll();

        const onlyStart = await repo.findForDashboard(USER, { startDate: START });
        expect(ids(onlyStart)).toEqual(ids(legacyFilterActive(ALL, START, undefined)));

        const onlyEnd = await repo.findForDashboard(USER, { endDate: END });
        expect(ids(onlyEnd)).toEqual(ids(legacyFilterActive(ALL, undefined, END)));
    });
});
