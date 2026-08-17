import {
    computeAccountBalance, computeCardDebt, computeAvailableCredit,
    computeStatementDue, runningBalances, statementPeriodFor,
} from "@/domain/services/bank-balance";
import { BankMovement, BankAccountBalanceSnapshot, BankCardStatement } from "@/domain/entities/bank";

function mov(partial: Partial<BankMovement>): BankMovement {
    return {
        transactionId: "t", ownerUserId: "u", date: "2026-08-10T00:00:00Z",
        direction: "OUT", amount: 0, currency: "USD", ...partial,
    } as BankMovement;
}

describe("computeAccountBalance", () => {
    it("suma entradas y resta salidas cuando no hay corte", () => {
        const movs = [
            mov({ direction: "IN", amount: 500 }),
            mov({ direction: "OUT", amount: 74.19 }),
        ];
        expect(computeAccountBalance(null, movs)).toBe(425.81);
    });

    it("parte del corte e ignora los movimientos anteriores a as_of", () => {
        const snapshot: BankAccountBalanceSnapshot = {
            id: "s", ownerUserId: "u", accountId: "a", balance: 2310,
            asOf: "2026-08-01T00:00:00Z", source: "MANUAL",
            createdAt: "", updatedAt: "", isDeleted: false,
        };
        const movs = [
            mov({ date: "2026-07-20T00:00:00Z", direction: "OUT", amount: 999 }),
            mov({ date: "2026-08-05T00:00:00Z", direction: "OUT", amount: 205.82 }),
        ];
        expect(computeAccountBalance(snapshot, movs)).toBe(2104.18);
    });

    it("ignora las líneas de tarjeta", () => {
        const movs = [
            mov({ direction: "IN", amount: 100 }),
            mov({ direction: "CHARGE", amount: 50 }),
            mov({ direction: "PAYMENT", amount: 50 }),
        ];
        expect(computeAccountBalance(null, movs)).toBe(100);
    });
});

describe("computeCardDebt", () => {
    it("resta los pagos de los consumos", () => {
        const movs = [
            mov({ direction: "CHARGE", amount: 405 }),
            mov({ direction: "CHARGE", amount: 186.4 }),
            mov({ direction: "PAYMENT", amount: 100 }),
        ];
        expect(computeCardDebt(movs)).toBe(491.4);
    });

    it("ignora las líneas de cuenta", () => {
        expect(computeCardDebt([mov({ direction: "OUT", amount: 80 })])).toBe(0);
    });
});

describe("computeAvailableCredit", () => {
    it("resta la deuda del cupo", () => {
        expect(computeAvailableCredit(3000, 842.15)).toBe(2157.85);
    });

    it("devuelve null cuando no hay cupo declarado", () => {
        expect(computeAvailableCredit(null, 842.15)).toBeNull();
    });
});

describe("computeStatementDue", () => {
    const base: BankCardStatement = {
        id: "st", ownerUserId: "u", cardId: "c",
        periodStart: "2026-07-21", periodEnd: "2026-08-20", dueDate: "2026-08-28",
        computedAmount: 611.4, totalAmount: null, paidAmount: 0, status: "OPEN",
        createdAt: "", updatedAt: "", isDeleted: false,
    };

    it("usa el calculado cuando el banco no declaró total", () => {
        expect(computeStatementDue(base)).toBe(611.4);
    });

    it("el total declarado por el banco manda sobre el calculado", () => {
        expect(computeStatementDue({ ...base, totalAmount: 658.9 })).toBe(658.9);
    });

    it("descuenta lo ya pagado", () => {
        expect(computeStatementDue({ ...base, totalAmount: 658.9, paidAmount: 200 })).toBe(458.9);
    });
});

describe("runningBalances", () => {
    it("devuelve el saldo después de cada movimiento, del más reciente al más antiguo", () => {
        const movs = [
            mov({ date: "2026-08-12T00:00:00Z", direction: "OUT", amount: 96.41 }),
            mov({ date: "2026-08-11T00:00:00Z", direction: "IN", amount: 500 }),
        ];
        expect(runningBalances(2104.18, movs)).toEqual([2104.18, 2200.59]);
    });
});

describe("statementPeriodFor", () => {
    it("abre el período el día siguiente al corte anterior", () => {
        const p = statementPeriodFor(20, 28, new Date("2026-08-12T00:00:00Z"));
        expect(p.periodStart).toBe("2026-07-21");
        expect(p.periodEnd).toBe("2026-08-20");
        expect(p.dueDate).toBe("2026-08-28");
    });

    it("después del corte el período en curso es el siguiente", () => {
        const p = statementPeriodFor(20, 28, new Date("2026-08-25T00:00:00Z"));
        expect(p.periodStart).toBe("2026-08-21");
        expect(p.periodEnd).toBe("2026-09-20");
        expect(p.dueDate).toBe("2026-09-28");
    });

    it("recorta el día de corte a meses cortos", () => {
        const p = statementPeriodFor(31, 5, new Date("2026-02-15T00:00:00Z"));
        expect(p.periodEnd).toBe("2026-02-28");
    });

    it("cuando el día de pago cae antes que el de corte, vence el mes siguiente", () => {
        const p = statementPeriodFor(20, 5, new Date("2026-08-12T00:00:00Z"));
        expect(p.periodEnd).toBe("2026-08-20");
        expect(p.dueDate).toBe("2026-09-05");
    });
});
