import { resolveAccountBadgeInfo } from "@/presentation/financial/lib/scan-accounts";
import type { ScannedAccountView } from "@/application/services/bank-service";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";

const now = "2026-09-15T13:18:56.000Z";

/** El escaneo real que etiquetaba dos cuentas de ahorros como TDE y a una propia como TER. */
const TRANSFER: FinancialScannerTransaction = {
    id: "scan-1",
    ownerUserId: "user-1",
    amount: 53,
    currency: "USD",
    merchant: "Cooperativa de Ahorro y Crédito Jardín Azuayo Ltda.",
    date: now,
    type: "TRANSFER",
    category: "Transferencias",
    description: "Transferencia a la cuenta de Xavier Garnica",
    summary: "Se realizó una transferencia de 53.00 USD desde la cuenta de Fernando Xavier Garnica Bautista a la cuenta de Xavier Garnica.",
    accounts: [
        { type: "origen", account: "25XXX10" },
        { type: "destino", account: "22XXXXXX58" },
    ],
    status: "DETECTED",
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
};

function view(overrides: Partial<ScannedAccountView>): ScannedAccountView {
    return {
        role: "DESTINATION",
        raw: "22XXXXXX58",
        display: "22XXXX58",
        kind: "ACCOUNT",
        resolution: "INFERRED",
        match: null,
        institutionHint: null,
        ownership: null,
        decision: null,
        ...overrides,
    };
}

describe("resolveAccountBadgeInfo — con las cuentas del usuario", () => {
    it("usa el tipo de la cuenta registrada en vez de adivinarlo del texto", () => {
        const registered = view({
            match: { id: "acc-1", typeLabel: "Ahorros", typeAcronym: "AHO", institutionName: "Banco Pichincha" },
        });

        const info = resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", TRANSFER, registered);

        expect(info.typeAcronym).toBe("AHO");
    });

    it("una cuenta registrada es del usuario aunque sea el destino", () => {
        const registered = view({
            match: { id: "acc-1", typeLabel: "Ahorros", typeAcronym: "AHO", institutionName: "Banco Pichincha" },
        });

        const info = resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", TRANSFER, registered);

        expect(info.ownershipAcronym).toBe("MIA");
    });

    it("lo que el usuario ya declaró de un número sin registrar manda sobre el lado", () => {
        const declared = view({ ownership: "MINE" });

        const info = resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", TRANSFER, declared);

        expect(info.ownershipAcronym).toBe("MIA");
    });
});

describe("resolveAccountBadgeInfo — inferencia, solo sin registro", () => {
    it("el «Crédito» del nombre de una cooperativa no convierte la cuenta en tarjeta", () => {
        const info = resolveAccountBadgeInfo("SOURCE", "25XXX10", TRANSFER);

        expect(info.typeAcronym).not.toBe("TCR");
        expect(info.typeAcronym).not.toBe("TDE");
    });

    it("dos letras sueltas dentro de otra palabra no son un tipo: «Ltda.» no es «TD»", () => {
        const scan = { ...TRANSFER, merchant: "Comercial Andina Ltda.", summary: "", description: "Pago" };

        expect(resolveAccountBadgeInfo("SOURCE", "XXXX1234", scan).typeAcronym).toBe("CTA");
    });

    it("sigue reconociendo una tarjeta de débito cuando el texto la nombra", () => {
        const scan = { ...TRANSFER, merchant: "Supermaxi", summary: "Consumo con tarjeta de débito", description: "Compra" };

        expect(resolveAccountBadgeInfo("SOURCE", "XXXX1234", scan).typeAcronym).toBe("TDE");
    });

    it("sin registro ni declaración, el destino se supone de un tercero", () => {
        expect(resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", TRANSFER).ownershipAcronym).toBe("TER");
    });
});

describe("resolveAccountBadgeInfo — el beneficiario es el propio usuario", () => {
    const OWNER = "Fernando Xavier Garnica Bautista";

    it("un destino sin registrar a nombre del usuario es suyo", () => {
        expect(resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", TRANSFER, null, OWNER).ownershipAcronym).toBe("MIA");
    });

    it("lee el beneficiario también del cuerpo del correo", () => {
        const scan = {
            ...TRANSFER,
            description: "Transferencia",
            summary: "",
            originStats: { emailBody: "Cuenta destino: 22XXXXXX58 Beneficiario cta. destino: XAVIER GARNICA Dispositivo: pixel" },
        };
        expect(resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", scan, null, OWNER).ownershipAcronym).toBe("MIA");
    });

    it("una transferencia del usuario a otra persona sigue siendo de un tercero", () => {
        const scan = {
            ...TRANSFER,
            description: "Transferencia a MARCOS ISRAEL SOLIS JARA",
            summary: "Se realizó una transferencia de $30.00 desde la cuenta de Fernando Xavier Garnica Bautista a Marcos Israel Solis Jara.",
        };
        expect(resolveAccountBadgeInfo("DESTINATION", "40XXXXXXXX00", scan, null, OWNER).ownershipAcronym).toBe("TER");
    });

    it("lo que el usuario declaró manda sobre el nombre", () => {
        const declared = view({ ownership: "EXTERNAL" });
        expect(resolveAccountBadgeInfo("DESTINATION", "22XXXXXX58", TRANSFER, declared, OWNER).ownershipAcronym).toBe("TER");
    });
});
