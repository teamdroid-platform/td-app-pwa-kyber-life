import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { areCompatible, mergeFingerprints, resolveFingerprint } from "@/lib/bank-number-match";

const fp = parseBankNumber;

describe("areCompatible — sufijo contenido", () => {
    it("361 es sufijo de 8361", () => {
        expect(areCompatible(fp("Mastercard 8361"), fp("****361"))).toBe(true);
    });

    it("620 es sufijo de 9620", () => {
        expect(areCompatible(fp("Visa 9620"), fp("******620"))).toBe(true);
    });

    it("dos sufijos que no se contienen no son compatibles", () => {
        expect(areCompatible(fp("XXXXXX0814"), fp("XXXXXX9511"))).toBe(false);
    });
});

describe("areCompatible — guard de prefijo", () => {
    it("RECHAZA 25XXX61 contra la Mastercard 542258XXXXXXX361", () => {
        // 61 es sufijo de 361, pero el prefijo 25 choca con 542258.
        expect(areCompatible(fp("25XXX61"), fp("542258XXXXXXX361"))).toBe(false);
    });

    it("acepta cuando un prefijo está vacío", () => {
        expect(areCompatible(fp("13XXXXXX14"), fp("XXXXXX0814"))).toBe(true);
    });

    it("acepta cuando un prefijo es prefijo del otro", () => {
        // 2204339558 completo: prefijo 220433, del que 22 es prefijo.
        expect(areCompatible(fp("22XXXXXX58"), fp("2204339558"))).toBe(true);
    });
});

describe("areCompatible — BIN y marca", () => {
    it("dos BIN distintos nunca son la misma tarjeta", () => {
        expect(areCompatible(fp("493176XXXXXX2780"), fp("548244XXXXXX8001"))).toBe(false);
    });

    it("dos marcas distintas tampoco", () => {
        expect(areCompatible(fp("Visa ••••9620"), fp("Mastercard 9620"))).toBe(false);
    });

    it("una marca ausente no contradice a ninguna", () => {
        expect(areCompatible(fp("••••9620"), fp("Visa ••••9620"))).toBe(true);
    });
});

describe("areCompatible — sin dígitos", () => {
    it("una marca sin dígitos no empareja con nada", () => {
        expect(areCompatible(fp("MASTERCARD"), fp("Mastercard 8361"))).toBe(false);
    });
});

describe("mergeFingerprints", () => {
    it("acumula lo que cada observación aporta", () => {
        const merged = mergeFingerprints([fp("••••2780"), fp("493176XXXXXX2780")]);
        expect(merged).toMatchObject({
            suffixDigits: "2780", prefixDigits: "493176", bin: "493176",
        });
    });

    it("se queda con el sufijo más largo conocido", () => {
        const merged = mergeFingerprints([fp("****361"), fp("Mastercard 8361")]);
        expect(merged.suffixDigits).toBe("8361");
    });
});

describe("resolveFingerprint", () => {
    const cuenta0814 = { id: "a1", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX0814")]) };
    const cuenta9511 = { id: "a2", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX9511")]) };
    const tarjeta8361 = { id: "c1", kind: "CARD" as const, fingerprint: mergeFingerprints([fp("542258XXXXXXX361"), fp("Mastercard 8361")]) };

    it("sufijo de 4 y candidato único: EXACT", () => {
        const r = resolveFingerprint(fp("******0814"), [cuenta0814, cuenta9511]);
        expect(r).toMatchObject({ resolution: "EXACT", targetId: "a1" });
    });

    it("sufijo corto y candidato único: INFERRED", () => {
        const r = resolveFingerprint(fp("****361"), [tarjeta8361, cuenta0814]);
        expect(r).toMatchObject({ resolution: "INFERRED", targetId: "c1" });
    });

    it("varios candidatos: PENDING, sin elegir", () => {
        const cuenta4058 = { id: "a3", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX4058")]) };
        const cuenta9558 = { id: "a4", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX9558")]) };
        const r = resolveFingerprint(fp("28XXX58"), [cuenta4058, cuenta9558]);
        expect(r).toMatchObject({ resolution: "PENDING", targetId: null });
        expect(r.candidateIds).toEqual(expect.arrayContaining(["a3", "a4"]));
    });

    it("sin candidatos: PENDING", () => {
        const r = resolveFingerprint(fp("22XXXXXX99"), [cuenta0814]);
        expect(r).toMatchObject({ resolution: "PENDING", targetId: null, candidateIds: [] });
    });

    it("el guard de prefijo evita el falso positivo de 25XXX61", () => {
        const r = resolveFingerprint(fp("25XXX61"), [tarjeta8361]);
        expect(r.resolution).toBe("PENDING");
        expect(r.candidateIds).toEqual([]);
    });
});
