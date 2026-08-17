import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { TransactionDetailClient } from "@/presentation/financial/components/TransactionDetailClient";
import {
    getUniqueTagsAction,
    updateTransactionAction,
    getAuditTrailAction,
    markAsDuplicateAction,
    resolveDuplicateAction,
} from "@/app/actions/financial-transactions";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import type { FinancialTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
}));

// This suite covers the single-screen edit form, which is what renders with the
// wizard flag off. The stepped flow has its own suite.
jest.mock("@/lib/feature-flags", () => ({
    FINANCIAL_FLAGS: { WIZARD_ENABLED: false },
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    getUniqueTagsAction: jest.fn(),
    updateTransactionAction: jest.fn(),
    getAuditTrailAction: jest.fn(),
    markAsDuplicateAction: jest.fn(),
    resolveDuplicateAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-settings", () => ({
    getTransactionFormOptionsAction: jest.fn(),
    updateInstitutionAction: jest.fn(),
    createInstitutionAction: jest.fn(),
    createCategoryAction: jest.fn(),
}));

const now = new Date().toISOString();

const TRANSACTION: FinancialTransaction = {
    id: "tx-1",
    ownerUserId: "user-1",
    type: "EXPENSE",
    status: "CONFIRMED",
    amount: 42.5,
    currency: "USD",
    merchant: "Supermercado Central",
    categoryId: null,
    institutionId: null,
    tags: ["mercado"],
    description: "Compra semanal",
    notes: "Compra semanal en el supermercado",
    possibleDuplicate: false,
    isDeleted: false,
    paidWithCredit: false,
    date: now,
    createdAt: now,
    updatedAt: now,
};

async function renderDetail(overrides: Partial<FinancialTransaction> = {}) {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
    (getUniqueTagsAction as jest.Mock).mockResolvedValue({ success: true, data: ["mercado", "casa"] });
    (getAuditTrailAction as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: [], accounts: [], categories: [], institutionTypes: [] },
    });

    render(<TransactionDetailClient initialTransaction={{ ...TRANSACTION, ...overrides }} />);
    await waitFor(() => expect(getTransactionFormOptionsAction).toHaveBeenCalled());
}

describe("TransactionDetailClient", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("shows a view-mode summary with a single always-reachable Editar action", async () => {
        await renderDetail();

        expect(screen.getByText("Supermercado Central")).toBeInTheDocument();
        expect(screen.getByText((content) => content.includes("42") && content.includes("50"))).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Editar transacción/i })).toBeInTheDocument();
        // Not yet in edit mode: no Guardar/Cancelar buttons.
        expect(screen.queryByRole("button", { name: /Guardar Cambios/i })).not.toBeInTheDocument();
    });

    it("keeps the status badge out of the way when there is nothing to report", async () => {
        await renderDetail();

        // "Confirmada" is the expected state: saying it costs a row and tells
        // the user nothing.
        expect(screen.queryByText("Confirmada")).not.toBeInTheDocument();
    });

    it("shows the status badge for any state worth noticing", async () => {
        await renderDetail({ status: "DETECTED" });

        expect(screen.getByText("Nueva")).toBeInTheDocument();
    });

    it("switches to edit mode with the atomic pickers and floating Cancelar/Guardar actions", async () => {
        await renderDetail();

        fireEvent.click(screen.getByRole("button", { name: /Editar transacción/i }));

        expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Guardar Cambios/i })).toBeInTheDocument();
        // The amount field becomes an editable hero input.
        expect(screen.getByPlaceholderText("0.00")).toHaveValue(42.5);
        // Institution/category sections are collapsible accordions (same as the create form);
        // expand them to reach their search boxes.
        fireEvent.click(screen.getByRole("button", { name: /Institución/i }));
        expect(screen.getByPlaceholderText("Buscar institución")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Categoría/i }));
        expect(screen.getByPlaceholderText("Buscar o crear categoría")).toBeInTheDocument();
    });

    it("cancels back to view mode without saving", async () => {
        await renderDetail();

        fireEvent.click(screen.getByRole("button", { name: /Editar transacción/i }));
        fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));

        expect(screen.getByRole("button", { name: /Editar transacción/i })).toBeInTheDocument();
        expect(updateTransactionAction).not.toHaveBeenCalled();
    });
});
