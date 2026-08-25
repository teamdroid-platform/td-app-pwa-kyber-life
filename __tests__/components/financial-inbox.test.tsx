import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FinancialInbox } from "@/presentation/financial/components/FinancialInbox";
import {
    getUnprocessedInboxTransactionsAction,
    mapInboxTransactionAction,
    dismissInboxTransactionAction,
} from "@/app/actions/financial-inbox";
import { getInstitutionsAction } from "@/app/actions/financial-settings";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
    useSearchParams: jest.fn(),
}));

jest.mock("@/app/actions/financial-inbox", () => ({
    getUnprocessedInboxTransactionsAction: jest.fn(),
    mapInboxTransactionAction: jest.fn(),
    dismissInboxTransactionAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-settings", () => ({
    getInstitutionsAction: jest.fn(),
}));

jest.mock("@/presentation/financial/hooks/useFinancialRealtime", () => ({
    useFinancialRealtime: jest.fn(() => ({ isPollingFallback: false })),
}));

const now = "2026-08-20T12:37:00.000Z";

const SCAN_ITEM: FinancialScannerTransaction = {
    id: "scan-item-1",
    ownerUserId: "user-1",
    amount: 6.99,
    currency: "USD",
    merchant: "MOTES DE LA MAGDALENA",
    date: now,
    type: "EXPENSE",
    category: "Alimentación",
    description: "Compra en establecimiento comercial",
    summary: "Consumo de $6.99 en MOTES DE LA MAGDALENA",
    originStats: { origin: "email", subject: "Consumo" },
    status: "DETECTED",
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
};

describe("FinancialInbox", () => {
    const mockPush = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
        (useSearchParams as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(null),
        });
        (getInstitutionsAction as jest.Mock).mockResolvedValue([]);
    });

    it("displays the RobotLoader with 'Cargando datos...' while fetching transactions", () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockReturnValue(new Promise(() => {}));

        render(<FinancialInbox />);

        expect(screen.getByText("Cargando datos...")).toBeInTheDocument();
        expect(screen.getByAltText("KyberLife")).toBeInTheDocument();
    });

    it("renders empty state when there are no scan items", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [],
        });

        render(<FinancialInbox />);

        expect(await screen.findByText("Bandeja al día")).toBeInTheDocument();
        expect(screen.getByText(/No hay escaneos pendientes por revisar/i)).toBeInTheDocument();
    });

    it("renders scan transactions and navigates to the detail form on card tap", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM],
        });

        render(<FinancialInbox />);

        const titleEl = await screen.findByText("Compra en establecimiento comercial");
        expect(screen.getByText("MOTES DE LA MAGDALENA")).toBeInTheDocument();
        expect(screen.getByText("Alimentación")).toBeInTheDocument();

        // Eye icon is no longer present
        expect(screen.queryByText("Detalles")).not.toBeInTheDocument();

        // Tap the card to open detail form
        const cardLink = titleEl.closest("[role='link']")!;
        fireEvent.click(cardLink);

        expect(mockPush).toHaveBeenCalledWith("/financial/scans/scan-item-1");
    });

    it("opens the detail form via Enter key", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM],
        });

        render(<FinancialInbox />);

        const titleEl = await screen.findByText("Compra en establecimiento comercial");
        const cardLink = titleEl.closest("[role='link']")!;
        fireEvent.keyDown(cardLink, { key: "Enter" });

        expect(mockPush).toHaveBeenCalledWith("/financial/scans/scan-item-1");
    });

    it("confirms a scan transaction directly via quick action button without navigating", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM],
        });
        (mapInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });

        render(<FinancialInbox />);

        const confirmButton = await screen.findByTitle("Confirmar");
        fireEvent.click(confirmButton);

        await waitFor(() => expect(mapInboxTransactionAction).toHaveBeenCalledTimes(1));
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("discards a scan transaction directly via quick action button without navigating", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM],
        });
        (dismissInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });

        render(<FinancialInbox />);

        const discardButton = await screen.findByTitle("Descartar");
        fireEvent.click(discardButton);

        await waitFor(() => expect(dismissInboxTransactionAction).toHaveBeenCalledWith("scan-item-1"));
        expect(mockPush).not.toHaveBeenCalled();
    });
});
