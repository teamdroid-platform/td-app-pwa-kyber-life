import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRouter, usePathname } from "next/navigation";
import { TransactionCard } from "@/presentation/financial/components/TransactionCard";
import type { FinancialTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
    usePathname: jest.fn().mockReturnValue("/financial/transactions"),
}));

const TRANSACTION: FinancialTransaction = {
    id: "tx-1",
    ownerUserId: "user-1",
    amount: 75.34,
    currency: "USD",
    type: "EXPENSE",
    status: "CONFIRMED",
    description: "FeelTheTickets",
    merchant: "FeelTheTickets",
    categoryName: "Conciertos",
    date: "2026-08-20T19:42:00.000Z",
    summary: "Compra de entradas para concierto",
    notes: "2 entradas VIP",
    createdAt: "2026-08-20T19:42:00.000Z",
    updatedAt: "2026-08-20T19:42:00.000Z",
    isDeleted: false,
};

describe("TransactionCard", () => {
    const mockPush = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
        (usePathname as jest.Mock).mockReturnValue("/financial/transactions");
    });

    it("navigates to the detail screen on card click", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        const header = screen.getByRole("link");
        fireEvent.click(header);

        expect(mockPush).toHaveBeenCalledWith("/financial/transactions/tx-1");
    });

    it("navigates to the detail screen on Enter key press", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        const header = screen.getByRole("link");
        fireEvent.keyDown(header, { key: "Enter" });

        expect(mockPush).toHaveBeenCalledWith("/financial/transactions/tx-1");
    });

    it("renders the transaction essential details directly on the card", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        expect(screen.getAllByText("FeelTheTickets").length).toBeGreaterThan(0);
        expect(screen.getByText("Conciertos")).toBeInTheDocument();
        // The inline summary is gone; its content lives on the detail screen.
        expect(screen.queryByText("Resumen")).not.toBeInTheDocument();
    });

    it("renders the TC badge when paidWithCredit is true", () => {
        render(<TransactionCard transaction={{ ...TRANSACTION, paidWithCredit: true }} />);

        expect(screen.getByTitle(/Pagado con tarjeta de crédito/i)).toBeInTheDocument();
        expect(screen.getByText("TC")).toBeInTheDocument();
    });

    it("renders the TC badge when paidWithCredit is unset (undefined) and details contain credit card keywords", () => {
        render(<TransactionCard transaction={{
            ...TRANSACTION,
            paidWithCredit: undefined,
            description: "Consumo en KYWI",
            notes: "Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
        }} />);

        expect(screen.getByTitle(/Pagado con tarjeta de crédito/i)).toBeInTheDocument();
        expect(screen.getByText("TC")).toBeInTheDocument();
    });

    it("does NOT render the TC badge when paidWithCredit is explicitly false even if text has keywords", () => {
        render(<TransactionCard transaction={{
            ...TRANSACTION,
            paidWithCredit: false,
            description: "Consumo en KYWI",
            notes: "Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
        }} />);

        expect(screen.queryByText("TC")).not.toBeInTheDocument();
    });

    it("does not render the TC badge for regular debit transactions", () => {
        render(<TransactionCard transaction={{
            ...TRANSACTION,
            paidWithCredit: false,
            description: "Compra de combustible",
            notes: "Pago con débito directo",
        }} />);

        expect(screen.queryByText("TC")).not.toBeInTheDocument();
    });
});
