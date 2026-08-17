import {
    collectPendingCreations,
    resolveEntityStatus,
    toAmountValue,
    toCurrency,
    toWizardValues,
} from "@/presentation/financial/lib/ai-extraction";
import type { AiExtraction } from "@/lib/validators/ai-capture-schemas";

const FALLBACK_DATE = "2026-08-07T09:00";

function extraction(overrides: Partial<AiExtraction> = {}): AiExtraction {
    return {
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
        ...overrides,
    };
}

describe("toAmountValue", () => {
    it("treats zero as absent, not as a value", () => {
        expect(toAmountValue(0)).toBe("");
    });

    it("treats a negative amount as absent", () => {
        expect(toAmountValue(-12)).toBe("");
    });

    it("keeps a positive number", () => {
        expect(toAmountValue(20.5)).toBe("20.5");
    });

    it("reads a plain decimal string", () => {
        expect(toAmountValue("20.50")).toBe("20.5");
    });

    it("reads the Spanish thousands/decimal convention", () => {
        expect(toAmountValue("1.234,56")).toBe("1234.56");
    });

    it("returns empty for something unparseable", () => {
        expect(toAmountValue("veinte dólares")).toBe("");
        expect(toAmountValue(null)).toBe("");
        expect(toAmountValue(undefined)).toBe("");
    });
});

describe("toCurrency", () => {
    it("uppercases a valid ISO code", () => {
        expect(toCurrency("eur")).toBe("EUR");
    });

    it("falls back to USD for anything else", () => {
        expect(toCurrency("dólares")).toBe("USD");
        expect(toCurrency(null)).toBe("USD");
        expect(toCurrency("")).toBe("USD");
    });
});

describe("toWizardValues", () => {
    it("maps the documented payload into form values", () => {
        const { values, currency } = toWizardValues(extraction(), { fallbackDate: FALLBACK_DATE });

        expect(currency).toBe("USD");
        expect(values).toMatchObject({
            type: "EXPENSE",
            description: "Gasto por servicios de IA",
            institutionName: "Anthropic",
            institutionId: "6a78fcda-b4e0-4686-a9d8-04c68b8ce821",
            categoryName: "Servicios",
            paidWithCredit: true,
            tags: [],
        });
        // Stored dates are literal wall-clock, read verbatim from the ISO string.
        expect(values.date).toBe("2026-08-06T19:42");
    });

    it("identifies the account by its number", () => {
        const { values } = toWizardValues(
            extraction({ account_number: "**** 4821", account_id: null }), { fallbackDate: FALLBACK_DATE },
        );
    });

    it("ignores what the sentence called the account, so no 'Débito' is created", () => {
        // "pagado con débito" describes a method, not an account the user has.
        const { values } = toWizardValues(
            extraction({ account_name: "débito", account_number: null }), { fallbackDate: FALLBACK_DATE },
        );
    });

    it("leaves the amount empty when the extractor answered zero", () => {
        const { values } = toWizardValues(extraction(), { fallbackDate: FALLBACK_DATE });
        expect(values.amount).toBe("");
    });

    it("falls back to EXPENSE for an unknown type", () => {
        const { values } = toWizardValues(extraction({ type: "sacrifice" }), { fallbackDate: FALLBACK_DATE });
        expect(values.type).toBe("EXPENSE");
    });

    it("accepts the wider types the chips do not offer", () => {
        const { values } = toWizardValues(extraction({ type: "fee" }), { fallbackDate: FALLBACK_DATE });
        expect(values.type).toBe("FEE");
    });

    it("uses the fallback date when there is none, and says so", () => {
        const { values, dateWasInferred } = toWizardValues(
            extraction({ date: null }), { fallbackDate: FALLBACK_DATE },
        );
        expect(values.date).toBe(FALLBACK_DATE);
        expect(dateWasInferred).toBe(true);
    });

    it("uses the fallback date when the date is unparseable", () => {
        const { values, dateWasInferred } = toWizardValues(
            extraction({ date: "el martes pasado" }), { fallbackDate: FALLBACK_DATE },
        );
        expect(values.date).toBe(FALLBACK_DATE);
        expect(dateWasInferred).toBe(true);
    });

    it("drops the credit flag on types where it means nothing", () => {
        const { values } = toWizardValues(
            extraction({ type: "income", is_credit_card: true }), { fallbackDate: FALLBACK_DATE },
        );
        expect(values.paidWithCredit).toBe(false);
    });

    it("reads an affirmative the model answered as a string", () => {
        const { values } = toWizardValues(
            extraction({ is_credit_card: "true" }), { fallbackDate: FALLBACK_DATE },
        );
        expect(values.paidWithCredit).toBe(true);
    });

    it("drops an id whose name never arrived", () => {
        const { values } = toWizardValues(
            extraction({ institution_name: null }), { fallbackDate: FALLBACK_DATE },
        );
        expect(values.institutionName).toBe("");
        expect(values.institutionId).toBeNull();
    });

    it("survives an extraction where nothing was inferred", () => {
        const { values, currency } = toWizardValues({} as AiExtraction, { fallbackDate: FALLBACK_DATE });

        expect(currency).toBe("USD");
        expect(values).toMatchObject({
            type: "EXPENSE",
            amount: "",
            description: "",
            institutionName: "",
            categoryName: "",
            paidWithCredit: false,
            notes: "",
            tags: [],
            date: FALLBACK_DATE,
        });
    });

    it("cleans, dedupes and caps the tags", () => {
        const { values } = toWizardValues(
            extraction({ tags: ["  comida ", "Comida", "", "viaje"] }), { fallbackDate: FALLBACK_DATE },
        );
        expect(values.tags).toEqual(["comida", "viaje"]);
    });
});

describe("resolveEntityStatus", () => {
    const institutions = ["Banco Pichincha", "Anthropic"];

    it("reports an empty name as empty", () => {
        expect(resolveEntityStatus("", null, institutions)).toBe("empty");
        expect(resolveEntityStatus("   ", null, institutions)).toBe("empty");
    });

    it("trusts a resolved id", () => {
        expect(resolveEntityStatus("Anthropic PBC", "some-id", institutions)).toBe("existing");
    });

    it("matches an existing name regardless of case", () => {
        expect(resolveEntityStatus("anthropic", null, institutions)).toBe("existing");
    });

    it("reports a name with no match as new", () => {
        expect(resolveEntityStatus("Anthropic PBC", null, institutions)).toBe("new");
    });

    it("does not fuzzy-match, because the service that writes it does not either", () => {
        // "Banco Pichincha" vs "Pichincha" would pass the scanner's fuzzy match,
        // but createTransaction compares whole names — so this creates a record.
        expect(resolveEntityStatus("Pichincha", null, institutions)).toBe("new");
    });
});

describe("collectPendingCreations", () => {
    it("lists only what will actually be created, in summary order", () => {
        const { values } = toWizardValues(extraction(), { fallbackDate: FALLBACK_DATE });
        const pending = collectPendingCreations(values, {
            institution: "new",
            category: "existing",
        });

        expect(pending).toEqual([
            { label: "Institución", name: "Anthropic" },
        ]);
    });

    it("is empty when everything already exists", () => {
        const { values } = toWizardValues(extraction(), { fallbackDate: FALLBACK_DATE });
        expect(collectPendingCreations(values, {
            institution: "existing", category: "existing",
        })).toEqual([]);
    });
});
