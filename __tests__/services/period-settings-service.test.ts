import { PeriodSettingsService } from "@/application/services/period-settings-service";
import { InMemoryPeriodSettingsRepository } from "@/infrastructure/repositories/implementations";

function makeService() {
    const repository = new InMemoryPeriodSettingsRepository();
    return { repository, service: new PeriodSettingsService(repository) };
}

describe("PeriodSettingsService.getCycleStartDay", () => {
    it("sin fila, Finanzas usa el 22", async () => {
        const { service } = makeService();
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(22);
    });

    it("sin fila, Compras usa el 1", async () => {
        const { service } = makeService();
        expect(await service.getCycleStartDay("user-1", "MARKET")).toBe(1);
    });

    it("con fila, devuelve el día guardado", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "FINANCIAL", 5);
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(5);
    });

    it("configurar un ámbito no cambia el defecto del otro", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "FINANCIAL", 5);
        expect(await service.getCycleStartDay("user-1", "MARKET")).toBe(1);
    });
});

describe("PeriodSettingsService.getAllCycleStartDays", () => {
    it("devuelve los dos ámbitos, rellenando con el defecto el que falte", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "MARKET", 15);

        expect(await service.getAllCycleStartDays("user-1")).toEqual({
            FINANCIAL: 22,
            MARKET: 15,
        });
    });
});

describe("PeriodSettingsService.setCycleStartDay", () => {
    it("rechaza un día fuera de rango sin escribir nada", async () => {
        const { repository, service } = makeService();

        await expect(service.setCycleStartDay("user-1", "FINANCIAL", 32)).rejects.toThrow();
        expect(await repository.findByOwner("user-1", "FINANCIAL")).toBeNull();
    });

    it("rechaza un día no entero", async () => {
        const { service } = makeService();
        await expect(service.setCycleStartDay("user-1", "FINANCIAL", 22.5)).rejects.toThrow();
    });

    it("acepta los extremos 1 y 31", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "FINANCIAL", 1);
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(1);

        await service.setCycleStartDay("user-1", "FINANCIAL", 31);
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(31);
    });
});
