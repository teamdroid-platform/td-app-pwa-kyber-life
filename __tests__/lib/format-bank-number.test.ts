import {
    formatBankNumber, formatIdentityNumber, identityNumberFromDisplay, isRedundantSample,
    IDENTITY_NUMBER_LENGTH,
} from "@/lib/format-bank-number";

describe("formatBankNumber", () => {
    it("cuenta y tarjeta usan la misma máscara: el tipo lo dice el acrónimo", () => {
        // El punto contra la equis distinguía cuenta de tarjeta cuando no había
        // nada más. Desde que cada fila lleva su acrónimo —AHO, TCR— eran dos
        // formas de escribir lo mismo, y el parámetro que las separaba sobraba.
        expect(formatBankNumber({ lastFour: "2780" })).toBe("XXXX2780");
        expect(formatBankNumber({ lastFour: "0814" })).toBe("XXXX0814");
    });

    it("conserva prefijo y sufijo tal como se guardaron", () => {
        // Es lo que alimenta el campo editable: perder el prefijo aquí lo
        // borraría de la base al guardar.
        expect(formatBankNumber({ prefixDigits: "493176", lastFour: "2780" }))
            .toBe("493176XXXX2780");
        expect(formatBankNumber({ prefixDigits: "22", lastFour: "58" }))
            .toBe("22XXXX58");
    });

    it("sin ningún dígito devuelve cadena vacía", () => {
        expect(formatBankNumber({})).toBe("");
        expect(formatBankNumber({ lastFour: null, prefixDigits: null })).toBe("");
    });

    it("solo prefijo, sin sufijo", () => {
        expect(formatBankNumber({ prefixDigits: "10" })).toBe("10XXXX");
    });
});

describe("formatIdentityNumber", () => {
    it("todos miden lo mismo", () => {
        const cases = [
            { lastFour: "0814" },
            { lastFour: "111" },
            { lastFour: "10" },
            { prefixDigits: "25", lastFour: "10" },
            { prefixDigits: "493176", lastFour: "2780" },
        ];
        for (const parts of cases) {
            expect(formatIdentityNumber(parts)).toHaveLength(IDENTITY_NUMBER_LENGTH);
        }
    });

    it("estira la máscara en vez de inventar dígitos", () => {
        // `25••••10` conoce dos dígitos finales. Rellenar hasta cuatro daría
        // «0010», un número que el banco nunca escribió.
        expect(formatIdentityNumber({ lastFour: "0814" })).toBe("XXXX0814");
        expect(formatIdentityNumber({ lastFour: "111" })).toBe("XXXXX111");
        expect(formatIdentityNumber({ lastFour: "10" })).toBe("XXXXXX10");
    });

    it("muestra el prefijo cuando cabe en el largo fijo", () => {
        expect(formatIdentityNumber({ prefixDigits: "25", lastFour: "10" })).toBe("25XXXX10");
        expect(formatIdentityNumber({ prefixDigits: "10", lastFour: "11" })).toBe("10XXXX11");
    });

    it("sacrifica el prefijo largo antes que el largo fijo o el sufijo", () => {
        // Con seis de prefijo y cuatro de sufijo no queda sitio para la máscara;
        // el final identifica y el principio no, así que cede el principio.
        expect(formatIdentityNumber({ prefixDigits: "493176", lastFour: "2780" })).toBe("XXXX2780");
        // Aunque el sufijo sea corto: prefijo 6 + sufijo 2 dejaría cero equis, y
        // sin máscara el número parecería completo.
        expect(formatIdentityNumber({ prefixDigits: "493176", lastFour: "10" })).toBe("XXXXXX10");
    });

    it("siempre deja al menos una equis: sin máscara parecería un número entero", () => {
        expect(formatIdentityNumber({ prefixDigits: "123", lastFour: "4567" })).toBe("123X4567");
        expect(formatIdentityNumber({ prefixDigits: "1234", lastFour: "5678" })).toBe("XXXX5678");
    });

    it("sin dígitos no dibuja un número que no existe", () => {
        expect(formatIdentityNumber({})).toBe("");
        expect(formatIdentityNumber({ lastFour: null, prefixDigits: null })).toBe("");
    });

    it("un prefijo suelto no se muestra: identifica al emisor, no a la cuenta", () => {
        // Puesto en una lista donde todas las demás terminan en dígitos
        // comparables, invitaría a compararlo con ellas.
        expect(formatIdentityNumber({ prefixDigits: "493176" })).toBe("");
        expect(formatIdentityNumber({ prefixDigits: "25", lastFour: null })).toBe("");
    });
});

describe("isRedundantSample", () => {
    it("la misma cifra con otra máscara no aporta nada", () => {
        expect(isRedundantSample("XXXXXXXX7903", "XXXX7903")).toBe(true);
        expect(isRedundantSample("XXXXXX4058", "XXXX4058")).toBe(true);
        expect(isRedundantSample("******8973", "XXXX8973")).toBe(true);
        expect(isRedundantSample("25••••10", "25XXXX10")).toBe(true);
    });

    it("una cadena con más dígitos sí aporta", () => {
        // El normalizado sacrifica el prefijo largo; el crudo lo conserva.
        expect(isRedundantSample("4043615213", "XXXX5213")).toBe(false);
        expect(isRedundantSample("493176XXXX2780", "XXXX2780")).toBe(false);
    });
});

describe("identityNumberFromDisplay", () => {
    it("normaliza lo que leyó un escaneo al mismo formato", () => {
        expect(identityNumberFromDisplay("493176XXXX2780")).toBe("XXXX2780");
        expect(identityNumberFromDisplay("25••••10")).toBe("25XXXX10");
        expect(identityNumberFromDisplay("XXXX8361")).toBe("XXXX8361");
    });

    it("una cadena sin máscara se lee como sufijo", () => {
        expect(identityNumberFromDisplay("8361")).toBe("XXXX8361");
    });

    it("lo que no tiene un solo dígito se devuelve tal cual", () => {
        expect(identityNumberFromDisplay("sin número")).toBe("sin número");
    });
});
