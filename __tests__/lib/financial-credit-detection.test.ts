import { hasCreditCardKeywords, isTransactionPaidWithCredit } from "@/lib/financial-utils";

describe("financial-credit-detection", () => {
    describe("hasCreditCardKeywords", () => {
        it("detects 'tarjeta de crédito' with and without accents", () => {
            expect(hasCreditCardKeywords("Pago con tarjeta de crédito en Supermaxi")).toBe(true);
            expect(hasCreditCardKeywords("Consumo con tarjeta de credito")).toBe(true);
            expect(hasCreditCardKeywords("Uso de tarjeta credito")).toBe(true);
            expect(hasCreditCardKeywords("Resumen de tarjetas de crédito")).toBe(true);
        });

        it("detects 'credit card'", () => {
            expect(hasCreditCardKeywords("Payment made via credit card at store")).toBe(true);
        });

        it("does not match regular debit or non-card transactions", () => {
            expect(hasCreditCardKeywords("Retiro en cajero automático")).toBe(false);
            expect(hasCreditCardKeywords("Transferencia recibida de Juan")).toBe(false);
            expect(hasCreditCardKeywords("Pago en efectivo")).toBe(false);
            expect(hasCreditCardKeywords("")).toBe(false);
            expect(hasCreditCardKeywords(null)).toBe(false);
            expect(hasCreditCardKeywords(undefined)).toBe(false);
        });
    });

    describe("isTransactionPaidWithCredit", () => {
        it("returns true when paidWithCredit is explicitly true", () => {
            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                paidWithCredit: true,
            })).toBe(true);
        });

        it("detects credit card payment from scan email body (like Consumo en KYWI)", () => {
            const kywiTx = {
                type: "EXPENSE",
                paidWithCredit: false,
                description: "Consumo en KYWI",
                summary: "Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
                originStats: {
                    emailBody: "💳 RESUMEN DE GASTOS Y USO DE TARJETAS Banco Pichincha: Tarjeta de Crédito (terminada en 620 ): Consumo por $186.50 USD en KYWI a las 14:58.",
                    subject: "Resumen de gastos",
                },
                notes: "Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
            };

            expect(isTransactionPaidWithCredit(kywiTx)).toBe(true);
        });

        it("detects credit card payment from originStats flags", () => {
            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                originStats: { is_credit_card: true },
            })).toBe(true);

            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                originStats: { isCreditCard: true },
            })).toBe(true);
        });

        it("detects credit card payment from notes or summary even if originStats is null", () => {
            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                paidWithCredit: false,
                notes: "Gasto diferido con tarjeta de credito",
            })).toBe(true);

            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                summary: "Compra en Amazon con Tarjeta de Crédito",
            })).toBe(true);
        });

        it("returns false for income, transfer, or withdrawal even if words match in notes", () => {
            expect(isTransactionPaidWithCredit({
                type: "INCOME",
                notes: "Depósito para pagar tarjeta de crédito",
            })).toBe(false);

            expect(isTransactionPaidWithCredit({
                type: "WITHDRAWAL",
                notes: "Retiro en cajero",
            })).toBe(false);
        });

        it("returns false for ordinary expense without credit card indicators", () => {
            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                paidWithCredit: false,
                description: "Compra de combustible",
                notes: "CHAULLABAMBA Combustible",
                originStats: {
                    emailBody: "Débito bancario por $25.23",
                },
            })).toBe(false);
        });

        it("handles null / undefined safely", () => {
            expect(isTransactionPaidWithCredit(null)).toBe(false);
            expect(isTransactionPaidWithCredit(undefined)).toBe(false);
        });
    });
});
