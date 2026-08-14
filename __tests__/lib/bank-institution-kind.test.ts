import {
    ISSUER_NAME,
    INSTITUTION_KINDS,
    inferInstitutionKind,
    institutionKindLabel,
    looksLikeIssuer,
} from "@/lib/bank-institution-kind";

describe("looksLikeIssuer", () => {
    it.each([
        "Banco del Austro",
        "BANCO PICHINCHA",
        "Coop Jardín Azuayo",
        "COAC JEP",
        "Mutualista Pichincha",
        "Billetera Deuna",
        "PACIFICARD",
    ])("reconoce a %s como emisor", name => {
        expect(looksLikeIssuer(name)).toBe(true);
    });

    it.each(["FARMASHOP", "Supermaxi", "UBER TRIP", "Netflix", ""])(
        "no toma %s por emisor",
        name => {
            expect(looksLikeIssuer(name)).toBe(false);
        },
    );

    it("no se deja engañar por espacios alrededor", () => {
        expect(looksLikeIssuer("   Banco Bolivariano  ")).toBe(true);
    });
});

describe("inferInstitutionKind", () => {
    it.each([
        ["Banco del Austro", "BANK"],
        ["BANCO PICHINCHA", "BANK"],
        // El nombre no lleva espacio ni límite de palabra alrededor de "banco".
        ["Bancolombia", "BANK"],
        ["Coop Jardín Azuayo", "COOPERATIVE"],
        ["COAC JEP", "COOPERATIVE"],
        ["Cooperativa Alianza del Valle", "COOPERATIVE"],
        ["Billetera Deuna", "WALLET"],
        ["Wallet XYZ", "WALLET"],
    ])("clasifica %s como %s", (name, expected) => {
        expect(inferInstitutionKind(name)).toBe(expected);
    });

    it.each([
        // Un producto de tarjeta, no una institución.
        "PACIFICARD",
        // No encaja limpio en ninguna categoría: que lo diga el usuario.
        "Mutualista Pichincha",
        "FARMASHOP",
    ])("deja %s genérico en vez de adivinar", name => {
        expect(inferInstitutionKind(name)).toBe("OTHER");
    });

    it("nunca infiere un tipo para algo que no fundaría institución", () => {
        // Todo lo que infiere un tipo concreto tiene que pasar el portero:
        // inferir BANK sobre un nombre que jamás se crea sería letra muerta.
        for (const name of ["Banco X", "Coop Y", "Billetera Z"]) {
            expect(ISSUER_NAME.test(name)).toBe(true);
        }
    });
});

describe("etiquetas", () => {
    it("ofrece las cuatro clases, con la genérica de última", () => {
        expect(INSTITUTION_KINDS.map(k => k.value)).toEqual([
            "BANK", "COOPERATIVE", "WALLET", "OTHER",
        ]);
    });

    it("traduce cada clase", () => {
        expect(institutionKindLabel("BANK")).toBe("Banco");
        expect(institutionKindLabel("COOPERATIVE")).toBe("Cooperativa");
        expect(institutionKindLabel("WALLET")).toBe("Billetera digital");
        expect(institutionKindLabel("OTHER")).toBe("Otro");
    });
});
