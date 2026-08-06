import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransactionScanWizard } from "@/presentation/financial/components/transaction-wizard/TransactionScanWizard";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import { getTransactionSuggestionsAction } from "@/app/actions/financial-transactions";
import { mapInboxTransactionAction, dismissInboxTransactionAction } from "@/app/actions/financial-inbox";
import type { FinancialScannerTransaction } from "@/domain/entities/financial";
import type { InstitutionMatchInfo } from "@/lib/institution-match";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
    useRouter: jest.fn(() => ({ replace, push: jest.fn(), refresh: jest.fn() })),
}));

jest.mock("@/app/actions/financial-inbox", () => ({
    mapInboxTransactionAction: jest.fn(),
    dismissInboxTransactionAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    getTransactionSuggestionsAction: jest.fn(),
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

function renderScanWizard(
    overrides: Partial<FinancialScannerTransaction> = {},
    institutionMatch?: InstitutionMatchInfo,
) {
    render(
        <TransactionScanWizard
            initialData={{ ...scanned, ...overrides }}
            resolvedInstitutionName="Supermaxi"
            institutionMatch={institutionMatch}
        />,
    );
}

/** The scan flow opens straight on the summary, so there is nothing to open. */
const summaryHeading = () => screen.findByText("Confirmar transacción");

beforeEach(() => {
    jest.clearAllMocks();
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: [], accounts: [], categories: [], institutionTypes: [] },
    });
    (getTransactionSuggestionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { tags: [], descriptionsByType: {} },
    });
    (mapInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });
    (dismissInboxTransactionAction as jest.Mock).mockResolvedValue({ success: true });
});

describe("TransactionScanWizard", () => {
    it("opens on the summary, so confirming is a single tap", async () => {
        renderScanWizard();

        expect(await summaryHeading()).toBeInTheDocument();
        expect(screen.getByText("Revisa y confirma, o edita cualquier dato")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Confirmar/i })).toBeEnabled();

        // Not the capture flow: no step 1 in sight.
        expect(screen.queryByText("¿Cuánto fue?")).not.toBeInTheDocument();
    });

    it("shows the scanned values at a glance, with the institution already resolved", async () => {
        renderScanWizard();

        await summaryHeading();
        expect(screen.getAllByText("Compra semanal").length).toBeGreaterThan(0);
        expect(screen.getByText("Supermaxi")).toBeInTheDocument();
        // Twice on purpose: the reviewed value, and the scan's original one.
        expect(screen.getAllByText("Supermercado")).toHaveLength(2);
    });

    it("opens a single field for editing and returns to the summary", async () => {
        renderScanWizard();
        await summaryHeading();

        // The first is the editable summary row; the second is read-only origin data.
        fireEvent.click(screen.getAllByText("Supermercado")[0]);
        expect(await screen.findByText("Editar categoría")).toBeInTheDocument();
        expect(screen.getByText("Volverás al resumen")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Guardar cambio$/i }));
        expect(await screen.findByRole("button", { name: /Confirmar/i })).toBeInTheDocument();
    });

    it("seeds the notes from the scan's summary and never auto-generates over them", async () => {
        renderScanWizard();
        await summaryHeading();

        expect(await screen.findByText("Consumo con tarjeta VISA en SUPERMAXI")).toBeInTheDocument();
        expect(screen.getByText("Notas · del correo")).toBeInTheDocument();
        expect(screen.queryByText(/Registro de gasto por/)).not.toBeInTheDocument();
    });

    it("falls back to the email body when the scan carries no summary", async () => {
        renderScanWizard({
            summary: null,
            originStats: { origin: "email", emailBody: "Su consumo fue de USD 47.90" },
        });
        await summaryHeading();

        expect(await screen.findByText(/\[MAIL\] Su consumo fue de USD 47\.90/)).toBeInTheDocument();
    });

    it("lays the card out one element per row, so nothing truncates or collides", async () => {
        renderScanWizard({ description: "Pago de matrícula del segundo semestre en la Universidad de Cuenca", amount: 12480.5 });
        await summaryHeading();

        // The description is not clipped: the type badge no longer shares its line.
        const [heroTitle] = screen.getAllByText("Pago de matrícula del segundo semestre en la Universidad de Cuenca");
        expect(heroTitle.className).not.toMatch(/truncate/);

        // Type, description and amount are siblings — each with the full width.
        const card = heroTitle.parentElement!;
        expect(card.className).toMatch(/flex-col/);
        expect(card).toHaveTextContent("Gasto");
        expect(card).toHaveTextContent(/12[.,]480[.,]50/);
    });

    it("marks the institution row with how confident the detection was", async () => {
        renderScanWizard({}, { level: "verified", score: 0.97, matchedName: "Supermaxi" });
        await summaryHeading();

        // Visible on the summary itself: no need to open anything to know.
        expect(screen.getByLabelText("Institución identificada · 97% con «Supermaxi»")).toBeInTheDocument();
    });

    it("marks a partial detection differently, so it reads as worth checking", async () => {
        renderScanWizard({}, { level: "warning", score: 0.6, matchedName: "Supermaxi" });
        await summaryHeading();

        expect(screen.getByLabelText("Coincidencia parcial · 60% con «Supermaxi»")).toBeInTheDocument();
    });

    it("marks an absent detection without inventing a name", async () => {
        renderScanWizard({}, { level: "none", score: 0.1, matchedName: null });
        await summaryHeading();

        expect(screen.getByLabelText("Sin coincidencia")).toBeInTheDocument();
    });

    it("keeps the originally extracted data consultable on the summary", async () => {
        renderScanWizard();
        await summaryHeading();

        expect(await screen.findByText("Datos originales extraídos")).toBeInTheDocument();
        expect(screen.getByText("email")).toBeInTheDocument(); // Origin
        expect(screen.getByText("abc123")).toBeInTheDocument();
    });

    it("confirms through the inbox action with the reviewed values", async () => {
        renderScanWizard();
        await summaryHeading();

        fireEvent.click(screen.getByRole("button", { name: /Confirmar/i }));

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
        await summaryHeading();

        fireEvent.click(screen.getByRole("button", { name: /Descartar/i }));

        await waitFor(() => expect(dismissInboxTransactionAction).toHaveBeenCalledWith("scan-1"));
    });

    it("does not discard when the confirmation is cancelled", async () => {
        window.confirm = jest.fn(() => false);
        renderScanWizard();
        await summaryHeading();

        fireEvent.click(screen.getByRole("button", { name: /Descartar/i }));

        expect(dismissInboxTransactionAction).not.toHaveBeenCalled();
    });
});
