import { beneficiaryIsOwner } from "@/lib/beneficiary-owner";

const OWNER = "Fernando Xavier Garnica Bautista";

describe("beneficiaryIsOwner — frases reales de los escaneos", () => {
    it("reconoce al usuario cuando el banco lo nombra corto como beneficiario", () => {
        expect(beneficiaryIsOwner("Transferencia a la cuenta de Xavier Garnica", OWNER)).toBe(true);
    });

    it("reconoce al usuario en «a nombre de»", () => {
        const text = "Transferencia de $90.00 desde la cuenta de Banco del Austro hacia la cuenta de Banco Pichincha a nombre de Xavier Garnica, con cargo de $0.41.";
        expect(beneficiaryIsOwner(text, OWNER)).toBe(true);
    });

    it("reconoce al usuario en la línea de beneficiario del correo, en mayúsculas", () => {
        expect(beneficiaryIsOwner("Beneficiario cta. destino: XAVIER GARNICA Dispositivo: pixel", OWNER)).toBe(true);
    });

    it("el usuario como remitente no hace suya la cuenta de destino", () => {
        const text = "Se realizó una transferencia de $30.00 desde la cuenta de Fernando Xavier Garnica Bautista a Marcos Israel Solis Jara.";
        expect(beneficiaryIsOwner(text, OWNER)).not.toBe(true);
    });

    it("un tercero nombrado como beneficiario es un tercero", () => {
        expect(beneficiaryIsOwner("Transferencia a MARCOS ISRAEL SOLIS JARA", OWNER)).toBe(false);
        expect(beneficiaryIsOwner("desde la cuenta de Fernando Xavier Garnica Bautista hacia la cuenta de Brian Tyler Mora Aguirre", OWNER)).toBe(false);
    });

    it("compartir un apellido no basta: tienen que coincidir todas las palabras", () => {
        expect(beneficiaryIsOwner("Transferencia a la cuenta de Maria Garnica", OWNER)).toBe(false);
    });

    it("un solo nombre suelto no identifica a nadie", () => {
        expect(beneficiaryIsOwner("Transferencia a la cuenta de Xavier", OWNER)).toBeNull();
    });

    it("lo que sigue al marcador no siempre es una persona: una cuenta o un banco no cuentan", () => {
        expect(beneficiaryIsOwner("Transferencia a cuenta de Banco Pichincha", OWNER)).toBeNull();
        expect(beneficiaryIsOwner("a la cuenta de ahorros 40XXXXXXXX00", OWNER)).toBeNull();
    });

    it("sin beneficiario en el texto no decide nada", () => {
        expect(beneficiaryIsOwner("Pago en Chifa Xingyun", OWNER)).toBeNull();
    });

    it("sin nombre de perfil no decide nada", () => {
        expect(beneficiaryIsOwner("Transferencia a la cuenta de Xavier Garnica", "")).toBeNull();
    });

    it("ignora tildes y espacios sobrantes del perfil", () => {
        expect(beneficiaryIsOwner("a nombre de Jose Nunez", "  José  Núñez ")).toBe(true);
    });
});
