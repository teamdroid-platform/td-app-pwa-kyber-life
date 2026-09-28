import { shortDate } from "@/presentation/bank/lib/format-money";

// La suite corre fijada a America/Guayaquil (UTC−5, jest.global-setup.js):
// justo la zona en la que la medianoche de un día cae en la noche anterior.
describe("shortDate", () => {
    it("un corte guardado a medianoche en hora de pared es de ese día, no del anterior", () => {
        // «al 25» salía «al 24» al formatearlo en la zona del dispositivo.
        expect(shortDate("2026-09-25T00:00:00.000Z")).toMatch(/^25 /);
    });

    it("una fecha sin hora, como un vencimiento, tampoco se corre un día", () => {
        expect(shortDate("2026-09-28")).toMatch(/^28 /);
    });

    it("la hora de pared de la noche sigue siendo de ese día", () => {
        expect(shortDate("2026-09-25T22:59:00.000Z")).toMatch(/^25 /);
    });
});
