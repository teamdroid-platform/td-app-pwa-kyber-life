import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransactionScanWizard } from "@/presentation/financial/components/transaction-wizard/TransactionScanWizard";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import { getUniqueTagsAction, getRecentDescriptionsAction } from "@/app/actions/financial-transactions";
import { mapInboxTransactionAction, dismissInboxTransactionAction } from "@/app/actions/financial-inbox";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
    useRouter: jest.fn(() => ({ replace, push: jest.fn(), refresh: jest.fn() })),
}));

jest.mock("@/app/actions/financial-inbox", () => ({
    mapInboxTransactionAction: jest.fn(),
    dismissInboxTransactionAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    getUniqueTagsAction: jest.fn(),
    getRecentDescriptionsAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-settings", () => ({
    getTransactionFormOptionsAction: jest.fn(),
    updateInstitutionAction: jest.fn(),
    createInstitutionAction: jest.fn(),
    createCategoryAction: jest.fn(),
}));

jest.mock("@/infrastructure/offline/financial-offline-store", () => ({
    financialOfflineStore: {
        drafts: { getAll: jest.fn().mockResolvedValue([]), add: jest.fn(), clear: jest.fn(), remove: jest.fn() },
    },
}));

const now = new Date().toISOString();

const scanned: FinancialScannerTransaction = {
    id: "scan-1",
    ownerUserId: "user-1",
    executionId: "exec-9",
    hash: "abc123",
    amount: 47.9,
    currency: "USD",
    merchant: "SUPERMAXI*QUITO",
    date: "2026-07-28T19:40:00.000Z",
    type: "EXPENSE",
    category: "Supermercado",
    description: "Compra semanal",
    summary: "Consumo con tarjeta VISA en SUPERMAXI",
    originStats: { origin: "email", subject: "Notificación de consumo" },
    status: "DETECTED",
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
};

function renderScanWizard(overrides: Partial<FinancialScannerTransaction> = {}) {
    render(
        <TransactionScanWizard
            initialData={{ ...scanned, ...overrides }}
            resolvedInstitutionName="Supermaxi"
        />,
    );
}

const openSummary = async () => fireEvent.click(await screen.findByRole("button", { name: /Resumen/i }));

beforeEach(() => {
    jest.clearAllMocks();
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: [], accounts: [], categories: [], institutionTypes: [] },
    });
    (getUniqueTagsAction as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (getRecentDescriptionsAction as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (mapInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });
    (dismissInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });
});

describe("TransactionScanWizard", () => {
    it("starts from the scanned values, with the institution already resolved", async () => {
        renderScanWizard();

        expect(await screen.findByPlaceholderText("Ej. Compra semanal")).toHaveValue("Compra semanal");
        expect(screen.getByPlaceholderText("0.00")).toHaveValue(47.9);
    });

    it("seeds the notes from the scan's summary and never auto-generates over them", async () => {
        renderScanWizard();
        await openSummary();

        expect(await screen.findByText("Consumo con tarjeta VISA en SUPERMAXI")).toBeInTheDocument();
        expect(screen.getByText("Notas · del correo")).toBeInTheDocument();
        expect(screen.queryByText(/Registro de gasto por/)).not.toBeInTheDocument();
    });

    it("falls back to the email body when the scan carries no summary", async () => {
        renderScanWizard({
            summary: null,
            originStats: { origin: "email", emailBody: "Su consumo fue de USD 47.90" },
        });
        await openSummary();

        expect(await screen.findByText(/\[MAIL\] Su consumo fue de USD 47\.90/)).toBeInTheDocument();
    });

    it("keeps the originally extracted data consultable on the summary", async () => {
        renderScanWizard();
        await openSummary();

        expect(await screen.findByText("Datos originales extraídos")).toBeInTheDocument();
        expect(screen.getByText("47.9 USD")).toBeInTheDocument();
        expect(screen.getByText("abc123")).toBeInTheDocument();
    });

    it("confirms through the inbox action with the reviewed values", async () => {
        renderScanWizard();
        await openSummary();

        fireEvent.click(await screen.findByRole("button", { name: /Confirmar/i }));

        await waitFor(() => expect(mapInboxTransactionAction).toHaveBeenCalledTimes(1));
        expect(mapInboxTransactionAction).toHaveBeenCalledWith(expect.objectContaining({
            scannerTransactionId: "scan-1",
            description: "Compra semanal",
            // The resolved institution wins over the raw merchant, as before.
            institutionName: "Supermaxi",
            merchant: "Supermaxi",
            amount: 47.9,
        }));
    });

    it("discards the record after confirming the intent", async () => {
        window.confirm = jest.fn(() => true);
        renderScanWizard();
        await openSummary();

        fireEvent.click(await screen.findByRole("button", { name: /Descartar/i }));

        await waitFor(() => expect(dismissInboxTransactionAction).toHaveBeenCalledWith("scan-1"));
    });

    it("does not discard when the confirmation is cancelled", async () => {
        window.confirm = jest.fn(() => false);
        renderScanWizard();
        await openSummary();

        fireEvent.click(await screen.findByRole("button", { name: /Descartar/i }));

        expect(dismissInboxTransactionAction).not.toHaveBeenCalled();
    });
});
