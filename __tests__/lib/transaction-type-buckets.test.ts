import { sortSettingsItems } from "@/presentation/financial/lib/transaction-type-buckets";
import type { TransactionTypeCounts } from "@/application/services/financial-settings-service";

type Item = { id: string; name: string };

const items: Item[] = [
    { id: "a", name: "Banco" },
    { id: "b", name: "Uber" },
    { id: "c", name: "amazon" },
];

const stats: Record<string, TransactionTypeCounts> = {
    a: { income: 0, expense: 2, transfer: 0, withdrawal: 0, total: 2 },
    b: { income: 5, expense: 0, transfer: 0, withdrawal: 0, total: 5 },
    c: { income: 0, expense: 1, transfer: 0, withdrawal: 0, total: 1 },
};

const names = (arr: Item[]) => arr.map((i) => i.name);

describe("sortSettingsItems", () => {
    it("sorts by name, case-insensitive, both directions", () => {
        expect(names(sortSettingsItems(items, "name", stats, "asc"))).toEqual(["amazon", "Banco", "Uber"]);
        expect(names(sortSettingsItems(items, "name", stats, "desc"))).toEqual(["Uber", "Banco", "amazon"]);
    });

    it("sorts by total count ascending and descending", () => {
        expect(names(sortSettingsItems(items, "count", stats, "asc"))).toEqual(["amazon", "Banco", "Uber"]); // 1,2,5
        expect(names(sortSettingsItems(items, "count", stats, "desc"))).toEqual(["Uber", "Banco", "amazon"]); // 5,2,1
    });

    it("sorts by dominant type bucket (income group first when asc)", () => {
        // b → income (rank 0); a,c → expense (rank 1), tie broken by count asc (c=1, a=2).
        expect(names(sortSettingsItems(items, "type", stats, "asc"))).toEqual(["Uber", "amazon", "Banco"]);
        expect(names(sortSettingsItems(items, "type", stats, "desc"))).toEqual(["Banco", "amazon", "Uber"]);
    });

    it("falls back to name order while stats are still loading", () => {
        expect(names(sortSettingsItems(items, "count", null, "asc"))).toEqual(["amazon", "Banco", "Uber"]);
    });
});
