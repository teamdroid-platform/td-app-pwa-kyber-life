jest.mock("@/infrastructure/supabase/auth-user", () => ({
    requireUserId: jest.fn().mockResolvedValue("user-1"),
}));

jest.mock("@/infrastructure/container", () => ({
    balanceService: { getBalanceSet: jest.fn() },
    balanceSettingsRepository: {
        setDefaultMode: jest.fn(),
        setRule: jest.fn(),
        clearRulesForTargets: jest.fn(),
        clearRules: jest.fn(),
        getRules: jest.fn(),
        getSettings: jest.fn(),
    },
}));

import { balanceService, balanceSettingsRepository } from "@/infrastructure/container";
import {
    getBalanceSetAction, setBalanceDefaultModeAction, setBalanceScopeRuleAction,
} from "@/app/actions/balance";

describe("balance actions", () => {
    beforeEach(() => jest.clearAllMocks());

    it("devuelve el conjunto de balances", async () => {
        (balanceService.getBalanceSet as jest.Mock).mockResolvedValue({ defaultMode: "PERIOD" });

        const result = await getBalanceSetAction();

        expect(result).toEqual({ success: true, data: { defaultMode: "PERIOD" } });
    });

    it("no lanza al cliente cuando el servicio falla", async () => {
        (balanceService.getBalanceSet as jest.Mock).mockRejectedValue(new Error("boom"));

        const result = await getBalanceSetAction();

        expect(result.success).toBe(false);
        expect(result).toHaveProperty("error", "boom");
    });

    it("rechaza un modo inválido", async () => {
        const result = await setBalanceDefaultModeAction("NOPE");

        expect(result.success).toBe(false);
        expect(balanceSettingsRepository.setDefaultMode).not.toHaveBeenCalled();
    });

    it("guarda el modo por defecto válido", async () => {
        (balanceSettingsRepository.setDefaultMode as jest.Mock).mockResolvedValue({
            ownerUserId: "user-1", defaultMode: "TOTAL",
        });

        const result = await setBalanceDefaultModeAction("TOTAL");

        expect(result.success).toBe(true);
        expect(balanceSettingsRepository.setDefaultMode).toHaveBeenCalledWith("user-1", "TOTAL");
    });

    it("al guardar la regla de un banco limpia las excepciones de dentro", async () => {
        (balanceSettingsRepository.setRule as jest.Mock).mockResolvedValue({});

        await setBalanceScopeRuleAction({
            targetType: "INSTITUTION",
            targetId: "11111111-1111-4111-8111-111111111111",
            included: false,
            clearTargetIds: ["22222222-2222-4222-8222-222222222222"],
        });

        expect(balanceSettingsRepository.clearRulesForTargets).toHaveBeenCalledWith(
            "user-1", ["22222222-2222-4222-8222-222222222222"],
        );
    });
});
