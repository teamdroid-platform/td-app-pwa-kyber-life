import { createCardSchema, createAccountSchema, payStatementSchema } from "@/lib/validators/bank-schemas";

const INSTITUTION = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

describe("createCardSchema", () => {
    const base = { institutionId: INSTITUTION, name: "Pacificard", currency: "USD" };

    it("acepta una tarjeta de crédito con ciclo y sin cuenta", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "CREDIT", creditLimit: 3000, statementDay: 20, dueDay: 28,
        });
        expect(result.success).toBe(true);
    });

    it("rechaza una tarjeta de crédito atada a una cuenta", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "CREDIT", accountId: ACCOUNT,
        });
        expect(result.success).toBe(false);
    });

    it("rechaza una tarjeta de débito sin cuenta", () => {
        const result = createCardSchema.safeParse({ ...base, cardType: "DEBIT" });
        expect(result.success).toBe(false);
    });

    it("rechaza una tarjeta de débito con cupo", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "DEBIT", accountId: ACCOUNT, creditLimit: 500,
        });
        expect(result.success).toBe(false);
    });

    it("rechaza un día de corte fuera de rango", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "CREDIT", statementDay: 32, dueDay: 5,
        });
        expect(result.success).toBe(false);
    });

    it("acepta una tarjeta de débito atada a su cuenta", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "DEBIT", accountId: ACCOUNT,
        });
        expect(result.success).toBe(true);
    });
});

describe("createAccountSchema", () => {
    it("rechaza una cuenta corriente sin institución", () => {
        const result = createAccountSchema.safeParse({
            name: "Corriente", accountType: "CHECKING", currency: "USD",
        });
        expect(result.success).toBe(false);
    });

    it("acepta efectivo sin institución", () => {
        const result = createAccountSchema.safeParse({
            name: "Efectivo", accountType: "CASH", currency: "USD",
        });
        expect(result.success).toBe(true);
    });

    it("rechaza efectivo con institución", () => {
        const result = createAccountSchema.safeParse({
            name: "Efectivo", accountType: "CASH", institutionId: INSTITUTION, currency: "USD",
        });
        expect(result.success).toBe(false);
    });
});

describe("payStatementSchema", () => {
    it("rechaza un monto de cero o negativo", () => {
        const base = {
            statementId: INSTITUTION, sourceAccountId: ACCOUNT,
            date: "2026-08-26T00:00:00.000Z",
        };
        expect(payStatementSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
        expect(payStatementSchema.safeParse({ ...base, amount: -5 }).success).toBe(false);
        expect(payStatementSchema.safeParse({ ...base, amount: 611.4 }).success).toBe(true);
    });
});
