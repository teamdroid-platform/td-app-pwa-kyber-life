import { FinancialDashboardService } from "@/application/services/financial-dashboard-service";
import { FinancialTransactionService } from "@/application/services/financial-transaction-service";
import { computeNetBalance, sumCreditExpenses } from "@/domain/services/financial-balance";
import type { FinancialTransaction } from "@/domain/entities/financial";

/**
 * The transactions list and the financial overview must report the same balance
 * for the same rows.
 *
 * They used to disagree: the list runs every transaction through
 * `isTransactionPaidWithCredit` (which overrides a stored `false` when the
 * scanner text describes a credit-card purchase), while the dashboard read the
 * raw `paidWithCredit` column. Scanner-imported rows are stored with `false`, so
 * the list deferred them from the balance and the dashboard subtracted them —
 * and the dashboard's "Incluir TC" toggle moved almost nothing, because
 * `totalExpensesCredit` only ever counted the explicitly-flagged rows.
 */
describe("balance parity between the transactions list and the financial overview", () => {
    const userId = "user-parity";
    const CREDIT_CARD_ID = "card-credit";
    const DEBIT_CARD_ID = "card-debit";

    const base: Omit<FinancialTransaction, "id"> = {
        ownerUserId: userId,
        amount: 0,
        currency: "USD",
        date: "2026-08-23T10:00:00Z",
        type: "EXPENSE",
        status: "CONFIRMED",
        categoryId: null,
        institutionId: null,
        merchant: "Test",
        description: "Test",
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: "2026-08-23T10:00:00Z",
        updatedAt: "2026-08-23T10:00:00Z",
    };

    const transactions: FinancialTransaction[] = [
        { ...base, id: "1", type: "INCOME", amount: 5000 },
        // Scanner row: stored as cash, but the notes say it was a credit purchase.
        {
            ...base,
            id: "2",
            amount: 186.5,
            paidWithCredit: false,
            description: "Consumo en KYWI",
            notes: "Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
        },
        // Settling the card bill: real cash out, must stay in the balance.
        {
            ...base,
            id: "3",
            amount: 236.4,
            paidWithCredit: false,
            description: "Pago de tarjeta de crédito",
            notes: "Pago de $236.40 a su tarjeta de crédito desde la cuenta 10XXXXXX11.",
        },
        { ...base, id: "4", amount: 42.15, paidWithCredit: false, description: "Combustible" },
        { ...base, id: "5", amount: 9.96, paidWithCredit: true, description: "Suscripción" },
        // Linked to a CREDIT card with nothing in the text to give it away: only
        // the card's own type can classify it, on both screens.
        { ...base, id: "6", amount: 2.23, paidWithCredit: false, description: "Viaje en Uber", bankCardId: CREDIT_CARD_ID },
        // Linked to a DEBIT card while the text says credit — the card wins.
        {
            ...base,
            id: "7",
            amount: 11.99,
            paidWithCredit: false,
            description: "Cargo por suscripción mensual",
            notes: "Cargo recurrente de $11.99 en Netflix con tarjeta de crédito.",
            bankCardId: DEBIT_CARD_ID,
        },
    ];

    const cards = [
        { id: CREDIT_CARD_ID, cardType: "CREDIT" },
        { id: DEBIT_CARD_ID, cardType: "DEBIT" },
    ];

    async function listBalance() {
        const repo = {
            search: jest.fn().mockResolvedValue(transactions),
        } as any;
        const service = new FinancialTransactionService(
            repo,
            { create: jest.fn() } as any,
            undefined,
            undefined,
            undefined,
            { findByOwnerId: jest.fn().mockResolvedValue(cards) } as any,
        );
        // What the transactions list feeds to `TransactionSummary`.
        return service.searchAllFiltered(userId, {});
    }

    async function dashboardKpis() {
        const repo = {
            findForDashboard: jest.fn().mockResolvedValue(transactions),
            findByOwnerId: jest.fn().mockResolvedValue(transactions),
        } as any;
        const service = new FinancialDashboardService(
            repo,
            { findAllBaseAndUser: jest.fn().mockResolvedValue([]) } as any,
            { findByOwnerId: jest.fn().mockResolvedValue([]) } as any,
            undefined,
            { findByOwnerId: jest.fn().mockResolvedValue(cards) } as any,
        );
        return service.getKPIs(userId);
    }

    it("reports the same net balance on both screens", async () => {
        const listed = await listBalance();
        const kpis = await dashboardKpis();

        // 5000 - 236.40 (card bill) - 42.15 (fuel) - 11.99 (debit card); the three
        // credit consumptions (186.50 + 9.96 + 2.23) are deferred until their card
        // bill is logged.
        expect(computeNetBalance(listed)).toBe(4709.46);
        expect(kpis.netBalance).toBe(computeNetBalance(listed));
    });

    it("reports the same deferred credit total on both screens", async () => {
        const listed = await listBalance();
        const kpis = await dashboardKpis();

        expect(sumCreditExpenses(listed)).toBe(198.69);
        expect(kpis.totalExpensesCredit).toBe(sumCreditExpenses(listed));
    });

    it("moves the balance when 'Incluir TC' is on, by the same amount on both screens", async () => {
        const listed = await listBalance();
        const kpis = await dashboardKpis();

        // TransactionSummary's formula for the toggle ON.
        const listWithCredit = computeNetBalance(listed) - sumCreditExpenses(listed);

        expect(kpis.netBalance - kpis.totalExpensesCredit).toBe(listWithCredit);
        expect(listWithCredit).toBe(4510.77);
    });
});
