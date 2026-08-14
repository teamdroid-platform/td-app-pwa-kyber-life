import { describePaymentSource, isGenericPaymentLabel } from "@/presentation/financial/lib/payment-summary";
import type { BankAccount, BankCard } from "@/domain/entities/bank";

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const ahorros: BankAccount = {
    id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
    accountType: "SAVINGS", lastFour: "0814", currency: "USD",
    status: "ACTIVE", isUnconfirmed: false, ...STAMPS,
};

const efectivo: BankAccount = {
    id: "cash", ownerUserId: "u", institutionId: null, name: "Efectivo",
    accountType: "CASH", currency: "USD",
    status: "ACTIVE", isUnconfirmed: false, ...STAMPS,
};

const credito: BankCard = {
    id: "c1", ownerUserId: "u", institutionId: "i1", name: "Pacificard Mastercard",
    cardType: "CREDIT", lastFour: "8361", currency: "USD",
    status: "ACTIVE", isUnconfirmed: false, ...STAMPS,
};

const debito: BankCard = {
    id: "c2", ownerUserId: "u", institutionId: "i1", accountId: "a1",
    name: "Visa Débito", cardType: "DEBIT", lastFour: "2780", currency: "USD",
    status: "ACTIVE", isUnconfirmed: false, ...STAMPS,
};

const accounts = [ahorros, efectivo];
const cards = [credito, debito];

describe("describePaymentSource", () => {
    it("nombra la cuenta con su número al estándar", () => {
        expect(describePaymentSource({ accountId: "a1" }, accounts, cards))
            .toBe("Ahorros Principal · ••••0814");
    });

    it("nombra la tarjeta con equis, no con puntos", () => {
        expect(describePaymentSource({ cardId: "c1", paidWithCredit: true }, accounts, cards))
            .toBe("Pacificard Mastercard · XXXX8361");
    });

    it("la tarjeta manda sobre la cuenta de la que descuenta", () => {
        // Un débito trae ambas: se pagó con la tarjeta, y eso es lo que se dice.
        expect(describePaymentSource({ cardId: "c2", accountId: "a1" }, accounts, cards))
            .toBe("Visa Débito · XXXX2780");
    });

    it("una cuenta sin número se nombra igual, sin dejar el separador colgando", () => {
        expect(describePaymentSource({ accountId: "cash" }, accounts, cards)).toBe("Efectivo");
    });

    it("sin nada atado dice lo único que se sabe", () => {
        expect(describePaymentSource({ paidWithCredit: false }, accounts, cards))
            .toBe("Efectivo o débito");
        expect(describePaymentSource({ paidWithCredit: true }, accounts, cards))
            .toBe("Tarjeta de crédito");
    });

    it("un id que ya no existe no rompe: cae al genérico", () => {
        expect(describePaymentSource({ accountId: "borrada" }, accounts, cards))
            .toBe("Efectivo o débito");
    });

    it("tolera nulos, que es como llegan de la base", () => {
        expect(describePaymentSource({ accountId: null, cardId: null, paidWithCredit: null }, accounts, cards))
            .toBe("Efectivo o débito");
    });
});

describe("isGenericPaymentLabel", () => {
    it("reconoce los dos textos que no nombran ninguna cuenta", () => {
        expect(isGenericPaymentLabel("Efectivo o débito")).toBe(true);
        expect(isGenericPaymentLabel("Tarjeta de crédito")).toBe(true);
    });

    it("una cuenta concreta no es genérica", () => {
        expect(isGenericPaymentLabel("Ahorros Principal · ••••0814")).toBe(false);
    });
});
