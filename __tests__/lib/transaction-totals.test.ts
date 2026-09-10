import { transactionTotals, TRANSACTION_SIGN } from "@/presentation/financial/lib/transaction-totals";
import type { FinancialTransaction, FinancialTransactionType } from "@/domain/entities/financial";

/**
 * Los totales que la pantalla de transacciones muestra arriba.
 *
 * Se extrajeron de `TransactionSummary` para que la fila de KPIs de escritorio
 * y el panel plegable de móvil cuenten lo mismo: eran las mismas cifras
 * calculadas en un sitio, y duplicarlas era garantizar que un día divergieran.
 */
function tx(over: Partial<FinancialTransaction> = {}): FinancialTransaction {
    return {
        id: crypto.randomUUID(),
        ownerUserId: "user-1",
        amount: 100,
        currency: "USD",
        type: "EXPENSE" as FinancialTransactionType,
        status: "CONFIRMED",
        date: "2026-05-10T10:00:00Z",
        description: "Movimiento",
        categoryId: null,
        institutionId: null,
        merchant: null,
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: "2026-05-10T10:00:00Z",
        updatedAt: "2026-05-10T10:00:00Z",
        ...over,
    } as FinancialTransaction;
}

describe("transactionTotals", () => {
    it("reparte cada tipo en su cubo", () => {
        const totals = transactionTotals([
            tx({ type: "INCOME", amount: 500 }),
            tx({ type: "DEPOSIT", amount: 100 }),
            tx({ type: "EXPENSE", amount: 200 }),
            tx({ type: "FEE", amount: 50 }),
            tx({ type: "WITHDRAWAL", amount: 80 }),
            tx({ type: "TRANSFER", amount: 900 }),
        ]);

        expect(totals.income).toBe(600);
        expect(totals.expense).toBe(250);
        expect(totals.withdrawal).toBe(80);
        expect(totals.other).toBe(900);
    });

    it("deja el balance en ingresos menos gastos", () => {
        const totals = transactionTotals([
            tx({ type: "INCOME", amount: 500 }),
            tx({ type: "EXPENSE", amount: 120 }),
        ]);

        expect(totals.balance).toBe(380);
    });

    it("ignora las transacciones que no cuentan para los dashboards", () => {
        const totals = transactionTotals([
            tx({ type: "INCOME", amount: 500, status: "CONFIRMED" }),
            tx({ type: "INCOME", amount: 999, status: "REJECTED" }),
            tx({ type: "INCOME", amount: 999, status: "DETECTED" }),
        ]);

        expect(totals.income).toBe(500);
    });

    it("deja fuera lo pagado con tarjeta, que todavía no salió de la cuenta", () => {
        const totals = transactionTotals([
            tx({ type: "EXPENSE", amount: 200, paidWithCredit: false }),
            tx({ type: "EXPENSE", amount: 300, paidWithCredit: true }),
        ]);

        expect(totals.expense).toBe(200);
    });

    it("toma la moneda que más se repite", () => {
        const totals = transactionTotals([
            tx({ currency: "EUR" }),
            tx({ currency: "USD" }),
            tx({ currency: "USD" }),
        ]);

        expect(totals.currency).toBe("USD");
    });

    it("acumula una serie diaria por cubo, en orden cronológico", () => {
        const totals = transactionTotals([
            tx({ type: "EXPENSE", amount: 30, date: "2026-05-12T10:00:00Z" }),
            tx({ type: "EXPENSE", amount: 10, date: "2026-05-10T10:00:00Z" }),
            tx({ type: "EXPENSE", amount: 5, date: "2026-05-10T18:00:00Z" }),
            tx({ type: "INCOME", amount: 700, date: "2026-05-11T10:00:00Z" }),
        ]);

        // 10 y 11 y 12 de mayo: el 10 suma sus dos gastos, el 11 no tiene ninguno.
        expect(totals.series.expense).toEqual([15, 0, 30]);
        expect(totals.series.income).toEqual([0, 700, 0]);
    });

    it("no se cae con una lista vacía", () => {
        const totals = transactionTotals([]);

        expect(totals).toMatchObject({ balance: 0, income: 0, expense: 0, currency: "USD" });
        expect(totals.series.expense).toEqual([]);
    });
});

describe("TRANSACTION_SIGN", () => {
    it("clasifica los diez tipos, sin dejar ninguno fuera", () => {
        const types: FinancialTransactionType[] = [
            "EXPENSE", "INCOME", "TRANSFER", "PAYMENT", "REFUND",
            "WITHDRAWAL", "DEPOSIT", "FEE", "TAX", "OTHER",
        ];

        for (const type of types) {
            expect(TRANSACTION_SIGN[type]).toBeDefined();
        }
    });
});
