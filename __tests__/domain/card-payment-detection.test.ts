import {
    isPaymentToCard, extractCardNumber, detectCardPayments, groupTwins,
} from "@/domain/services/card-payment-detection";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { mergeFingerprints, type IdentityCandidate } from "@/lib/bank-number-match";
import type { FinancialTransaction } from "@/domain/entities/financial";

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

    it("saca el número cuando la máscara de viñetas va al principio", () => {
        expect(extractCardNumber("Pago a tarjeta ••••8361")).toBe("••••8361");
    });

    it("saca el número completo, con máscara incluida, cuando la viñeta va al final", () => {
        // Sin máscara al final se rompería la invariante de que el token
        // devuelto siempre trae un carácter de máscara.
        expect(extractCardNumber("Pago tarjeta 1234••••")).toBe("1234••••");
    });
});

const USER = "11111111-1111-1111-1111-111111111111";

function tx(partial: Partial<FinancialTransaction>): FinancialTransaction {
    return {
        id: crypto.randomUUID(), ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED",
        amount: 100, currency: "USD", date: "2026-08-06T13:25:00Z", description: "test",
        possibleDuplicate: false, createdAt: "2026-08-06T13:25:00Z",
        updatedAt: "2026-08-06T13:25:00Z", isDeleted: false,
        ...partial,
    } as FinancialTransaction;
}

/** Una tarjeta candidata con el número que declara. */
function card(id: string, raw: string): IdentityCandidate {
    return { id, kind: "CARD", fingerprint: mergeFingerprints([parseBankNumber(raw)]) };
}

describe("detectCardPayments", () => {
    const mastercard = card("card-8361", "XXXX8361");

    it("detecta un pago cuyo número resuelve a una sola tarjeta", () => {
        const t = tx({ description: "Pago de la tarjeta de crédito No. XXXXXXXXXXXX8361" });
        const found = detectCardPayments([t], [mastercard]);

        expect(found).toHaveLength(1);
        expect(found[0].cardId).toBe("card-8361");
        expect(found[0].readNumber).toBe("XXXXXXXXXXXX8361");
    });

    it("descarta un pago sin número, aunque la descripción sea inequívoca", () => {
        const t = tx({ description: "Pago de tarjeta de crédito", merchant: "Banco del Pacifico" });
        expect(detectCardPayments([t], [mastercard])).toEqual([]);
    });

    it("descarta una compra pagada con tarjeta de débito", () => {
        const t = tx({ description: "Pago con tarjeta de débito XXXX8361" });
        expect(detectCardPayments([t], [mastercard])).toEqual([]);
    });

    it("descarta un número que encaja con dos tarjetas", () => {
        const t = tx({ description: "Pago de tarjeta XXX361" });
        const otra = card("card-361", "XXXX0361");
        expect(detectCardPayments([t], [mastercard, otra])).toEqual([]);
    });

    it("ignora las transacciones ya atadas o ya descartadas", () => {
        const atada = tx({
            description: "Pago de tarjeta XXXX8361", bankCardPaymentId: "card-8361",
        });
        const descartada = tx({
            description: "Pago de tarjeta XXXX8361",
            cardPaymentDismissedAt: "2026-08-07T00:00:00Z",
        });
        expect(detectCardPayments([atada, descartada], [mastercard])).toEqual([]);
    });

    it("ignora las anuladas", () => {
        const t = tx({ description: "Pago de tarjeta XXXX8361", status: "DELETED" });
        expect(detectCardPayments([t], [mastercard])).toEqual([]);
    });
});

describe("groupTwins", () => {
    const mastercard = card("card-8361", "XXXX8361");
    const desc = "Pago de tarjeta de crédito XXXX8361";

    it("junta dos copias del mismo pago y ata la que tiene cuenta de origen", () => {
        const sinOrigen = tx({ description: desc, amount: 481.61, date: "2026-08-06T13:25:00Z" });
        const conOrigen = tx({
            description: desc, amount: 481.61, date: "2026-08-06T13:25:00Z",
            bankSourceAccountId: "acc-1",
        });
        const groups = groupTwins(detectCardPayments([sinOrigen, conOrigen], [mastercard]));

        expect(groups).toHaveLength(1);
        expect(groups[0].primary.id).toBe(conOrigen.id);
        expect(groups[0].twins.map(t => t.id)).toEqual([sinOrigen.id]);
        expect(groups[0].amount).toBe(481.61);
    });

    it("la fecha del grupo sigue a la transacción que se ata", () => {
        const sinOrigen = tx({ description: desc, amount: 481.61, date: "2026-08-06T13:25:00Z" });
        const conOrigen = tx({
            description: desc, amount: 481.61, date: "2026-08-07T09:00:00Z",
            bankSourceAccountId: "acc-1",
        });
        const groups = groupTwins(detectCardPayments([sinOrigen, conOrigen], [mastercard]));

        expect(groups[0].primary.id).toBe(conOrigen.id);
        expect(groups[0].date).toBe(conOrigen.date);
    });

    it("sin cuenta de origen en ninguna, ata la más antigua", () => {
        const vieja = tx({ description: desc, amount: 36, date: "2026-06-22T07:00:00Z" });
        const nueva = tx({ description: desc, amount: 36, date: "2026-06-22T09:00:00Z" });
        const groups = groupTwins(detectCardPayments([nueva, vieja], [mastercard]));

        expect(groups[0].primary.id).toBe(vieja.id);
    });

    it("no junta montos distintos", () => {
        const a = tx({ description: desc, amount: 100, date: "2026-08-06T13:25:00Z" });
        const b = tx({ description: desc, amount: 101, date: "2026-08-06T13:25:00Z" });
        expect(groupTwins(detectCardPayments([a, b], [mastercard]))).toHaveLength(2);
    });

    it("no junta fechas separadas por más de tres días", () => {
        const a = tx({ description: desc, amount: 100, date: "2026-08-01T00:00:00Z" });
        const b = tx({ description: desc, amount: 100, date: "2026-08-05T00:00:00Z" });
        expect(groupTwins(detectCardPayments([a, b], [mastercard]))).toHaveLength(2);
    });

    it("la ventana se mide contra el ancla del grupo, no contra la última vecina sumada", () => {
        // b entra al grupo de a (3 días exactos). c está a 3 días de b, pero a
        // 6 del ancla (a): si la ventana se corriera con cada vecino, c se
        // colaría en el mismo grupo que a — encadenando sin tope.
        const a = tx({ description: desc, amount: 100, date: "2026-08-01T00:00:00Z" });
        const b = tx({ description: desc, amount: 100, date: "2026-08-04T00:00:00Z" });
        const c = tx({ description: desc, amount: 100, date: "2026-08-07T00:00:00Z" });
        const groups = groupTwins(detectCardPayments([a, b, c], [mastercard]));

        expect(groups).toHaveLength(2);
        const [first, second] = groups;
        expect(first.primary.id).toBe(a.id);
        expect(first.twins.map(t => t.id)).toEqual([b.id]);
        expect(second.primary.id).toBe(c.id);
    });

    it("no junta pagos a tarjetas distintas", () => {
        const otra = card("card-9620", "XXXX9620");
        const a = tx({ description: "Pago de tarjeta XXXX8361", amount: 100 });
        const b = tx({ description: "Pago de tarjeta XXXX9620", amount: 100 });
        expect(groupTwins(detectCardPayments([a, b], [mastercard, otra]))).toHaveLength(2);
    });
});
