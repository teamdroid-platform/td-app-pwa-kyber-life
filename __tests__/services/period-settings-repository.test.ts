import { InMemoryPeriodSettingsRepository } from "@/infrastructure/repositories/implementations";

describe("InMemoryPeriodSettingsRepository", () => {
    it("devuelve null para un ámbito sin configurar", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        expect(await repo.findByOwner("user-1", "FINANCIAL")).toBeNull();
    });

    it("guarda y recupera el día de un ámbito", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);

        expect(await repo.findByOwner("user-1", "FINANCIAL")).toEqual({
            ownerUserId: "user-1",
            scope: "FINANCIAL",
            cycleStartDay: 5,
        });
    });

    it("sobrescribe el día del mismo ámbito en vez de duplicarlo", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);
        await repo.upsert("user-1", "FINANCIAL", 15);

        expect(await repo.findByOwner("user-1", "FINANCIAL")).toEqual({
            ownerUserId: "user-1",
            scope: "FINANCIAL",
            cycleStartDay: 15,
        });
        expect(await repo.findAllByOwner("user-1")).toHaveLength(1);
    });

    it("no mezcla ámbitos del mismo usuario", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);

        expect(await repo.findByOwner("user-1", "MARKET")).toBeNull();
    });

    it("no mezcla usuarios", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);

        expect(await repo.findByOwner("user-2", "FINANCIAL")).toBeNull();
        expect(await repo.findAllByOwner("user-2")).toEqual([]);
    });
});
