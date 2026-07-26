import { computeNetBalance, sumCreditExpenses, transactionTypeBucket } from "@/domain/services/financial-balance";
import type { FinancialTransaction } from "@/domain/entities/financial";

type Tx = Pick<FinancialTransaction, "type" | "amount" | "paidWithCredit" | "categoryName">;

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
});
