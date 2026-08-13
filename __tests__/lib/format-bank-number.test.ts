import { formatBankNumber } from "@/lib/format-bank-number";

describe("formatBankNumber", () => {
    it("las tarjetas usan cuatro equis", () => {
        expect(formatBankNumber({ lastFour: "2780" }, "CARD")).toBe("XXXX2780");
    });

    it("las cuentas usan cuatro puntos", () => {
        expect(formatBankNumber({ lastFour: "0814" }, "ACCOUNT")).toBe("••••0814");
    });

    it("una cuenta con solo prefijo y sufijo muestra ambos", () => {
        expect(formatBankNumber({ prefixDigits: "22", lastFour: "58" }, "ACCOUNT"))
            .toBe("22••••58");
    });

    it("una tarjeta con solo prefijo y sufijo mantiene las equis", () => {
        expect(formatBankNumber({ prefixDigits: "54", lastFour: "361" }, "CARD"))
            .toBe("54XXXX361");
    });

    it("sin ningún dígito devuelve cadena vacía", () => {
        expect(formatBankNumber({}, "ACCOUNT")).toBe("");
    });

    it("trata null igual que ausente", () => {
        expect(formatBankNumber({ lastFour: null, prefixDigits: null }, "CARD")).toBe("");
    });

    it("solo prefijo, sin sufijo", () => {
        expect(formatBankNumber({ prefixDigits: "10" }, "ACCOUNT")).toBe("10••••");
    });

    it("el glifo distingue cuenta de tarjeta con los mismos dígitos", () => {
        const parts = { lastFour: "9620" };
        expect(formatBankNumber(parts, "ACCOUNT")).not.toBe(formatBankNumber(parts, "CARD"));
    });
});
