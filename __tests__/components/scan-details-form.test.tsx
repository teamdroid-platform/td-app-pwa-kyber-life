import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { ScanDetailsForm } from "@/presentation/financial/components/ScanDetailsForm";
import { mapInboxTransactionAction, dismissInboxTransactionAction } from "@/app/actions/financial-inbox";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import { getUniqueTagsAction } from "@/app/actions/financial-transactions";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
}));

// This suite covers the single-screen confirmation form, which is what renders
// with the wizard flag off. The stepped flow has its own suite.
jest.mock("@/lib/feature-flags", () => ({
    FINANCIAL_FLAGS: { WIZARD_ENABLED: false },
}));

jest.mock("@/app/actions/financial-inbox", () => ({
    mapInboxTransactionAction: jest.fn(),
    dismissInboxTransactionAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    getUniqueTagsAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-settings", () => ({
    getTransactionFormOptionsAction: jest.fn(),
    updateInstitutionAction: jest.fn(),
    createInstitutionAction: jest.fn(),
    createCategoryAction: jest.fn(),
}));

const now = new Date().toISOString();

const SCAN: FinancialScannerTransaction = {
    id: "scan-1",
    ownerUserId: "user-1",
    isDeleted: false,
    executionId: "LOCAL_abc123",
    hash: "19f3a91683224e55",
    amount: 224.19,
    currency: "USD",
    merchant: "TACA WEB USA PA VI",
    date: now,
    type: "EXPENSE",
    category: "Otros",
    description: "Consumo en TACA WEB USA PA VI",
    summary: "Se realizó un consumo de $224.19 en TACA WEB USA PA VI",
    originStats: { origin: "email", from: "servicios@bank.com", to: "user@gmail.com", subject: "Notificación de Consumos" },
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
};

async function renderForm() {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: [], accounts: [], categories: [], institutionTypes: [] },
    });
    (getUniqueTagsAction as jest.Mock).mockResolvedValue({ success: true, data: [] });

    render(<ScanDetailsForm initialData={SCAN} resolvedInstitutionName="TACA WEB USA PA VI" />);
    await waitFor(() => expect(getTransactionFormOptionsAction).toHaveBeenCalled());
}

function expandSection(label: string) {
    fireEvent.click(screen.getByText(label).closest("button")!);
}

describe("ScanDetailsForm", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("prefills the amount hero input and floating Descartar/Confirmar actions", async () => {
        await renderForm();

        expect(screen.getByPlaceholderText("0.00")).toHaveValue(224.19);
        expect(screen.getByRole("button", { name: /Descartar/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Confirmar/i })).toBeInTheDocument();
    });

    it("keeps fields collapsed by default and reveals the institution picker on expand", async () => {
        await renderForm();

        expect(screen.queryByPlaceholderText("Buscar institución")).not.toBeInTheDocument();

        expandSection("Institución");
        expect(screen.getByPlaceholderText("Buscar institución")).toBeInTheDocument();
    });

    it("shows the extracted context and tags accordions", async () => {
        await renderForm();

        expandSection("Contexto extraído");
        expect(screen.getByDisplayValue(/Se realizó un consumo de \$224\.19/)).toBeInTheDocument();

        expandSection("Etiquetas");
        expect(screen.getByPlaceholderText("Escribe y presiona Enter, o elige una existente...")).toBeInTheDocument();
    });

    it("confirms the scan with the mapped fields", async () => {
        (mapInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true, data: {} });
        await renderForm();

        fireEvent.click(screen.getByRole("button", { name: /Confirmar/i }));

        await waitFor(() => expect(mapInboxTransactionAction).toHaveBeenCalledWith(
            expect.objectContaining({
                scannerTransactionId: "scan-1",
                description: "Consumo en TACA WEB USA PA VI",
                institutionName: "TACA WEB USA PA VI",
                amount: 224.19,
            }),
        ));
    });

    it("dismisses the scan after confirmation", async () => {
        (dismissInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });
        window.confirm = jest.fn().mockReturnValue(true);
        await renderForm();

        fireEvent.click(screen.getByRole("button", { name: /Descartar/i }));

        await waitFor(() => expect(dismissInboxTransactionAction).toHaveBeenCalledWith("scan-1"));
    });
});
