import { render, screen } from "@testing-library/react";
import { HomeHub, type HomeMetrics } from "@/presentation/components/dashboard/HomeHub";
import type { BalanceSet } from "@/application/services/balance-service";

// El diálogo de captura navega al resumen tras interpretar.
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
}));

const BALANCES: BalanceSet = {
    defaultMode: "PERIOD",
    currency: "USD",
    total: { value: 24560, accountsCounted: 6, accountsWithoutSnapshot: [], creditDebt: 0 },
    period: { value: 5100.75, income: 8450, expenses: 3240.8, savings: 0, funding: 0, excludedCount: 0 },
    withCredit: { value: 4902.06, creditDeferred: 198.69 },
};

const METRICS: HomeMetrics = {
    currency: "USD",
    balances: BALANCES,
    accounts: 6,
    accountsWithBalance: 6,
    monthIncome: 8450,
    monthExpenses: 3240.8,
    monthNet: 5209.2,
    expensesDeltaPct: -4.3,
    pendingTransactions: 3,
    series: { dates: ["2026-08-01", "2026-08-08"], income: [100, 250], expenses: [80, 120], net: [20, 130] },
    expensesSeries: [80, 200],
    purchases: { slices: [], total: 0 },
    recent: [],
    periodLabel: "Este mes",
};

const BASE = {
    userFirstName: "Xavier",
    todayLabel: "viernes, 21 de agosto",
    balances: { total: 4, pending: 4, lastAsOf: null },
    pendingScans: 1,
    metrics: METRICS,
};

describe("HomeHub", () => {
    it("saluda por el nombre y fecha el día", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("heading", { name: "Bienvenido, Xavier" })).toBeInTheDocument();
        expect(screen.getByText("viernes, 21 de agosto")).toBeInTheDocument();
    });

    it("sin nombre, saluda igual", () => {
        render(<HomeHub {...BASE} userFirstName={undefined} />);

        expect(screen.getByRole("heading", { name: "Bienvenido" })).toBeInTheDocument();
    });

    // En un teléfono el servidor no mide el tablero: `metrics` llega en `null`
    // y `HomeDesktop` no se monta, para no pagar consultas que nadie ve.
    it("sin cifras medidas, solo monta la pantalla de móvil", () => {
        render(<HomeHub {...BASE} metrics={null} />);

        expect(screen.getByRole("heading", { name: "Registrar un movimiento" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Saldos/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /balance del periodo/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/Actividad reciente/)).not.toBeInTheDocument();
    });

    it("con cifras, monta también el tablero", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("button", { name: /balance del periodo/i })).toBeInTheDocument();
        // Y la pantalla de móvil sigue en el árbol: es CSS quien elige cuál se ve.
        expect(screen.getByRole("link", { name: /^Saldos/ })).toBeInTheDocument();
    });
});
