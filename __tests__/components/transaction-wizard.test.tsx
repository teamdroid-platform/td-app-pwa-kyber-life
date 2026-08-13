import React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransactionWizard } from "@/presentation/financial/components/transaction-wizard/TransactionWizard";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import { getTransactionSuggestionsAction } from "@/app/actions/financial-transactions";
import type { WizardValues } from "@/presentation/financial/hooks/useTransactionWizard";
import type { FinancialCategory, FinancialInstitution } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(() => ({ push: jest.fn(), refresh: jest.fn() })),
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

const institution: FinancialInstitution = {
    id: "inst-1", ownerUserId: "user-1", name: "Supermaxi", logoUrl: null,
    institutionTypeId: null, createdAt: now, updatedAt: now, isDeleted: false,
};

const category: FinancialCategory = {
    id: "cat-1", ownerUserId: null, name: "Supermercado", color: "#F97316",
    icon: "ShoppingCart", parentId: null, createdAt: now, updatedAt: now, isDeleted: false,
};

const EMPTY: WizardValues = {
    type: "EXPENSE", amount: "", description: "", institutionName: "",
    categoryName: "", paidWithCredit: false, date: "2026-07-28T19:40", notes: "", tags: [],
};

const FILLED: WizardValues = {
    ...EMPTY, amount: "47.90", description: "Compra semanal", institutionName: "Supermaxi",
    categoryName: "Supermercado", notes: "Nota original",
};

function renderWizard(props: Partial<React.ComponentProps<typeof TransactionWizard>> = {}) {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(
        <TransactionWizard
            mode="create"
            initialValues={EMPTY}
            onSubmit={onSubmit}
            {...props}
        />,
    );
    return { onSubmit };
}

const primary = () => screen.getByRole("button", { name: /Siguiente|Ver resumen|Guardar/i });

beforeEach(() => {
    jest.clearAllMocks();
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: [institution], accounts: [{ id: "acc-1", ownerUserId: "user-1", name: "Visa Oro", currency: "USD", createdAt: now, updatedAt: now, isDeleted: false }], categories: [category], institutionTypes: [] },
    });
    (getTransactionSuggestionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: {
            tags: ["MERCADO"],
            descriptionsByType: {
                EXPENSE: ["Compra semanal", "Almuerzo"],
                INCOME: ["Salario"],
            },
        },
    });
});

describe("TransactionWizard — capture", () => {
    it("keeps the first step closed until there is an amount and a description", async () => {
        renderWizard();

        expect(await screen.findByText("¿Cuánto fue?")).toBeInTheDocument();
        expect(primary()).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "47.90" } });
        expect(primary()).toBeDisabled(); // still missing the description

        fireEvent.change(screen.getByPlaceholderText("Ej. Compra semanal"), { target: { value: "Compra semanal" } });
        expect(primary()).toBeEnabled();
    });

    it("fills the description from a frequent one with a single tap", async () => {
        renderWizard();

        fireEvent.click(await screen.findByRole("button", { name: /Almuerzo/ }));
        expect(screen.getByPlaceholderText("Ej. Compra semanal")).toHaveValue("Almuerzo");
    });

    it("switches the suggestions with the type without asking the server again", async () => {
        renderWizard();

        expect(await screen.findByText("Tus más usadas en gastos")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Almuerzo/ })).toBeInTheDocument();

        // What you write for an income is not what you write for an expense.
        fireEvent.click(screen.getByRole("button", { name: /Ingreso/ }));

        expect(await screen.findByText("Tus más usadas en ingresos")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Salario/ })).toBeInTheDocument();

        // Every type arrived in the first response; switching costs no request.
        expect(getTransactionSuggestionsAction).toHaveBeenCalledTimes(1);
    });

    it("holds the space with placeholders while the suggestions load", async () => {
        let resolve: (value: unknown) => void = () => undefined;
        (getTransactionSuggestionsAction as jest.Mock).mockReturnValue(
            new Promise((r) => { resolve = r; }),
        );
        renderWizard();

        expect(await screen.findByRole("status")).toHaveTextContent("Cargando tus descripciones más usadas");

        await act(async () => {
            resolve({ success: true, data: { tags: [], descriptionsByType: { EXPENSE: ["Almuerzo"] } } });
        });

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Almuerzo/ })).toBeInTheDocument();
    });

    it("offers at most five suggestions, in the order the query returned them", async () => {
        (getTransactionSuggestionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: {
                tags: [],
                descriptionsByType: { EXPENSE: ["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis"] },
            },
        });
        renderWizard();

        expect(await screen.findByRole("button", { name: /Uno/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Cinco/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Seis/ })).not.toBeInTheDocument();
    });

    it("reaches the summary and shows what will be saved", async () => {
        renderWizard({ initialValues: FILLED });

        fireEvent.click(await screen.findByRole("button", { name: /Resumen/i }));

        // The description shows twice on purpose: as the title and as its own row.
        expect(await screen.findAllByText("Compra semanal")).toHaveLength(2);
        expect(screen.getByText("Supermaxi")).toBeInTheDocument();
        expect(screen.getByText("Supermercado")).toBeInTheDocument();
        expect(screen.getAllByText(/47[.,]90/).length).toBeGreaterThan(0);
    });

    it("marks a missing required field on the summary and blocks saving", async () => {
        const { onSubmit } = renderWizard({ initialValues: { ...FILLED, institutionName: "" } });

        fireEvent.click(await screen.findByRole("button", { name: /Resumen/i }));

        expect(await screen.findByText("Falta la institución")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Guardar transacción/i })).toBeDisabled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("submits once, with the captured values", async () => {
        const { onSubmit } = renderWizard({ initialValues: FILLED });

        fireEvent.click(await screen.findByRole("button", { name: /Resumen/i }));
        fireEvent.click(await screen.findByRole("button", { name: /Guardar transacción/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
            amount: "47.90",
            description: "Compra semanal",
            institutionName: "Supermaxi",
        }));
    });
});

describe("TransactionWizard — editing one field from the summary", () => {
    it("opens only that step and returns to the summary", async () => {
        renderWizard({ mode: "edit", initialValues: FILLED });

        // The summary is the entry point when editing.
        fireEvent.click(await screen.findByText("Supermercado"));

        expect(await screen.findByText("Editar categoría")).toBeInTheDocument();
        expect(screen.getByText("Volverás al resumen")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Guardar cambio$/i }));

        // Back on the summary: the focused step's chrome is gone.
        expect(await screen.findByRole("button", { name: /Guardar cambios/i })).toBeInTheDocument();
        expect(screen.queryByText("Volverás al resumen")).not.toBeInTheDocument();
    });

    it("keeps Guardar disabled until something actually changed", async () => {
        renderWizard({ mode: "edit", initialValues: FILLED });

        expect(await screen.findByRole("button", { name: /Guardar cambios/i })).toBeDisabled();
    });
});

describe("TransactionWizard — notes", () => {
    it("auto-generates the notes while creating", async () => {
        renderWizard({ initialValues: { ...FILLED, notes: "" }, notesOrigin: "auto" });

        fireEvent.click(await screen.findByRole("button", { name: /Resumen/i }));

        expect(await screen.findByText(/Registro de gasto por Compra semanal en Supermaxi/)).toBeInTheDocument();
    });

    it("never overwrites notes that came from a scan", async () => {
        renderWizard({
            initialValues: { ...FILLED, notes: "[MAIL] Consumo tarjeta VISA por USD 47.90" },
            notesOrigin: "scan",
        });

        fireEvent.click(await screen.findByRole("button", { name: /Resumen/i }));

        expect(await screen.findByText(/\[MAIL\] Consumo tarjeta VISA/)).toBeInTheDocument();
        expect(screen.queryByText(/Registro de gasto por/)).not.toBeInTheDocument();
        expect(screen.getByText("Notas · del correo")).toBeInTheDocument();
    });

    it("never overwrites the notes of an existing transaction", async () => {
        renderWizard({ mode: "edit", initialValues: FILLED, notesOrigin: "manual" });

        expect(await screen.findByText("Nota original")).toBeInTheDocument();
        expect(screen.queryByText(/Registro de gasto por/)).not.toBeInTheDocument();
    });
});
