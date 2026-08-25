import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { TransactionCard } from "@/presentation/financial/components/TransactionCard";
import type { FinancialTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
    usePathname: jest.fn(() => "/financial/transactions"),
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    reviewTransactionAction: jest.fn(),
    archiveTransactionAction: jest.fn(),
    softDeleteTransactionAction: jest.fn(),
}));

const now = "2026-07-28T19:42:00.000Z";

const TRANSACTION = {
    id: "tx-1",
    ownerUserId: "user-1",
    type: "EXPENSE",
    status: "CONFIRMED",
    amount: 75.34,
    currency: "USD",
    merchant: "FeelTheTickets",
    institutionName: "FeelTheTickets",
    categoryName: "Conciertos",
    tags: [],
    description: "Pago comisiones concierto The Strokes",
    notes: "Compra con tarjeta en el sitio del evento",
    possibleDuplicate: false,
    isDeleted: false,
    paidWithCredit: false,
    date: now,
    createdAt: now,
    updatedAt: now,
} as unknown as FinancialTransaction;

const push = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push, refresh: jest.fn() });
});

/**
 * A tap on the row used to expand an inline summary while a small eye icon did
 * the navigation — two behaviours competing for the same tap. Now the row is
 * the link.
 */
describe("TransactionCard", () => {
    it("opens the transaction when the row is tapped", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        fireEvent.click(screen.getByText("Pago comisiones concierto The Strokes"));

        expect(push).toHaveBeenCalledWith("/financial/transactions/tx-1");
    });

    it("opens it from the keyboard too", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        fireEvent.keyDown(screen.getByRole("link"), { key: "Enter" });

        expect(push).toHaveBeenCalledWith("/financial/transactions/tx-1");
    });

    it("no longer carries a separate eye action", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        expect(screen.queryByText("Detalles")).not.toBeInTheDocument();
    });

    it("does not navigate when the options menu is used", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        fireEvent.click(screen.getByRole("button", { name: /Opciones/i }));

        expect(push).not.toHaveBeenCalled();
    });

    it("says it heard the tap while the detail screen loads", () => {
        render(<TransactionCard transaction={TRANSACTION} />);
        const row = screen.getByRole("link");

        expect(row).toHaveAttribute("aria-busy", "false");

        fireEvent.click(row);

        // The silence was why the row got tapped repeatedly.
        expect(row).toHaveAttribute("aria-busy", "true");
    });

    it("ignores further taps while it is already opening", () => {
        render(<TransactionCard transaction={TRANSACTION} />);
        const row = screen.getByRole("link");

        fireEvent.click(row);
        fireEvent.click(row);
        fireEvent.click(row);

        expect(push).toHaveBeenCalledTimes(1);
    });

    it("shows what the row is about without expanding anything", () => {
        render(<TransactionCard transaction={TRANSACTION} />);

        expect(screen.getByText("FeelTheTickets")).toBeInTheDocument();
        expect(screen.getByText("Conciertos")).toBeInTheDocument();
        // The inline summary is gone; its content lives on the detail screen.
        expect(screen.queryByText("Resumen")).not.toBeInTheDocument();
    });

    it("renders the TC badge when paidWithCredit is true", () => {
        render(<TransactionCard transaction={{ ...TRANSACTION, paidWithCredit: true }} />);

        expect(screen.getByTitle(/Pagado con tarjeta de crédito/i)).toBeInTheDocument();
        expect(screen.getByText("TC")).toBeInTheDocument();
    });

    it("renders the TC badge when transaction details contain credit card keywords even if paidWithCredit is false", () => {
        render(<TransactionCard transaction={{
            ...TRANSACTION,
            paidWithCredit: false,
            description: "Consumo en KYWI",
            notes: "Pago realizado en KYWI con tarjeta de crédito, correspondiente al gasto por productos adquiridos.",
        }} />);

        expect(screen.getByTitle(/Pagado con tarjeta de crédito/i)).toBeInTheDocument();
        expect(screen.getByText("TC")).toBeInTheDocument();
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
