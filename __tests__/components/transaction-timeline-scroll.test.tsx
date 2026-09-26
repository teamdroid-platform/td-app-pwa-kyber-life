import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { TransactionTimeline } from "@/presentation/financial/components/TransactionTimeline";
import { searchPaginatedTransactionsAction } from "@/app/actions/financial-transactions";
import { writeListScroll } from "@/presentation/financial/lib/list-scroll";
import type { FinancialTransaction } from "@/domain/entities/financial";

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(),
    useSearchParams: jest.fn(),
    usePathname: jest.fn(() => "/financial/transactions"),
}));

jest.mock("@/app/actions/financial-transactions", () => ({
    searchPaginatedTransactionsAction: jest.fn(),
    createTransactionAction: jest.fn(),
    reviewTransactionAction: jest.fn(),
    archiveTransactionAction: jest.fn(),
    softDeleteTransactionAction: jest.fn(),
}));

jest.mock("@/presentation/financial/hooks/useFinancialRealtime", () => ({
    useFinancialRealtime: jest.fn(() => ({ isPollingFallback: false })),
}));

jest.mock("@/infrastructure/offline/financial-offline-store", () => ({
    financialOfflineStore: {
        transactions: { set: jest.fn().mockResolvedValue(undefined), getAll: jest.fn().mockResolvedValue([]) },
        drafts: { getAll: jest.fn().mockResolvedValue([]), remove: jest.fn() },
    },
}));

// Las cifras de la cabecera traen recharts entero y no son lo que se prueba aquí.
jest.mock("@/presentation/financial/components/TransactionSummary", () => ({
    TransactionSummary: () => <div data-testid="summary" />,
}));
jest.mock("@/presentation/financial/components/TransactionKpiRow", () => ({
    TransactionKpiRow: () => <div data-testid="kpis" />,
}));

const searchAction = searchPaginatedTransactionsAction as jest.MockedFunction<
    typeof searchPaginatedTransactionsAction
>;

function tx(id: string): FinancialTransaction {
    return {
        id,
        ownerUserId: "u",
        amount: 10,
        currency: "USD",
        type: "EXPENSE",
        status: "CONFIRMED",
        description: `Gasto ${id}`,
        merchant: null,
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        date: "2026-09-22T10:00:00.000Z",
        createdAt: "2026-09-22T10:00:00.000Z",
        updatedAt: "2026-09-22T10:00:00.000Z",
    } as FinancialTransaction;
}

const FILTERS = { status: "CONFIRMED" };
const LIST_KEY = JSON.stringify(FILTERS);

// jsdom no trae IntersectionObserver, y el scroll infinito monta uno al entrar.
class FakeIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "";
    thresholds = [];
}

beforeAll(() => {
    Object.defineProperty(window, "IntersectionObserver", {
        value: FakeIntersectionObserver, writable: true,
    });
    Object.defineProperty(global, "IntersectionObserver", {
        value: FakeIntersectionObserver, writable: true,
    });
});

beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
    (usePathname as jest.Mock).mockReturnValue("/financial/transactions");
    Object.defineProperty(window, "scrollY", { value: 0, writable: true });
    Object.defineProperty(window, "scrollTo", { value: jest.fn(), writable: true });
});

describe("TransactionTimeline · volver al mismo sitio", () => {
    /** Mueve la ventana y avisa, como haría el navegador. */
    function scrollWindowTo(y: number) {
        Object.defineProperty(window, "scrollY", { value: y, configurable: true });
        window.dispatchEvent(new Event("scroll"));
    }

    it("guarda dónde estaba la lista al salir de ella", () => {
        const view = render(
            <TransactionTimeline initialTransactions={[tx("1")]} searchFilters={FILTERS} />,
        );

        scrollWindowTo(1840);
        // Abrir el detalle desmonta la lista: es el momento de anotar el sitio.
        view.unmount();

        const saved = JSON.parse(sessionStorage.getItem("kyber:list-scroll") ?? "{}");
        expect(saved).toMatchObject({ key: LIST_KEY, y: 1840, pages: 1 });
    });

    // La regresión que dejaba esto sin servir: al navegar, el router lleva la
    // ventana arriba antes de que corran las limpiezas normales. Preguntar
    // entonces «¿dónde estábamos?» respondía cero, y cero no se restaura.
    it("guarda el sitio del usuario, no el cero al que salta el router", () => {
        const view = render(
            <TransactionTimeline initialTransactions={[tx("1")]} searchFilters={FILTERS} />,
        );

        scrollWindowTo(1840);
        // El router monta la pantalla nueva y sube la ventana.
        Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
        view.unmount();

        const saved = JSON.parse(sessionStorage.getItem("kyber:list-scroll") ?? "{}");
        expect(saved).toMatchObject({ y: 1840 });
    });

    it("al volver repone las páginas que había cargadas antes de moverse", async () => {
        searchAction.mockResolvedValue({
            success: true,
            data: {
                data: [tx("21")],
                pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
            },
        } as never);

        writeListScroll({ key: LIST_KEY, y: 1840, pages: 2, savedAt: Date.now() });

        render(<TransactionTimeline initialTransactions={[tx("1")]} searchFilters={FILTERS} />);

        // Sin volver a pedir la segunda página la lista no llega al sitio
        // guardado, y el salto se quedaría a medias.
        await waitFor(() => expect(searchAction).toHaveBeenCalledWith(
            expect.objectContaining({ page: 2, pageSize: 20, status: "CONFIRMED" }),
        ));
        await waitFor(() => expect(screen.getAllByText("Gasto 21").length).toBeGreaterThan(0));
    });

    it("una entrada limpia a la pantalla no pide páginas de más", async () => {
        render(<TransactionTimeline initialTransactions={[tx("1")]} searchFilters={FILTERS} />);

        await waitFor(() => expect(screen.getAllByText("Gasto 1").length).toBeGreaterThan(0));
        expect(searchAction).not.toHaveBeenCalled();
    });

    it("no repone la posición guardada por una lista con otros filtros", async () => {
        writeListScroll({ key: '{"status":"ARCHIVED"}', y: 1840, pages: 2, savedAt: Date.now() });

        render(<TransactionTimeline initialTransactions={[tx("1")]} searchFilters={FILTERS} />);

        await waitFor(() => expect(screen.getAllByText("Gasto 1").length).toBeGreaterThan(0));
        expect(searchAction).not.toHaveBeenCalled();
    });
});
