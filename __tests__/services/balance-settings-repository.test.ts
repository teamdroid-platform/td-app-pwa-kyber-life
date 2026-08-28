import { InMemoryBalanceSettingsRepository } from "@/infrastructure/repositories/implementations";

describe("InMemoryBalanceSettingsRepository", () => {
    const userId = "user-1";
    let repo: InMemoryBalanceSettingsRepository;

    beforeEach(() => {
        repo = new InMemoryBalanceSettingsRepository();
    });

    it("devuelve null mientras el usuario no configure nada", async () => {
        expect(await repo.getSettings(userId)).toBeNull();
        expect(await repo.getRules(userId)).toEqual([]);
    });

    it("guarda el modo por defecto", async () => {
        const saved = await repo.setDefaultMode(userId, "PERIOD_WITH_CREDIT");

        expect(saved.defaultMode).toBe("PERIOD_WITH_CREDIT");
        expect((await repo.getSettings(userId))?.defaultMode).toBe("PERIOD_WITH_CREDIT");
    });

    it("una segunda regla sobre el mismo objetivo la reemplaza", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);
        await repo.setRule(userId, "ACCOUNT", "acc-1", true);

        const rules = await repo.getRules(userId);
        expect(rules).toHaveLength(1);
        expect(rules[0].included).toBe(true);
    });

    it("distingue objetivos del mismo id pero distinto tipo", async () => {
        await repo.setRule(userId, "ACCOUNT", "same-id", false);
        await repo.setRule(userId, "CARD", "same-id", true);

        expect(await repo.getRules(userId)).toHaveLength(2);
    });

    it("borra la regla de un objetivo suelto", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);
        await repo.clearRulesForTargets(userId, ["acc-1"]);

        expect(await repo.getRules(userId)).toEqual([]);
    });

    it("limpia las reglas de una lista de objetivos", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);
        await repo.setRule(userId, "CARD", "card-1", false);
        await repo.setRule(userId, "ACCOUNT", "acc-otro-banco", false);

        await repo.clearRulesForTargets(userId, ["acc-1", "card-1"]);

        const rules = await repo.getRules(userId);
        expect(rules.map(r => r.targetId)).toEqual(["acc-otro-banco"]);
    });

    it("no mezcla usuarios", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);

        expect(await repo.getRules("otro-user")).toEqual([]);
    });
});
