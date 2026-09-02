import { cycleStartDaySchema, setCycleStartDaySchema } from "@/lib/validators/period-schemas";

describe("cycleStartDaySchema", () => {
    it("acepta los extremos del rango", () => {
        expect(cycleStartDaySchema.parse(1)).toBe(1);
        expect(cycleStartDaySchema.parse(31)).toBe(31);
    });

    it("rechaza 0 y 32", () => {
        expect(() => cycleStartDaySchema.parse(0)).toThrow();
        expect(() => cycleStartDaySchema.parse(32)).toThrow();
    });

    it("rechaza no enteros", () => {
        expect(() => cycleStartDaySchema.parse(22.5)).toThrow();
    });
});

describe("setCycleStartDaySchema", () => {
    it("acepta un ámbito válido con su día", () => {
        expect(setCycleStartDaySchema.parse({ scope: "MARKET", cycleStartDay: 1 })).toEqual({
            scope: "MARKET",
            cycleStartDay: 1,
        });
    });

    it("rechaza un ámbito desconocido", () => {
        expect(() => setCycleStartDaySchema.parse({ scope: "BANKS", cycleStartDay: 1 })).toThrow();
    });
});
