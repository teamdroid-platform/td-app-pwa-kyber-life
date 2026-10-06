import { getTypeVisualConfig, getCategoryVisualConfig } from "@/presentation/financial/lib/scan-display";

describe("color de la tarjeta de un escaneo", () => {
    it("toma el color del tipo, el mismo del icono", () => {
        expect(getTypeVisualConfig("EXPENSE").cardClass).toMatch(/rose/);
        expect(getTypeVisualConfig("INCOME").cardClass).toMatch(/emerald/);
        expect(getTypeVisualConfig("TRANSFER").cardClass).toMatch(/yellow/);
        expect(getTypeVisualConfig("WITHDRAWAL").cardClass).toMatch(/indigo/);
    });

    it("dos gastos de categorías distintas tiñen igual la tarjeta", () => {
        const comida = getCategoryVisualConfig("Alimentación", "EXPENSE");
        const transporte = getCategoryVisualConfig("Transporte", "EXPENSE");
        expect(comida.cardClass).not.toBe(transporte.cardClass);
        expect(getTypeVisualConfig("EXPENSE").cardClass).toBe(getTypeVisualConfig("expense").cardClass);
    });

    it("un tipo desconocido cae en el neutro", () => {
        expect(getTypeVisualConfig("RARO").cardClass).toMatch(/zinc/);
        expect(getTypeVisualConfig(null).cardClass).toMatch(/zinc/);
    });
});
