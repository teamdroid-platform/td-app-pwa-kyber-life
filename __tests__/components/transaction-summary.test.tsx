import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionSummary } from "@/presentation/financial/components/TransactionSummary";
import type { FinancialTransaction } from "@/domain/entities/financial";
import type { BalanceSet } from "@/application/services/balance-service";

/**
 * The list shows every transaction that isn't deleted or archived, so pending
 * scanner detections, rejected and duplicate rows reach this summary too. They
 * are not real money: counting them made this balance drift from the financial
 * overview, which only ever counts CONFIRMED / REVIEWED / MANUAL.
 */
describe("TransactionSummary", () => {
    const base: Omit<FinancialTransaction, "id"> = {
        ownerUserId: "user-1",
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

    it("leaves pending, rejected and duplicate rows out of the balance", () => {
        const transactions: FinancialTransaction[] = [
            { ...base, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
            { ...base, id: "2", amount: 100, status: "MANUAL" },
            { ...base, id: "3", amount: 500, status: "DETECTED" },
            { ...base, id: "4", amount: 700, status: "REJECTED" },
            { ...base, id: "5", amount: 300, status: "DUPLICATE" },
        ];

        render(<TransactionSummary transactions={transactions} />);

        // 1000 - 100; the other three statuses are listed but never counted.
        expect(screen.getAllByText("+$900,00").length).toBeGreaterThan(0);
    });

    it("counts REVIEWED alongside CONFIRMED and MANUAL", () => {
        const transactions: FinancialTransaction[] = [
            { ...base, id: "1", type: "INCOME", amount: 1000, status: "REVIEWED" },
            { ...base, id: "2", amount: 250, status: "CONFIRMED" },
        ];

        render(<TransactionSummary transactions={transactions} />);

        expect(screen.getAllByText("+$750,00").length).toBeGreaterThan(0);
    });

    it("sin balances sigue calculando el balance localmente", () => {
        render(<TransactionSummary transactions={[
            { ...base, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
            { ...base, id: "2", amount: 100, status: "MANUAL" },
        ]} />);

        expect(screen.getAllByText("+$900,00").length).toBeGreaterThan(0);
    });

    // El chip "Balance" del listado, con `balances`: debe leer el valor del
    // modo activo (no volver a calcular localmente) y actualizarse cuando el
    // usuario cambia de modo — esta es la única ruta del selector que este
    // archivo no cubría (ver también balance-mode-switch.test.tsx).
    describe("con balances", () => {
        const balances: BalanceSet = {
            defaultMode: "PERIOD",
            currency: "USD",
            total: { value: 5000, accountsCounted: 2, accountsWithoutSnapshot: [], creditDebt: 0 },
            period: { value: 900, income: 1000, expenses: 100, savings: 0, funding: 0, excludedCount: 0 },
            withCredit: { value: 850, creditDeferred: 50 },
        };
        const transactions: FinancialTransaction[] = [
            { ...base, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
        ];

        it("el chip muestra el valor del modo activo (PERIOD por defecto)", () => {
            render(<TransactionSummary transactions={transactions} balances={balances} rangeLabel="rango" />);

            // period.value, no el balance calculado localmente (que sería +$1.000,00).
            expect(screen.getAllByText("+$900,00").length).toBeGreaterThan(0);
        });

        it("cambiar de modo en el selector cambia el valor del chip", () => {
            render(<TransactionSummary transactions={transactions} balances={balances} rangeLabel="rango" />);

            // Dos instancias del switch conviven en el DOM (móvil + escritorio,
            // solo una visible según el viewport vía CSS) — cualquiera sirve, y
            // el estado de modo está elevado a TransactionSummary, así que ambas
            // reflejan el cambio.
            const [trigger] = screen.getAllByRole("button", { name: /balance del periodo/i });
            fireEvent.pointerDown(trigger, { button: 0 });
            fireEvent.click(screen.getByRole("menuitemradio", { name: /total/i }));

            expect(screen.getAllByText("+$5.000,00").length).toBeGreaterThan(0);
            expect(screen.queryAllByText("+$900,00").length).toBe(0);
        });
    });
});
