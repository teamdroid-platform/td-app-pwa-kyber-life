import { BalanceService } from "@/application/services/balance-service";
import { FinancialDashboardService } from "@/application/services/financial-dashboard-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

/**
 * Sin ninguna regla de alcance, el balance del periodo tiene que dar
 * exactamente el `netBalance` que la app mostraba antes de este trabajo. Es la
 * red que garantiza que configurar nada no mueve ningún número.
 */
describe("paridad entre BalanceService y los KPIs del dashboard", () => {
    const userId = "user-1";

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
        { ...base, id: "1", type: "INCOME", amount: 5000, bankDestinationAccountId: "acc-1" },
        { ...base, id: "2", amount: 236.4, bankSourceAccountId: "acc-1", description: "Pago de tarjeta de crédito" },
        { ...base, id: "3", amount: 42.15, bankSourceAccountId: "acc-1" },
        { ...base, id: "4", amount: 186.5, paidWithCredit: true, bankCardId: "card-1" },
        { ...base, id: "5", type: "WITHDRAWAL", amount: 100, bankSourceAccountId: "acc-1" },
    ];

    const accounts = [{ id: "acc-1", institutionId: "inst-1", accountType: "SAVINGS", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" }];
    const cards = [{ id: "card-1", institutionId: "inst-1", cardType: "CREDIT", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" }];

    it("el balance del periodo iguala al netBalance de los KPIs", async () => {
        const transactionRepo = {
            findForDashboard: jest.fn().mockResolvedValue(transactions),
            findByOwnerId: jest.fn().mockResolvedValue(transactions),
        } as any;
        const categoryRepo = { findAllBaseAndUser: jest.fn().mockResolvedValue([]) } as any;
        const cardRepo = { findByOwnerId: jest.fn().mockResolvedValue(cards) } as any;

        const dashboard = new FinancialDashboardService(
            transactionRepo, categoryRepo,
            { findByOwnerId: jest.fn().mockResolvedValue([]) } as any,
            undefined, cardRepo,
        );
        const balance = new BalanceService(
            transactionRepo,
            { findByOwnerId: jest.fn().mockResolvedValue(accounts) } as any,
            cardRepo,
            { findAllForOwner: jest.fn().mockResolvedValue([]) } as any,
            { findLatestForAccount: jest.fn().mockResolvedValue(null) } as any,
            categoryRepo,
            { getSettings: jest.fn().mockResolvedValue(null), getRules: jest.fn().mockResolvedValue([]) } as any,
        );

        const kpis = await dashboard.getKPIs(userId);
        const set = await balance.getBalanceSet(userId, {});

        expect(set.period.value).toBe(kpis.netBalance);
        expect(set.withCredit.value).toBe(kpis.netBalance - kpis.totalExpensesCredit);
    });
});
