import { computeTotalBalance } from "@/domain/services/balance-modes";

describe("computeTotalBalance", () => {
    const base = {
        status: "ACTIVE" as const,
        isUnconfirmed: false,
        isDeleted: false,
        hasSnapshot: true,
    };

    it("suma los saldos de las cuentas contables", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Pichincha Ahorros", balance: 1200.5 },
            { ...base, id: "b", name: "Austro Corriente", balance: 300.25 },
        ]);

        expect(result.value).toBe(1500.75);
        expect(result.accountsCounted).toBe(2);
        expect(result.accountsWithoutSnapshot).toEqual([]);
    });

    it("incluye la cuenta de efectivo", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Pichincha Ahorros", balance: 1000 },
            { ...base, id: "cash", name: "Efectivo", balance: 60 },
        ]);

        expect(result.value).toBe(1060);
    });

    it("deja fuera las cuentas sin saldo declarado y las reporta", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Pichincha Ahorros", balance: 1000 },
            { ...base, id: "b", name: "Austro Corriente", balance: -450, hasSnapshot: false },
        ]);

        expect(result.value).toBe(1000);
        expect(result.accountsCounted).toBe(1);
        expect(result.accountsWithoutSnapshot).toEqual([{ id: "b", name: "Austro Corriente" }]);
    });

    it("deja fuera las cerradas, las borradas y las sin confirmar", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Contable", balance: 1000 },
            { ...base, id: "b", name: "Cerrada", balance: 500, status: "CLOSED" },
            { ...base, id: "c", name: "Borrada", balance: 500, isDeleted: true },
            { ...base, id: "d", name: "Sin confirmar", balance: 500, isUnconfirmed: true },
        ]);

        expect(result.value).toBe(1000);
        expect(result.accountsCounted).toBe(1);
    });

    it("una cuenta sin snapshot que además está cerrada no se reporta como pendiente", () => {
        const result = computeTotalBalance([
            { ...base, id: "b", name: "Cerrada", balance: 0, status: "CLOSED", hasSnapshot: false },
        ]);

        expect(result.accountsWithoutSnapshot).toEqual([]);
    });

    it("con cero cuentas devuelve cero, no NaN", () => {
        const result = computeTotalBalance([]);

        expect(result.value).toBe(0);
        expect(result.accountsCounted).toBe(0);
    });
});
