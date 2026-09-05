import { isPaymentToCard, extractCardNumber } from "@/domain/services/card-payment-detection";

describe("isPaymentToCard", () => {
    it.each([
        "Pago de tarjeta de crédito",
        "Pago de la tarjeta de crédito No. 4697XXXXXXXX9620",
        "Pago de TC Mastercard",
        "TRANSFERENCIA PARA PAGO DE TC MASTERCARD",
        "Pago mínimo de tarjeta de crédito",
        "Pago realizado a tarjeta MASTERCARD",
        "Pago total tarjeta Visa Infinite Pichincha",
    ])("reconoce un pago a la tarjeta: %s", text => {
        expect(isPaymentToCard(text)).toBe(true);
    });

    it.each([
        "Pago con tarjeta de débito",
        "Pago realizado con tarjeta de débito",
        "Pago con tarjeta de débito en ABAD 1",
    ])("descarta una compra pagada con tarjeta: %s", text => {
        expect(isPaymentToCard(text)).toBe(false);
    });

    it("descarta un pago que solo menciona una tarjeta de pasada", () => {
        expect(isPaymentToCard("Pago de préstamos Brian por uso de tarjeta en Arg")).toBe(false);
    });

    it("no depende de mayúsculas ni de tildes", () => {
        expect(isPaymentToCard("PAGO DE TARJETA DE CREDITO")).toBe(true);
    });
});

describe("extractCardNumber", () => {
    it("saca el número enmascarado del texto", () => {
        expect(extractCardNumber("Pago de la tarjeta de crédito No. 4697XXXXXXXX9620"))
            .toBe("4697XXXXXXXX9620");
    });

    it("saca una máscara con solo los últimos dígitos", () => {
        expect(extractCardNumber("Pago a tarjeta XXXX8361")).toBe("XXXX8361");
    });

    it("saca una máscara con asteriscos", () => {
        expect(extractCardNumber("Pago TC 493176******1234")).toBe("493176******1234");
    });

    it("devuelve null cuando el texto no trae número", () => {
        expect(extractCardNumber("Pago de tarjeta de crédito")).toBeNull();
    });

    it("ignora montos y fechas, que no son números de tarjeta", () => {
        expect(extractCardNumber("Pago de tarjeta por 481.61 el 06/08/2026")).toBeNull();
    });
});
