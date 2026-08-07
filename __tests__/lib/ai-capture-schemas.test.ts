import { aiExtractionSchema, extractFromTextSchema } from "@/lib/validators/ai-capture-schemas";

/** The payload from the endpoint's own documentation, used as the happy path. */
const SAMPLE = {
    type: "expense",
    title: "Gasto por servicios de IA",
    amount: 0,
    currency: "USD",
    institution_id: "6a78fcda-b4e0-4686-a9d8-04c68b8ce821",
    institution_name: "Anthropic",
    category_id: "ff403faf-784f-43b9-95cc-9d081c299b00",
    category_name: "Servicios",
    account_id: null,
    account_name: "Tarjeta de crédito",
    account_number: null,
    is_credit_card: true,
    date: "2026-08-06T19:42:47.335Z",
    tags: [],
    notes: "",
};

describe("extractFromTextSchema", () => {
    it("trims and accepts a normal sentence", () => {
        const parsed = extractFromTextSchema.parse({ text: "  Gasté 20 en el súper  " });
        expect(parsed.text).toBe("Gasté 20 en el súper");
    });

    it("rejects text too short to describe a movement", () => {
        expect(() => extractFromTextSchema.parse({ text: "ab" })).toThrow();
    });

    it("rejects text past the cap", () => {
        expect(() => extractFromTextSchema.parse({ text: "a".repeat(1001) })).toThrow();
    });
});

describe("aiExtractionSchema", () => {
    it("accepts the documented payload as-is", () => {
        const parsed = aiExtractionSchema.parse(SAMPLE);
        expect(parsed).toMatchObject({
            type: "expense",
            institution_name: "Anthropic",
            is_credit_card: true,
            account_id: null,
        });
    });

    it("accepts a payload where every field is missing", () => {
        const parsed = aiExtractionSchema.parse({});
        expect(parsed.title).toBeUndefined();
        expect(parsed.amount).toBeUndefined();
    });

    it("unwraps the single-item array n8n passes between nodes", () => {
        const parsed = aiExtractionSchema.parse([SAMPLE]);
        expect(parsed.institution_name).toBe("Anthropic");
    });

    it("unwraps a lone data/json wrapper", () => {
        expect(aiExtractionSchema.parse({ data: SAMPLE }).title).toBe(SAMPLE.title);
        expect(aiExtractionSchema.parse([{ json: SAMPLE }]).title).toBe(SAMPLE.title);
    });

    it("keeps a payload that merely happens to contain a data field", () => {
        const parsed = aiExtractionSchema.parse({ ...SAMPLE, data: "irrelevant" });
        expect(parsed.title).toBe(SAMPLE.title);
    });

    it("drops an unusable id instead of rejecting the whole extraction", () => {
        const parsed = aiExtractionSchema.parse({ ...SAMPLE, institution_id: "unknown" });
        expect(parsed.institution_id).toBeNull();
        expect(parsed.institution_name).toBe("Anthropic");
    });

    it("drops malformed tags instead of rejecting the whole extraction", () => {
        const parsed = aiExtractionSchema.parse({ ...SAMPLE, tags: "comida" });
        expect(parsed.tags).toBeNull();
        expect(parsed.title).toBe(SAMPLE.title);
    });

    it("keeps an amount the model answered as a string", () => {
        expect(aiExtractionSchema.parse({ ...SAMPLE, amount: "20.50" }).amount).toBe("20.50");
    });
});
