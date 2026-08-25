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

const SCAN_ITEM_WITH_ACCOUNTS: FinancialScannerTransaction = {
    id: "scan-item-2",
    ownerUserId: "user-1",
    amount: 25.0,
    currency: "USD",
    merchant: "BANCO PICHINCHA",
    date: now,
    type: "TRANSFER",
    category: "Transferencias",
    description: "Transferencia directa enviada",
    summary: "Transferencia de $25.00 a Juan Pérez con Visa",
    accounts: [
        { type: "origen", account: "4234567890126287" },
        { type: "destino", account: "5134567890123159" },
    ],
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

        // When accounts are absent, badges are omitted
        expect(screen.queryByText(/ORIGEN/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/DESTINO/i)).not.toBeInTheDocument();

        // Tap the card to open detail form
        const cardLink = titleEl.closest("[role='link']")!;
        fireEvent.click(cardLink);

        expect(mockPush).toHaveBeenCalledWith("/financial/scans/scan-item-1");
    });

    it("renders origin and destination accounts and brand badges when present", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM_WITH_ACCOUNTS],
        });

        render(<FinancialInbox />);

        expect(await screen.findByText("Transferencia directa enviada")).toBeInTheDocument();
        expect(screen.getByTitle("Origen")).toBeInTheDocument();
        expect(screen.getByText("**** 6287")).toBeInTheDocument();
        expect(screen.getByTitle("Destino")).toBeInTheDocument();
        expect(screen.getByText("**** 3159")).toBeInTheDocument();
        expect(screen.getByText("MIA")).toBeInTheDocument();
        expect(screen.getByText("TER")).toBeInTheDocument();
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

    it("approves/confirms a scan transaction directly via quick action button without navigating", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM],
        });
        (mapInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });

        render(<FinancialInbox />);

        const approveButton = await screen.findByTitle("Aprobar");
        fireEvent.click(approveButton);

        await waitFor(() => expect(mapInboxTransactionAction).toHaveBeenCalledTimes(1));
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("rejects/discards a scan transaction directly via quick action button without navigating", async () => {
        (getUnprocessedInboxTransactionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: [SCAN_ITEM],
        });
        (dismissInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });

        render(<FinancialInbox />);

        const rejectButton = await screen.findByTitle("Rechazar");
        fireEvent.click(rejectButton);

        await waitFor(() => expect(dismissInboxTransactionAction).toHaveBeenCalledWith("scan-item-1"));
        expect(mockPush).not.toHaveBeenCalled();
    });
});
