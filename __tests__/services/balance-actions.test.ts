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
    getBalanceSetAction, setBalanceDefaultModeAction, setBalanceScopeRuleAction, clearBalanceScopeAction,
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
        // `setBalanceScopeRuleAction` wraps everything in try/catch (never throw
        // to the client), so an `expect` thrown *inside* a mock implementation
        // would be swallowed there and never fail this test. Instead, record
        // what each mock observed into plain variables and assert on those
        // after the action has returned, outside any try/catch.
        let cleared = false;
        let clearedWhenSetRuleRan: boolean | undefined;
        (balanceSettingsRepository.clearRulesForTargets as jest.Mock).mockImplementation(async () => {
            // Yield once so a concurrent caller (e.g. a `Promise.all` regression)
            // would run its own body before this flips the flag.
            await Promise.resolve();
            cleared = true;
        });
        (balanceSettingsRepository.setRule as jest.Mock).mockImplementation(async () => {
            clearedWhenSetRuleRan = cleared;
            return {};
        });

        await setBalanceScopeRuleAction({
            targetType: "INSTITUTION",
            targetId: "11111111-1111-4111-8111-111111111111",
            included: false,
            clearTargetIds: ["22222222-2222-4222-8222-222222222222"],
        });

        expect(balanceSettingsRepository.clearRulesForTargets).toHaveBeenCalledWith(
            "user-1", ["22222222-2222-4222-8222-222222222222"],
        );
        expect(balanceSettingsRepository.setRule).toHaveBeenCalledWith(
            "user-1", "INSTITUTION", "11111111-1111-4111-8111-111111111111", false,
        );
        // Order matters: clearing exceptions before writing the bank's own rule
        // is what keeps a bank from dragging exceptions the settings UI no
        // longer shows. This pins clearRulesForTargets running before setRule.
        const clearOrder = (balanceSettingsRepository.clearRulesForTargets as jest.Mock).mock.invocationCallOrder[0];
        const setRuleOrder = (balanceSettingsRepository.setRule as jest.Mock).mock.invocationCallOrder[0];
        expect(clearOrder).toBeLessThan(setRuleOrder);
        // The call-order check above passes even under a same-order `Promise.all`
        // regression (invocation order is synchronous either way). This is the
        // assertion that actually catches that case: it fails unless
        // clearRulesForTargets had *resolved* by the time setRule ran.
        expect(clearedWhenSetRuleRan).toBe(true);
    });

    // Botón "Restablecer": destructivo (borra TODAS las excepciones del
    // usuario) y hasta ahora sin ninguna prueba.
    it("restablece el scope borrando todas las excepciones del usuario", async () => {
        (balanceSettingsRepository.clearRules as jest.Mock).mockResolvedValue(undefined);

        const result = await clearBalanceScopeAction();

        expect(result).toEqual({ success: true, data: null });
        expect(balanceSettingsRepository.clearRules).toHaveBeenCalledWith("user-1");
    });

    it("no lanza al cliente cuando clearRules falla", async () => {
        (balanceSettingsRepository.clearRules as jest.Mock).mockRejectedValue(new Error("boom"));

        const result = await clearBalanceScopeAction();

        expect(result.success).toBe(false);
        expect(result).toHaveProperty("error", "boom");
    });
});
