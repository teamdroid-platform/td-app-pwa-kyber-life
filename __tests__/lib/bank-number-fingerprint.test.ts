import { parseBankNumber } from "@/lib/bank-number-fingerprint";

describe("parseBankNumber — máscara al final", () => {
    it("máscara de equis con 4 finales", () => {
        expect(parseBankNumber("XXXXXX0814")).toMatchObject({
            prefixDigits: "", suffixDigits: "0814", totalLength: 10,
            bin: null, brand: null, isComplete: false,
        });
    });

    it("asteriscos y equis producen la misma huella", () => {
        const a = parseBankNumber("XXXXXX0814");
        const b = parseBankNumber("******0814");
        expect(b.suffixDigits).toBe(a.suffixDigits);
        expect(b.prefixDigits).toBe(a.prefixDigits);
    });

    it("bullets con espacios", () => {
        expect(parseBankNumber("•••• •••• •••• 1860")).toMatchObject({
            prefixDigits: "", suffixDigits: "1860", totalLength: 16,
        });
    });
});

describe("parseBankNumber — BIN y marca", () => {
    it("extrae el BIN de una tarjeta", () => {
        expect(parseBankNumber("493176XXXXXX2780")).toMatchObject({
            prefixDigits: "493176", suffixDigits: "2780",
            bin: "493176", totalLength: 16,
        });
    });

    it("la marca sale del texto, no de los dígitos", () => {
        expect(parseBankNumber("Visa ••••9620")).toMatchObject({
            brand: "Visa", suffixDigits: "9620", prefixDigits: "",
        });
    });

    it("los guiones dentro de la máscara no cambian nada", () => {
        expect(parseBankNumber("5422-58XX-XXXX-X361")).toMatchObject({
            prefixDigits: "542258", suffixDigits: "361", bin: "542258",
        });
    });

    it("marca e institución embebidas a la vez", () => {
        expect(parseBankNumber("MASTERCARD Banco del Austro 548244XXXXXX8001")).toMatchObject({
            brand: "Mastercard", institutionHint: "Banco del Austro",
            prefixDigits: "548244", suffixDigits: "8001", bin: "548244",
        });
    });

    it("institución embebida sin marca", () => {
        expect(parseBankNumber("Coop. Jardín Azuayo ***5010")).toMatchObject({
            institutionHint: "Coop. Jardín Azuayo", suffixDigits: "5010", brand: null,
        });
    });

    it("una marca sin dígitos no afirma ningún número", () => {
        expect(parseBankNumber("MASTERCARD")).toMatchObject({
            brand: "Mastercard", prefixDigits: "", suffixDigits: "", isComplete: false,
        });
    });
});

describe("parseBankNumber — máscara que conserva el prefijo", () => {
    it("prefijo y sufijo van a campos separados", () => {
        expect(parseBankNumber("22XXXXXX58")).toMatchObject({
            prefixDigits: "22", suffixDigits: "58", totalLength: 10, bin: null,
        });
    });

    it("NUNCA fabrica el número pegando prefijo y sufijo", () => {
        const f = parseBankNumber("25XXX10");
        expect(f.prefixDigits).toBe("25");
        expect(f.suffixDigits).toBe("10");
        // 2510 no existe: es la trampa que este parser está para evitar.
        expect(f.suffixDigits).not.toBe("2510");
        expect(f.isComplete).toBe(false);
    });

    it("un prefijo de 6 sí es un BIN, uno de 2 no", () => {
        expect(parseBankNumber("22XXXXXX58").bin).toBeNull();
        expect(parseBankNumber("542258XXXXXXX361").bin).toBe("542258");
    });
});

describe("parseBankNumber — sin máscara", () => {
    it("un número largo sin máscara es completo", () => {
        expect(parseBankNumber("4043615213")).toMatchObject({
            isComplete: true, prefixDigits: "404361", suffixDigits: "5213", totalLength: 10,
        });
    });

    it("otro completo, el que resuelve la ambigüedad de 22XXXXXX58", () => {
        expect(parseBankNumber("2204339558")).toMatchObject({
            isComplete: true, prefixDigits: "220433", suffixDigits: "9558", totalLength: 10,
        });
    });

    it("cuatro dígitos sueltos son un sufijo, no un número completo", () => {
        expect(parseBankNumber("Mastercard 8361")).toMatchObject({
            isComplete: false, prefixDigits: "", suffixDigits: "8361", brand: "Mastercard",
        });
    });

    it("tres dígitos sueltos también", () => {
        expect(parseBankNumber("620")).toMatchObject({
            isComplete: false, prefixDigits: "", suffixDigits: "620",
        });
    });
});

describe("parseBankNumber — tipo de cuenta embebido", () => {
    it("AHO se guarda como hint, no como parte del número", () => {
        expect(parseBankNumber("AHO - XXXXXX0814")).toMatchObject({
            accountTypeHint: "SAVINGS", suffixDigits: "0814", prefixDigits: "",
        });
    });

    it("CTE también", () => {
        expect(parseBankNumber("CTE - XXXXXX9511").accountTypeHint).toBe("CHECKING");
    });
});

describe("parseBankNumber — robustez", () => {
    it("conserva la cadena cruda intacta", () => {
        const raw = "AHO - XXXXXX0814";
        expect(parseBankNumber(raw).raw).toBe(raw);
    });

    it("una cadena vacía no revienta", () => {
        expect(parseBankNumber("")).toMatchObject({
            prefixDigits: "", suffixDigits: "", isComplete: false,
        });
    });

    it("una máscara de equis no se confunde con el nombre de un banco", () => {
        // Las equis son letras: sin filtrarlas, el hint saldría "XXXXXX".
        expect(parseBankNumber("XXXXXX0814").institutionHint).toBeNull();
        expect(parseBankNumber("AHO - XXXXXX0814").institutionHint).toBeNull();
        expect(parseBankNumber("PACIFICARD TITULAR MASTERCARD 542258XXXXXXX361").institutionHint).toBeNull();
    });

    it("las 98 cadenas reales se parsean sin excepción", () => {
        for (const raw of REAL_STRINGS) {
            expect(() => parseBankNumber(raw)).not.toThrow();
        }
    });

    it("ninguna cadena real produce un sufijo mayor que sus dígitos visibles", () => {
        for (const raw of REAL_STRINGS) {
            const f = parseBankNumber(raw);
            const visibles = raw.replace(/[^0-9]/g, "");
            expect(visibles).toContain(f.suffixDigits);
        }
    });
});

/** Las 98 formas distintas que los bancos han usado en la base real. */
const REAL_STRINGS = [
    "493176XXXXXX2780", "620", "25XXX10", "******9558", "******1419",
    "******0814", "XXXXXX0814", "Visa ••••9620", "***5010", "************1860",
    "13XXXXXX14", "10XXXXXX11", "******620", "••••9620", "Mastercard-8361",
    "******9511", "25XXX61", "77XXXXXX19", "****9620", "22XXXXXX58",
    "542258XXXXXXX361", "MASTERCARD 542258XXXXXXX361", "XXXXXX1419", "XXXXXX1582",
    "XXXXXX9558", "****361", "22XXXXXX82", "AHO - XXXXXX0814", "XXXXXX5028",
    "******4734", "22XXXXXX99", "40XXXXXXXX00", "4043615213", "MASTERCARD",
    "XXXXXX4058", "******0091", "******0100", "******0736", "******3159",
    "******361", "******5286", "******5296", "******5324", "******7590",
    "******8729", "******8973", "******9160", "****620", "•••• •••• •••• 1860",
    "••••2780", "00XXXXXX23", "10XXX49", "2204339558", "25XXX47", "26XXX18",
    "26XXX40", "28XXX58", "78XXX36", "Coop. Jardín Azuayo ***5010",
    "MasterCard - 548244XXXXXX8001", "MASTERCARD •••• 8361",
    "PACIFICARD 542258XXXXXXX361", "PACIFICARD TITULAR MASTERCARD 542258XXXXXXX361",
    "TITULAR MASTERCARD 542258XXXXXXX361", "XXX5010", "XXXXXX6655", "XXXXXXX1608",
    "XXXXXXXX4204", "XXXXXXXX7903", "XXXXXXXXXXXX9620", "**** **** **** *620",
    "********361", "*******361", "******0450", "******1582", "******1860",
    "******2621", "******2780", "******3639", "******3700", "******8164",
    "******8361", "******9620", "******9968", "*****9558", "•••• 9620",
    "20XXX42", "22XXX81", "26XXX07", "5422-58XX-XXXX-X361", "542258XXXXXXXX361",
    "MASTERCARD 548244XXXXXX8001", "Mastercard 8361",
    "MASTERCARD Banco del Austro 548244XXXXXX8001",
    "PacifiCard TITULAR MASTERCARD 542258XXXXXXX361", "Visa ****9620", "Visa 9620",
    "XXXXXX9511",
] as const;
