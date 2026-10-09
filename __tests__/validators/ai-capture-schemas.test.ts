import { aiExtractionSchema, extractionFieldsSchema } from "@/lib/validators/ai-capture-schemas";

describe("ai-capture-schemas", () => {
    it("debe validar y parsear un payload enriquecido con source y destination", () => {
        const raw = {
            success: true,
            data: {
                type: "expense",
                title: "Gasto en Mini Market",
                amount: 50,
                currency: "USD",
                merchant_name: "Mini Market La Carolina",
                institution_id: "0883b21e-2115-4156-a4b0-c37e3c1550b9",
                institution_name: "Mini Market La Carolina",
                source: {
                    kind: "card",
                    card_id: "11111111-1111-4111-a111-111111111111",
                    account_id: "22222222-2222-4222-a222-222222222222",
                    card_type: "debit",
                    bank_institution_id: "33333333-3333-4333-a333-333333333333",
                    bank_name: "Banco del Austro",
                    last_four: "9012",
                },
                destination: null,
                account_id: "11111111-1111-4111-a111-111111111111",
                is_credit_card: false,
            },
        };

        const parsed = aiExtractionSchema.parse(raw);
        expect(parsed.institution_name).toBe("Mini Market La Carolina");
        expect(parsed.institution_id).toBe("0883b21e-2115-4156-a4b0-c37e3c1550b9");
        expect(parsed.source).toBeDefined();
        expect(parsed.source?.card_id).toBe("11111111-1111-4111-a111-111111111111");
        expect(parsed.source?.card_type).toBe("debit");
        expect(parsed.source?.bank_name).toBe("Banco del Austro");
    });

    it("debe ser tolerante si source viene malformado o con valores inválidos", () => {
        const raw = {
            data: {
                type: "expense",
                amount: 20,
                source: "invalido-no-objeto",
            },
        };

        const parsed = aiExtractionSchema.parse(raw);
        expect(parsed.amount).toBe(20);
        expect(parsed.source).toBeNull();
    });

    it("debe seguir soportando payloads legacy sin source ni destination", () => {
        const legacy = {
            type: "expense",
            amount: 30,
            institution_name: "Farmacia",
            is_credit_card: true,
        };

        const parsed = aiExtractionSchema.parse(legacy);
        expect(parsed.amount).toBe(30);
        expect(parsed.institution_name).toBe("Farmacia");
        expect(parsed.source).toBeNull();
        expect(parsed.destination).toBeNull();
    });
});
