import { toCaptureAccountViews } from "@/presentation/financial/lib/ai-extraction";
import { trailBesideChoice } from "@/presentation/financial/lib/payment-trail";
import type { AiExtraction } from "@/lib/validators/ai-capture-schemas";
import type { ScannedAccountView } from "@/application/services/bank-service";

const EMPTY_SIDE = { kind: null, bank_name: null, card_type: null, last_four: null, account_id: null, bank_institution_id: null };

/** La extracción real del «Salario del mes»: origen vacío, destino resuelto a la ••9558. */
function salario(overrides: Partial<AiExtraction> = {}): AiExtraction {
    return {
        type: "income", title: "Salario del mes", amount: 3731.58, currency: "USD",
        institution_name: "Banco Pichincha", category_name: "Salario",
        date: "2026-10-22T06:00:00.000Z", tags: [], notes: "",
        source: EMPTY_SIDE,
        destination: {
            kind: "account", bank_name: "Banco Pichincha", last_four: "9558",
            account_id: "acc-9558", bank_institution_id: "inst-pich",
        },
        ...overrides,
    } as AiExtraction;
}

function view(role: "SOURCE" | "DESTINATION", matchId: string | null): ScannedAccountView {
    return {
        role, raw: `${role}-raw`, display: "•••• 1234", kind: "ACCOUNT",
        resolution: matchId ? "EXACT" : "PENDING",
        match: matchId ? { id: matchId, typeLabel: "Ahorros", typeAcronym: "AHO", institutionName: "Pichincha" } : null,
        institutionHint: null, ownership: "MINE", decision: null,
    };
}

describe("toCaptureAccountViews", () => {
    it("un origen vacío no es una cuenta detectada", () => {
        expect(toCaptureAccountViews(salario())).toEqual([]);
    });

    it("un origen con banco o dígitos sí lo es", () => {
        const views = toCaptureAccountViews(salario({
            source: { ...EMPTY_SIDE, bank_name: "Banco Guayaquil" },
        }));
        expect(views).toHaveLength(1);
        expect(views[0].role).toBe("SOURCE");
    });

    it("el origen de un ingreso no se afirma como tuyo: lo paga otro", () => {
        const [source] = toCaptureAccountViews(salario({
            source: { ...EMPTY_SIDE, bank_name: "Banco Guayaquil" },
        }));
        expect(source.ownership).toBeNull();
    });

    it("el origen de un gasto sí es tuyo", () => {
        const [source] = toCaptureAccountViews(salario({
            type: "expense", destination: null,
            source: { ...EMPTY_SIDE, last_four: "0814" },
        }));
        expect(source.ownership).toBe("MINE");
    });
});

describe("trailBesideChoice", () => {
    it("la cuenta elegida tapa la lectura sin registrar de su mismo lado", () => {
        const trail = trailBesideChoice(
            [view("DESTINATION", null)],
            { source: [], destination: "acc-9558" },
        );
        expect(trail).toEqual([]);
    });

    it("la lectura que apunta a la misma cuenta elegida se conserva", () => {
        const trail = trailBesideChoice(
            [view("DESTINATION", "acc-9558")],
            { source: [], destination: "acc-9558" },
        );
        expect(trail).toHaveLength(1);
    });

    it("el lado sin elección conserva lo detectado", () => {
        const trail = trailBesideChoice(
            [view("SOURCE", null), view("DESTINATION", null)],
            { source: [], destination: "acc-9558" },
        );
        expect(trail.map(v => v.role)).toEqual(["SOURCE"]);
    });

    it("en el origen vale tanto la tarjeta como la cuenta elegidas", () => {
        const trail = trailBesideChoice(
            [view("SOURCE", "acc-debito")],
            { source: ["card-1", "acc-debito"], destination: null },
        );
        expect(trail).toHaveLength(1);
    });
});
