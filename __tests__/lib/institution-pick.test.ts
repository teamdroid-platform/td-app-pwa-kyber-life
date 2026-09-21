import { pickInstitutionByName } from "@/lib/institution-match";

interface Fila {
    id: string;
    name: string;
    createdAt: string;
    isDeleted: boolean;
}

function fila(id: string, name: string, createdAt: string, isDeleted = false): Fila {
    return { id, name, createdAt, isDeleted };
}

describe("pickInstitutionByName", () => {
    it("empareja ignorando mayúsculas, tildes y puntuación", () => {
        const filas = [fila("a", "Coop Jardín Azuayo", "2026-08-01")];

        expect(pickInstitutionByName(filas, "COOP JARDIN AZUAYO")?.id).toBe("a");
        expect(pickInstitutionByName(filas, "coop. jardin azuayo")?.id).toBe("a");
    });

    it("no empareja dos nombres distintos del mismo banco", () => {
        // Deliberado: esto es emparejamiento exacto normalizado, no difuso. Decidir
        // que «Coop Jardín Azuayo» y su razón social son el mismo emisor es de la
        // pantalla de fusión, que lo pregunta; hacerlo aquí, en un escaneo
        // automático, uniría bancos distintos sin que nadie lo confirme.
        const filas = [fila("a", "Cooperativa de Ahorro y Crédito Jardín Azuayo Ltda.", "2026-08-01")];

        expect(pickInstitutionByName(filas, "Coop Jardín Azuayo")).toBeNull();
    });

    it("con varios homónimos devuelve el más antiguo, no null", () => {
        const filas = [
            fila("nuevo", "Coop Jardín Azuayo", "2026-09-19"),
            fila("viejo", "Coop Jardín Azuayo", "2026-08-13"),
        ];

        // `.maybeSingle()` devolvía error con dos filas y el llamador lo leía
        // como «no existe», fundando una tercera en cada escaneo.
        expect(pickInstitutionByName(filas, "Coop Jardín Azuayo")?.id).toBe("viejo");
    });

    it("encuentra un emisor archivado", () => {
        const filas = [fila("a", "Coop Jardín Azuayo", "2026-08-13", true)];

        expect(pickInstitutionByName(filas, "Coop Jardín Azuayo")?.id).toBe("a");
    });

    it("prefiere el vivo sobre el archivado aunque el archivado sea más antiguo", () => {
        const filas = [
            fila("archivado", "Coop Jardín Azuayo", "2026-08-13", true),
            fila("vivo", "Coop Jardín Azuayo", "2026-09-19"),
        ];

        expect(pickInstitutionByName(filas, "Coop Jardín Azuayo")?.id).toBe("vivo");
    });

    it("devuelve null con nombre vacío, sin emparejar cualquier cosa", () => {
        const filas = [fila("a", "Coop Jardín Azuayo", "2026-08-01")];

        expect(pickInstitutionByName(filas, "   ")).toBeNull();
        expect(pickInstitutionByName(filas, "")).toBeNull();
    });
});
