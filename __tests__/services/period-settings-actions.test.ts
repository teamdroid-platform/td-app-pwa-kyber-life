const getCycleStartDay = jest.fn();
const getAllCycleStartDays = jest.fn();
const setCycleStartDay = jest.fn();
const requireUserId = jest.fn();

jest.mock("@/infrastructure/container", () => ({
    periodSettingsService: {
        getCycleStartDay: (...args: unknown[]) => getCycleStartDay(...args),
        getAllCycleStartDays: (...args: unknown[]) => getAllCycleStartDays(...args),
        setCycleStartDay: (...args: unknown[]) => setCycleStartDay(...args),
    },
}));

jest.mock("@/infrastructure/supabase/auth-user", () => ({
    requireUserId: () => requireUserId(),
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import {
    getCycleStartDayAction,
    getAllCycleStartDaysAction,
    setCycleStartDayAction,
} from "@/app/actions/period-settings";

beforeEach(() => {
    jest.clearAllMocks();
    requireUserId.mockResolvedValue("user-1");
});

describe("getCycleStartDayAction", () => {
    it("devuelve el día del ámbito pedido", async () => {
        getCycleStartDay.mockResolvedValue(22);

        expect(await getCycleStartDayAction("FINANCIAL")).toEqual({ success: true, data: 22 });
        expect(getCycleStartDay).toHaveBeenCalledWith("user-1", "FINANCIAL");
    });

    it("falla con un ámbito desconocido y no llega al servicio", async () => {
        const result = await getCycleStartDayAction("BANKS");

        expect(result.success).toBe(false);
        expect(getCycleStartDay).not.toHaveBeenCalled();
    });
});

describe("getAllCycleStartDaysAction", () => {
    it("devuelve los dos ámbitos", async () => {
        getAllCycleStartDays.mockResolvedValue({ FINANCIAL: 22, MARKET: 1 });

        expect(await getAllCycleStartDaysAction()).toEqual({
            success: true,
            data: { FINANCIAL: 22, MARKET: 1 },
        });
    });
});

describe("setCycleStartDayAction", () => {
    it("guarda un día válido", async () => {
        setCycleStartDay.mockResolvedValue({
            ownerUserId: "user-1", scope: "MARKET", cycleStartDay: 15,
        });

        const result = await setCycleStartDayAction({ scope: "MARKET", cycleStartDay: 15 });

        expect(result.success).toBe(true);
        expect(setCycleStartDay).toHaveBeenCalledWith("user-1", "MARKET", 15);
    });

    it("rechaza un día fuera de rango sin llamar al servicio", async () => {
        const result = await setCycleStartDayAction({ scope: "MARKET", cycleStartDay: 32 });

        expect(result.success).toBe(false);
        expect(setCycleStartDay).not.toHaveBeenCalled();
    });

    it("no lanza cuando el servicio revienta: devuelve el error", async () => {
        setCycleStartDay.mockRejectedValue(new Error("boom"));

        expect(await setCycleStartDayAction({ scope: "MARKET", cycleStartDay: 15 })).toEqual({
            success: false,
            error: "boom",
        });
    });
});
