import { render, screen, within } from "@testing-library/react";
import { HomeDesktop, type HomeMetrics } from "@/presentation/components/dashboard/HomeDesktop";
import { buildAlerts } from "@/lib/home-overview";
import { formatMoney } from "@/lib/home-overview";
import type { BalanceSet } from "@/application/services/balance-service";

// El diálogo de captura navega al resumen tras interpretar.
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
}));

/**
 * El importe tal como queda en el DOM ya normalizado.
 *
 * `Intl` separa la cifra de la moneda con un espacio duro; el buscador de
 * Testing Library normaliza el texto del DOM pero no el que se le pasa, así
 * que sin este cambio la comparación falla por un carácter invisible.
 */
function money(amount: number): string {
    return formatMoney(amount).replace(/ /g, " ");
}

// `period.value` deliberadamente distinto de `monthNet` (5209.2, más abajo):
// coinciden en la app real casi siempre, pero un test que los confunda no
// notaría si el selector mostrara el número equivocado.
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
    series: {
        dates: ["2026-08-01", "2026-08-08", "2026-08-15"],
        income: [100, 250, 400],
        expenses: [80, 120, 300],
        net: [20, 130, 100],
    },
    balanceSeries: [20, 150, 250],
    expensesSeries: [80, 200, 500],
    purchases: {
        slices: [
            { label: "Supermercado", value: 400, percentage: 40, color: "#2dd4bf" },
            { label: "Transporte", value: 600, percentage: 60, color: "#a78bfa" },
        ],
        total: 1000,
    },
    recent: [
        { id: "t1", title: "Supermaxi - Tumbaco", when: "Hoy, 10:45", amount: 86.45, currency: "USD", kind: "expense" },
        { id: "t2", title: "Transferencia entrante", when: "Ayer, 16:30", amount: 1250, currency: "USD", kind: "income" },
    ],
    periodLabel: "Este mes",
};

/** Los avisos se derivan igual que en la página, para no inventarlos aquí. */
function alertsFor(metrics: HomeMetrics, pendingScans = 1, pendingBalances = 4) {
    return buildAlerts({ pendingScans, pendingBalances, pendingTransactions: metrics.pendingTransactions });
}

const BASE = { metrics: METRICS, alerts: alertsFor(METRICS) };

describe("HomeDesktop", () => {
    it("abre con las tres vías de registro", () => {
        render(<HomeDesktop {...BASE} />);

        expect(screen.getByRole("heading", { name: "Registrar un movimiento" })).toBeInTheDocument();
        for (const way of ["Audio", "Texto", "Formulario"]) {
            expect(screen.getByRole("button", { name: new RegExp(way) })).toBeInTheDocument();
        }
        // El escáner no es una vía de captura: vive en su propia pantalla.
        expect(screen.queryByText(/Escanear comprobante/)).not.toBeInTheDocument();
    });

    it("encabeza con las cifras del periodo, cada una hacia donde se explica", () => {
        render(<HomeDesktop {...BASE} />);

        expect(screen.getByRole("link", { name: /Gastos este mes/ })).toHaveAttribute("href", "/financial/transactions");
        expect(screen.getByText(/4,3 % vs periodo anterior/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Cuentas conectadas/ })).toHaveAttribute("href", "/financial/banks");
    });

    it("la tarjeta de saldo lleva el selector de balance, sin duplicar el Total", () => {
        render(<HomeDesktop {...BASE} />);

        // Arranca en el modo por defecto de ajustes (PERIOD) con su valor.
        expect(screen.getByRole("button", { name: /balance del periodo/i })).toBeInTheDocument();
        expect(screen.getByText(money(5100.75))).toBeInTheDocument();
        // Ya no hay una tarjeta fija de "Saldo total": el Total es una de las
        // tres opciones del selector, y tenerlo dos veces en la misma pantalla
        // se contradice.
        expect(screen.queryByRole("link", { name: /Saldo total/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/^Saldo total$/)).not.toBeInTheDocument();
    });

    it("sin gasto el periodo anterior, no inventa un porcentaje", () => {
        render(<HomeDesktop {...BASE} metrics={{ ...METRICS, expensesDeltaPct: null }} />);

        expect(screen.getByText("Sin gasto en el periodo anterior")).toBeInTheDocument();
    });

    it("dibuja el flujo del periodo con sus tres cifras", () => {
        render(<HomeDesktop {...BASE} />);

        const panel = screen.getByRole("heading", { name: "Panel financiero" }).closest("section") as HTMLElement;
        expect(within(panel).getByText("Ingresos")).toBeInTheDocument();
        expect(within(panel).getByText(money(8450))).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: /Ver panel financiero/ }))
            .toHaveAttribute("href", "/financial");
    });

    it("reparte el gasto de compras por categoría y lleva al análisis", () => {
        render(<HomeDesktop {...BASE} />);

        const panel = screen.getByRole("heading", { name: "Panel de compras" }).closest("section") as HTMLElement;
        expect(within(panel).getByText("Supermercado")).toBeInTheDocument();
        expect(within(panel).getByText("60 %")).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: /Ver análisis completo/ }))
            .toHaveAttribute("href", "/market/analytics");
    });

    it("sin compras cerradas lo dice, en vez de dibujar un anillo vacío", () => {
        render(<HomeDesktop {...BASE} metrics={{ ...METRICS, purchases: { slices: [], total: 0 } }} />);

        expect(screen.getByText(/Todavía no hay compras cerradas/)).toBeInTheDocument();
    });

    it("lista los últimos movimientos con su signo y su ficha", () => {
        render(<HomeDesktop {...BASE} />);

        const movimiento = screen.getByRole("link", { name: /Supermaxi - Tumbaco/ });
        expect(movimiento).toHaveAttribute("href", "/financial/transactions/t1");
        expect(screen.getByText(`−${money(86.45)}`)).toBeInTheDocument();
        expect(screen.getByText(`+${money(1250)}`)).toBeInTheDocument();
    });

    it("convierte lo pendiente en avisos con su botón", () => {
        render(<HomeDesktop {...BASE} />);

        expect(screen.getByText("1 escaneo pendiente")).toBeInTheDocument();
        expect(screen.getByText("4 cuentas sin corte reciente")).toBeInTheDocument();
        expect(screen.getByText("3 movimientos por confirmar")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Revisar" })).toHaveAttribute("href", "/financial/scans");
    });

    it("sin nada pendiente, la tarjeta de avisos lo dice", () => {
        const metrics = { ...METRICS, pendingTransactions: 0 };
        render(<HomeDesktop metrics={metrics} alerts={alertsFor(metrics, 0, 0)} />);

        expect(screen.getByText(/todo está al día/)).toBeInTheDocument();
    });

    it("agrupa los accesos por módulo, con la configuración cerrando cada fila", () => {
        render(<HomeDesktop {...BASE} />);

        const accesos = screen.getByRole("heading", { name: "Accesos rápidos" })
            .parentElement?.parentElement as HTMLElement;
        const titulos = within(accesos).getAllByRole("link").map(link => link.textContent);

        expect(titulos[0]).toContain("Transacciones");
        expect(titulos[3]).toContain("Configuración de finanzas");
        expect(titulos[4]).toContain("Compras");
        expect(titulos[7]).toContain("Configuración de market");
    });
});
