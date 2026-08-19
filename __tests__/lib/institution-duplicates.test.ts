import { institutionFingerprint, findDuplicateInstitutions } from "@/lib/institution-duplicates";

describe("institutionFingerprint", () => {
    it("quita tildes, mayúsculas y puntuación", () => {
        expect(institutionFingerprint("Jardín Azuayo")).toBe("jardin azuayo");
        expect(institutionFingerprint("  JARDÍN,  AZUAYO  ")).toBe("jardin azuayo");
    });

    it("quita la forma jurídica del principio", () => {
        expect(institutionFingerprint("COAC Jardín Azuayo")).toBe("jardin azuayo");
        expect(institutionFingerprint("Coop Jardín Azuayo")).toBe("jardin azuayo");
        expect(institutionFingerprint("Cooperativa de Ahorro y Crédito Jardín Azuayo"))
            .toBe("jardin azuayo");
        expect(institutionFingerprint("Banco del Austro")).toBe("austro");
        expect(institutionFingerprint("Banco Pichincha")).toBe("pichincha");
    });

    it("no la quita del medio: eso uniría emisores distintos", () => {
        // «Austro» y «Pacífico» comparten la palabra «banco», nada más.
        expect(institutionFingerprint("Banco del Austro"))
            .not.toBe(institutionFingerprint("Banco del Pacífico"));
    });

    it("un nombre que es solo forma jurídica se queda como está", () => {
        // Vaciarlo lo uniría con cualquier otro nombre igual de pobre.
        expect(institutionFingerprint("Banco")).toBe("banco");
        expect(institutionFingerprint("Cooperativa")).toBe("cooperativa");
    });
});

describe("findDuplicateInstitutions", () => {
    const jardin = [
        { id: "1", name: "COAC Jardín Azuayo" },
        { id: "2", name: "Coop Jardín Azuayo" },
        { id: "3", name: "Cooperativa de Ahorro y Crédito Jardín Azuayo" },
    ];

    it("agrupa el caso real de las tres cooperativas", () => {
        const groups = findDuplicateInstitutions([
            ...jardin,
            { id: "4", name: "Banco del Austro" },
            { id: "5", name: "Banco Pichincha" },
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe("Jardin Azuayo");
        expect(groups[0].members.map(m => m.id)).toEqual(["1", "2", "3"]);
    });

    it("una institución sola no es un duplicado", () => {
        expect(findDuplicateInstitutions([
            { id: "1", name: "Banco del Austro" },
            { id: "2", name: "Banco Pichincha" },
        ])).toEqual([]);
    });

    it("no agrupa emisores distintos que comparten forma jurídica", () => {
        expect(findDuplicateInstitutions([
            { id: "1", name: "Banco del Austro" },
            { id: "2", name: "Banco del Pacífico" },
            { id: "3", name: "Cooperativa JEP" },
        ])).toEqual([]);
    });

    it("distingue mayúsculas y espacios sobrantes del mismo nombre", () => {
        const groups = findDuplicateInstitutions([
            { id: "1", name: "Banco del Austro" },
            { id: "2", name: "banco  del   austro" },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].members).toHaveLength(2);
    });
});
