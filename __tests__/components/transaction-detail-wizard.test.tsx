import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { TransactionDetailClient } from "@/presentation/financial/components/TransactionDetailClient";
import { countActiveFilters } from "@/presentation/financial/components/TransactionTabs";
import {
    getUniqueTagsAction,
    getTransactionSuggestionsAction,
    getAuditTrailAction,
} from "@/app/actions/financial-transactions";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import type { FinancialTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
}));

// This suite covers the stepped experience, which is what renders with the flag on.
jest.mock("@/lib/feature-flags", () => ({
    FINANCIAL_FLAGS: { WIZARD_ENABLED: true },
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    getUniqueTagsAction: jest.fn(),
    getTransactionSuggestionsAction: jest.fn(),
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

const now = "2026-07-28T19:42:00.000Z";

const TRANSACTION: FinancialTransaction = {
    id: "tx-1",
    ownerUserId: "user-1",
    type: "EXPENSE",
    status: "CONFIRMED",
    amount: 75.34,
    currency: "USD",
    merchant: "FeelTheTickets",
    categoryId: null,
    institutionId: null,
    tags: [],
    description: "Pago comisiones concierto The Strokes",
    notes: "Compra con tarjeta",
    possibleDuplicate: false,
    isDeleted: false,
    paidWithCredit: false,
    date: now,
    createdAt: now,
    updatedAt: now,
} as FinancialTransaction;

async function renderDetail(overrides: Partial<FinancialTransaction> = {}) {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
    (getUniqueTagsAction as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (getAuditTrailAction as jest.Mock).mockResolvedValue({ success: true, data: [] });
    (getTransactionSuggestionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { tags: [], descriptionsByType: {} },
    });
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: [], accounts: [], categories: [], institutionTypes: [] },
    });

    render(<TransactionDetailClient initialTransaction={{ ...TRANSACTION, ...overrides }} />);
    await waitFor(() => expect(getTransactionFormOptionsAction).toHaveBeenCalled());
}

describe("TransactionDetailClient · stepped experience", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("shows the same hero and rows as the editor's summary", async () => {
        await renderDetail();

        // Description and amount appear twice: once in the hero, once in a row.
        expect(screen.getAllByText("Pago comisiones concierto The Strokes").length).toBeGreaterThan(1);
        expect(screen.getByText("Descripción · título")).toBeInTheDocument();
        expect(screen.getByText("Institución")).toBeInTheDocument();
        expect(screen.getByText("Categoría")).toBeInTheDocument();
        expect(screen.getByText("Fecha")).toBeInTheDocument();
    });

    it("keeps the change history and the scan detail", async () => {
        await renderDetail();

        expect(screen.getAllByText(/Historial de auditor/i).length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: /Editar transacción/i })).toBeInTheDocument();
    });

    it("opens the editor on the field whose row was tapped", async () => {
        await renderDetail();

        fireEvent.click(screen.getByText("Categoría"));

        // Focus mode: the step's own header, and Cancelar/Guardar for that field.
        expect(await screen.findByText("Editar categoría")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Guardar cambio/i })).toBeInTheDocument();
    });

    // El caso reportado: un ingreso ya guardado con la cuenta puesta como
    // origen, que el usuario quiere corregir a «entró aquí».
    it("deja declarar la cuenta de destino al editar un ingreso", async () => {
        await renderDetail({ type: "INCOME", bankSourceAccountId: "acc-1" });

        fireEvent.click(screen.getByText("Forma de pago"));

        expect(await screen.findByText("¿Dónde se acreditó?")).toBeInTheDocument();
        expect(screen.getByText("Destino")).toBeInTheDocument();
        expect(screen.getByText("Origen")).toBeInTheDocument();
    });

    it("opens the editor on the summary when the main button is used", async () => {
        await renderDetail();

        fireEvent.click(screen.getByRole("button", { name: /Editar transacción/i }));

        expect(await screen.findByText("Editar transacción", { selector: "h2, h1, p, span" })).toBeInTheDocument();
        expect(screen.queryByText("Editar categoría")).not.toBeInTheDocument();
    });
});

/**
 * Folding the filters away is only safe if the user can still tell that some
 * are applied — otherwise a filtered list reads as missing transactions.
 */
describe("countActiveFilters", () => {
    const count = (qs: string) => countActiveFilters(new URLSearchParams(qs));

    it("ignores the type chips, which have their own visible row", () => {
        expect(count("type=EXPENSE,INCOME")).toBe(0);
    });

    it("counts each non-type filter", () => {
        expect(count("query=almuerzo")).toBe(1);
        expect(count("query=almuerzo&categoryId=c-1")).toBe(2);
        expect(count("status=CONFIRMED&institutionId=i-1&currency=USD")).toBe(3);
    });

    it("counts a date range once, however it is expressed", () => {
        expect(count("dateFrom=2026-07-01&dateTo=2026-07-31")).toBe(1);
        expect(count("range=all")).toBe(1);
    });

    it("is zero for an untouched list", () => {
        expect(count("")).toBe(0);
    });
});
