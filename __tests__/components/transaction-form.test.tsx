import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { TransactionForm } from "@/presentation/financial/components/TransactionForm";
import { getTransactionFormOptionsAction } from "@/app/actions/financial-settings";
import type { FinancialInstitution, FinancialCategory } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    createTransactionAction: jest.fn(),
}));

jest.mock("@/app/actions/financial-settings", () => ({
    getTransactionFormOptionsAction: jest.fn(),
    updateInstitutionAction: jest.fn(),
    createInstitutionAction: jest.fn(),
    createCategoryAction: jest.fn(),
}));

const now = new Date().toISOString();

const makeInstitution = (name: string, i: number): FinancialInstitution => ({
    id: `inst-${i}`,
    ownerUserId: "user-1",
    name,
    logoUrl: null,
    institutionTypeId: null,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
});

const makeCategory = (name: string, i: number): FinancialCategory => ({
    id: `cat-${i}`,
    ownerUserId: null,
    name,
    color: "#64748b",
    icon: null,
    parentId: null,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
});

// 8 institutions: preview shows the first 5 (3 + 2 grid), the rest only show after "Más".
const INSTITUTIONS = [
    "Banco Austro", "Banco Bolivariano", "Banco Continental", "Banco Diners",
    "Banco Europa", "Banco Fenix", "Banco Guayaquil", "Banco Hipotecario",
].map(makeInstitution);

// 9 categories: CATEGORY_PREVIEW = 5, so the rest only show after "Más".
const CATEGORIES = [
    "Alimentación", "Bienestar", "Cajero", "Deudas", "Educación",
    "Finanzas", "Gastos varios", "Hogar", "Impuestos",
].map(makeCategory);

async function renderForm() {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), back: jest.fn() });
    (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
        success: true,
        data: { institutions: INSTITUTIONS, accounts: [], categories: CATEGORIES, institutionTypes: [] },
    });

    render(<TransactionForm />);

    // Wait for the async settings load (Promise.all in the mount effect) to resolve.
    await waitFor(() => expect(getTransactionFormOptionsAction).toHaveBeenCalled());
}

function expandSection(label: string) {
    fireEvent.click(screen.getByText(label).closest("button")!);
}

/** Tile names in the suggestions grid, scoped to the AccordionField identified by its label. */
function getGridTileNames(sectionLabel: string): string[] {
    const labelEl = screen.getByText(sectionLabel);
    const sectionRoot = labelEl.closest("div.rounded-2xl") as HTMLElement;
    const grid = sectionRoot.querySelector(".grid.grid-cols-3, .grid.grid-cols-4") as HTMLElement;
    return within(grid).getAllByRole("button").map((btn) => btn.textContent || "");
}

describe("TransactionForm — Institución / Categoría suggestions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("shows recommended institutions by default and keeps the selection first after re-opening", async () => {
        await renderForm();

        expandSection("Institución");

        // Always something to pick from, even with an empty search box.
        await waitFor(() => expect(screen.getByText("Banco Austro")).toBeInTheDocument());
        expect(screen.getByPlaceholderText("Buscar institución")).toHaveValue("");
        let tiles = getGridTileNames("Institución");
        expect(tiles.slice(0, 5)).toEqual([
            "Banco Austro", "Banco Bolivariano", "Banco Continental", "Banco Diners", "Banco Europa",
        ]);

        // Reveal and select the institution outside the initial 5-item preview.
        fireEvent.click(screen.getByText("Más"));
        await waitFor(() => expect(screen.getByText("Banco Hipotecario")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Banco Hipotecario").closest("button")!);

        // Leave the section, then come back.
        expandSection("Institución"); // collapse
        expandSection("Institución"); // re-open

        // Search text resets, but the selection is preserved and shown first.
        expect(screen.getByPlaceholderText("Buscar institución")).toHaveValue("");
        tiles = getGridTileNames("Institución");
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles[0]).toBe("Banco Hipotecario");
    });

    it("shows recommended categories by default and keeps the selection first after re-opening", async () => {
        await renderForm();

        expandSection("Categoría");

        await waitFor(() => expect(screen.getByText("Alimentación")).toBeInTheDocument());
        expect(screen.getByPlaceholderText("Buscar o crear categoría")).toHaveValue("");
        let tiles = getGridTileNames("Categoría");
        expect(tiles.slice(0, 5)).toEqual([
            "Alimentación", "Bienestar", "Cajero", "Deudas", "Educación",
        ]);

        // Reveal and select a category outside the initial 5-item preview.
        fireEvent.click(screen.getByText("Más"));
        await waitFor(() => expect(screen.getByText("Impuestos")).toBeInTheDocument());
        fireEvent.click(screen.getByText("Impuestos").closest("button")!);

        expandSection("Categoría"); // collapse
        expandSection("Categoría"); // re-open

        expect(screen.getByPlaceholderText("Buscar o crear categoría")).toHaveValue("");
        tiles = getGridTileNames("Categoría");
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles[0]).toBe("Impuestos");
    });

    it("guides the user to create the first institution when none exist yet", async () => {
        (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), back: jest.fn() });
        (getTransactionFormOptionsAction as jest.Mock).mockResolvedValue({
            success: true,
            data: { institutions: [], accounts: [], categories: CATEGORIES, institutionTypes: [] },
        });

        render(<TransactionForm />);
        await waitFor(() => expect(getTransactionFormOptionsAction).toHaveBeenCalled());

        expandSection("Institución");

        expect(
            await screen.findByText("Aún no tienes instituciones guardadas. Escribe un nombre arriba para crear la primera."),
        ).toBeInTheDocument();
    });
});
