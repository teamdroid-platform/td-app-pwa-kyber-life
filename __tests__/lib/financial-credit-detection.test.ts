import { hasCreditCardKeywords, isTransactionPaidWithCredit } from "@/lib/financial-utils";

describe("financial-credit-detection", () => {
    describe("hasCreditCardKeywords", () => {
        it("detects 'tarjeta de crédito' with and without accents when paid WITH card", () => {
            expect(hasCreditCardKeywords("Pago con tarjeta de crédito en Supermaxi")).toBe(true);
            expect(hasCreditCardKeywords("Consumo con tarjeta de credito")).toBe(true);
            expect(hasCreditCardKeywords("Uso de tarjeta credito")).toBe(true);
            expect(hasCreditCardKeywords("Compra con tarjeta de crédito")).toBe(true);
            expect(hasCreditCardKeywords("Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.")).toBe(true);
            expect(hasCreditCardKeywords("💳 RESUMEN DE GASTOS Y USO DE TARJETAS Banco Pichincha: Tarjeta de Crédito (terminada en 620 ): Consumo por $186.50 USD en KYWI a las 14:58.")).toBe(true);
        });

        it("detects 'credit card' purchase", () => {
            expect(hasCreditCardKeywords("Payment made via credit card at store")).toBe(true);
            expect(hasCreditCardKeywords("Purchase on credit card")).toBe(true);
        });

        it("does NOT detect bill payments TO a credit card as a credit card expense", () => {
            expect(hasCreditCardKeywords("Pago a tarjeta de crédito")).toBe(false);
            expect(hasCreditCardKeywords("Pago de tarjeta de crédito")).toBe(false);
            expect(hasCreditCardKeywords("Pago de tarjeta de crédito nacional")).toBe(false);
            expect(hasCreditCardKeywords("Abono a tarjeta de crédito")).toBe(false);
            expect(hasCreditCardKeywords("Transferencia para pago de tarjeta de crédito")).toBe(false);
            expect(hasCreditCardKeywords("Pago a mi tarjeta de crédito")).toBe(false);
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

        it("detects credit card payment from scan email body (like Consumo en KYWI) even when paidWithCredit is false in DB default", () => {
            const kywiTx = {
                type: "EXPENSE",
                paidWithCredit: false,
                description: "Consumo en KYWI",
                summary: "Consumo en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
                originStats: {
                    emailBody: "💳 RESUMEN DE GASTOS Y USO DE TARJETAS Banco Pichincha: Tarjeta de Crédito (terminada en 620 ): Consumo por $186.50 USD en KYWI a las 14:58.",
                    subject: "Resumen de gastos",
                },
                notes: "Consumo en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
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

        it("detects credit card payment from notes or summary when originStats is null", () => {
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

        it("does NOT detect 'Pago a tarjeta de crédito' (bill payment to card)", () => {
            expect(isTransactionPaidWithCredit({
                type: "EXPENSE",
                paidWithCredit: false,
                description: "Pago a tarjeta de crédito",
                merchant: "Banco del Pacifico",
                notes: "Pago a tarjeta de crédito",
                originStats: {
                    subject: "Pago a tarjeta de crédito",
                },
            })).toBe(false);
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
