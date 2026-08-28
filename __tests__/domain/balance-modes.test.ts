import { computeNetBalance, sumCreditExpenses } from "@/domain/services/financial-balance";
import { resolveScope } from "@/domain/services/balance-scope";
import type { BalanceScopeRule } from "@/domain/entities/balance";

describe("computeNetBalance con scope", () => {
    const targets = {
        accounts: [
            { id: "acc-in", institutionId: "inst-in" },
            { id: "acc-out", institutionId: "inst-out" },
            // Segunda cuenta excluida (mismo banco), para probar una
            // transferencia entre DOS cuentas excluidas sin reusar la misma.
            { id: "acc-out2", institutionId: "inst-out" },
        ],
        cards: [
            { id: "card-in", institutionId: "inst-in" },
            { id: "card-out", institutionId: "inst-out" },
        ],
    };

    const excluirInstOut: BalanceScopeRule[] = [{
        id: "r1",
        ownerUserId: "user-1",
        targetType: "INSTITUTION",
        targetId: "inst-out",
        included: false,
        createdAt: "2026-08-27T00:00:00Z",
        updatedAt: "2026-08-27T00:00:00Z",
        isDeleted: false,
    }];

    const scope = resolveScope(excluirInstOut, targets);

    it("sin scope se comporta igual que antes", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null, bankDestinationAccountId: "acc-out" },
            { type: "EXPENSE" as const, amount: 300, categoryId: null, bankSourceAccountId: "acc-out" },
        ];

        expect(computeNetBalance(txs)).toBe(700);
    });

    it("ignora las transacciones ligadas a algo excluido", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null, bankDestinationAccountId: "acc-in" },
            { type: "INCOME" as const, amount: 500, categoryId: null, bankDestinationAccountId: "acc-out" },
            { type: "EXPENSE" as const, amount: 300, categoryId: null, bankSourceAccountId: "acc-in" },
            { type: "EXPENSE" as const, amount: 200, categoryId: null, bankSourceAccountId: "acc-out" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(700);
    });

    it("cuenta las transacciones huérfanas aunque el scope filtre", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null },
            { type: "EXPENSE" as const, amount: 250, categoryId: null },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(750);
    });

    it("una transferencia hacia una cuenta excluida sale del balance", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-in", bankDestinationAccountId: "acc-out" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(-400);
    });

    it("una transferencia desde una cuenta excluida entra al balance", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-out", bankDestinationAccountId: "acc-in" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(400);
    });

    it("una transferencia entre dos cuentas incluidas es neutra", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-in", bankDestinationAccountId: "acc-in" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(0);
    });

    it("la categoría manda sobre el scope: ahorros resta una sola vez", () => {
        const txs = [
            {
                type: "TRANSFER" as const,
                amount: 400,
                categoryId: null,
                categoryName: "Ahorros e Inversiones",
                bankSourceAccountId: "acc-in",
                bankDestinationAccountId: "acc-out",
            },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(-400);
    });

    it("la categoría manda sobre el scope: fondeo entra una sola vez (simétrico al de ahorros)", () => {
        const txs = [
            {
                type: "TRANSFER" as const,
                amount: 400,
                categoryId: null,
                categoryName: "Fondeo ingresos",
                bankSourceAccountId: "acc-in",
                bankDestinationAccountId: "acc-out",
            },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(400);
    });

    it("una transferencia entre dos cuentas excluidas es neutra", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-out", bankDestinationAccountId: "acc-out2" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(0);
    });

    it("un consumo con tarjeta excluida no aparece por ningún lado", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null },
            { type: "EXPENSE" as const, amount: 50, categoryId: null, paidWithCredit: true, bankCardId: "card-in" },
            { type: "EXPENSE" as const, amount: 80, categoryId: null, paidWithCredit: true, bankCardId: "card-out" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(1000);
        expect(sumCreditExpenses(txs, scope)).toBe(50);
    });

    it("sumCreditExpenses sin scope cuenta todos los consumos", () => {
        const txs = [
            { type: "EXPENSE" as const, amount: 50, categoryId: null, paidWithCredit: true, bankCardId: "card-in" },
            { type: "EXPENSE" as const, amount: 80, categoryId: null, paidWithCredit: true, bankCardId: "card-out" },
        ];

        expect(sumCreditExpenses(txs)).toBe(130);
    });
});
