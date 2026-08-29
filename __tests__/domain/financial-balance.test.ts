import { computeNetBalance, sumCreditExpenses, transactionTypeBucket } from "@/domain/services/financial-balance";
import type { BalanceScope } from "@/domain/services/balance-scope";
import type { FinancialTransaction } from "@/domain/entities/financial";

type Tx = Pick<
    FinancialTransaction,
    "type" | "amount" | "paidWithCredit" | "categoryName"
    | "bankSourceAccountId" | "bankDestinationAccountId"
>;

const income = (amount: number): Tx => ({ type: "INCOME", amount, paidWithCredit: false });
const cashExpense = (amount: number): Tx => ({ type: "EXPENSE", amount, paidWithCredit: false });
const creditExpense = (amount: number): Tx => ({ type: "EXPENSE", amount, paidWithCredit: true });
const withdrawal = (amount: number): Tx => ({ type: "WITHDRAWAL", amount, paidWithCredit: false });

describe("financial-balance", () => {
    describe("computeNetBalance defers credit-card expenses", () => {
        it("excludes paidWithCredit expenses from the balance", () => {
            const txs = [income(1000), cashExpense(200), creditExpense(300)];
            // 1000 - 200 = 800 (the 300 on credit is deferred).
            expect(computeNetBalance(txs)).toBe(800);
        });
    });

    describe("sumCreditExpenses", () => {
        it("sums only expense-like transactions paid with credit", () => {
            const txs = [income(1000), cashExpense(200), creditExpense(300), creditExpense(28.64)];
            expect(sumCreditExpenses(txs)).toBe(328.64);
        });

        it("ignores income, withdrawals and transfers even if flagged", () => {
            const txs: Tx[] = [
                { type: "INCOME", amount: 500, paidWithCredit: true },
                { type: "WITHDRAWAL", amount: 100, paidWithCredit: true },
                { type: "TRANSFER", amount: 50, paidWithCredit: true },
                creditExpense(40),
            ];
            expect(sumCreditExpenses(txs)).toBe(40);
        });

        it("returns 0 when there is no credit spending", () => {
            expect(sumCreditExpenses([income(1000), cashExpense(200), withdrawal(50)])).toBe(0);
        });
    });

    describe("transactionTypeBucket", () => {
        it("maps raw types to the four coarse buckets", () => {
            expect(transactionTypeBucket("INCOME")).toBe("income");
            expect(transactionTypeBucket("DEPOSIT")).toBe("income");
            expect(transactionTypeBucket("REFUND")).toBe("income");
            expect(transactionTypeBucket("WITHDRAWAL")).toBe("withdrawal");
            expect(transactionTypeBucket("TRANSFER")).toBe("transfer");
            expect(transactionTypeBucket("OTHER")).toBe("transfer");
            expect(transactionTypeBucket("EXPENSE")).toBe("expense");
            expect(transactionTypeBucket("PAYMENT")).toBe("expense");
            expect(transactionTypeBucket("FEE")).toBe("expense");
            expect(transactionTypeBucket("TAX")).toBe("expense");
        });
    });

    describe("balance with the credit toggle (net − credit)", () => {
        it("subtracting sumCreditExpenses yields the balance including credit", () => {
            const txs = [income(1000), cashExpense(200), creditExpense(300)];
            const deferred = computeNetBalance(txs); // 800
            const withCredit = deferred - sumCreditExpenses(txs); // 800 - 300
            expect(withCredit).toBe(500);
        });
    });

    describe("transferencias que cruzan el borde del presupuesto", () => {
        /** Las cuentas que empiezan por «fuera» están excluidas; el resto entra. */
        const scope: BalanceScope = {
            isAccountIncluded: id => !String(id ?? "").startsWith("fuera"),
            isCardIncluded: () => true,
            isTransactionIncluded: () => true,
            isUnrestricted: false,
        };

        const transfer = (amount: number, from?: string | null, to?: string | null): Tx => ({
            type: "TRANSFER", amount, paidWithCredit: false,
            bankSourceAccountId: from ?? null,
            bankDestinationAccountId: to ?? null,
        });

        it("sale del presupuesto: resta", () => {
            expect(computeNetBalance([transfer(500, "dentro", "fuera")], undefined, scope)).toBe(-500);
        });

        it("vuelve al presupuesto: suma", () => {
            expect(computeNetBalance([transfer(500, "fuera", "dentro")], undefined, scope)).toBe(500);
        });

        it("entre dos cuentas del mismo lado: neutra", () => {
            expect(computeNetBalance([transfer(500, "dentro", "otra")], undefined, scope)).toBe(0);
            expect(computeNetBalance([transfer(500, "fuera", "fuera2")], undefined, scope)).toBe(0);
        });

        // El caso que inflaba el balance: un anticipo que salió de una cuenta
        // excluida hacia un tercero sin registrar. Sin destino no hay evidencia
        // de que el dinero entrara al presupuesto, y se leía como que sí.
        it("sin destino conocido no suma, aunque el origen esté excluido", () => {
            expect(computeNetBalance([transfer(32000, "fuera", null)], undefined, scope)).toBe(0);
        });

        it("sin origen conocido tampoco resta", () => {
            expect(computeNetBalance([transfer(32000, null, "fuera")], undefined, scope)).toBe(0);
        });

        it("la categoría sigue mandando sobre el scope", () => {
            const ahorro: Tx = {
                ...transfer(200, "fuera", "dentro"), categoryName: "Ahorros e Inversiones",
            };
            expect(computeNetBalance([ahorro], undefined, scope)).toBe(-200);
        });
    });
});
