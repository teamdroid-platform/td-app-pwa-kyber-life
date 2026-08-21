import { render, screen, within } from "@testing-library/react";
import { HomeHub, type HomeMetrics } from "@/presentation/components/dashboard/HomeHub";
import { formatMoney } from "@/lib/home-overview";

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

/** Relativo a hoy: la fila cuenta días contra el reloj, no contra una fecha fija. */
function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
}

const METRICS: HomeMetrics = {
    currency: "USD",
    totalBalance: 24560,
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

const BASE = {
    userFirstName: "Xavier",
    todayLabel: "viernes, 21 de agosto",
    balances: { total: 4, pending: 4, lastAsOf: daysAgo(12) },
    pendingScans: 1,
    metrics: METRICS,
};

describe("HomeHub", () => {
    it("saluda y abre con las cuatro vías de registro", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("heading", { name: /Bienvenido, Xavier/ })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Registrar un movimiento" })).toBeInTheDocument();
        for (const way of ["Audio", "Texto", "Formulario"]) {
            expect(screen.getByRole("button", { name: new RegExp(way) })).toBeInTheDocument();
        }
        // Escanear no es una vía del diálogo: lleva a la bandeja del escáner.
        expect(screen.getByRole("link", { name: /Escanear comprobante/ }))
            .toHaveAttribute("href", "/financial/scanner");
    });

    it("encabeza con las cifras del periodo, cada una hacia donde se explica", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("link", { name: /Saldo total/ })).toHaveAttribute("href", "/financial/balances");
        expect(screen.getByText(money(24560))).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Gastos este mes/ })).toHaveAttribute("href", "/financial/transactions");
        expect(screen.getByText(/4,3 % vs periodo anterior/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Cuentas conectadas/ })).toHaveAttribute("href", "/financial/banks");
    });

    it("sin gasto el periodo anterior, no inventa un porcentaje", () => {
        render(<HomeHub {...BASE} metrics={{ ...METRICS, expensesDeltaPct: null }} />);

        expect(screen.getByText("Sin gasto en el periodo anterior")).toBeInTheDocument();
    });

    it("dibuja el flujo del periodo con sus tres cifras", () => {
        render(<HomeHub {...BASE} />);

        const panel = screen.getByRole("heading", { name: "Panel financiero" }).closest("section") as HTMLElement;
        expect(within(panel).getByText("Ingresos")).toBeInTheDocument();
        expect(within(panel).getByText(money(8450))).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: /Ver panel financiero/ }))
            .toHaveAttribute("href", "/financial");
    });

    it("reparte el gasto de compras por categoría y lleva al análisis", () => {
        render(<HomeHub {...BASE} />);

        const panel = screen.getByRole("heading", { name: "Panel de compras" }).closest("section") as HTMLElement;
        expect(within(panel).getByText("Supermercado")).toBeInTheDocument();
        expect(within(panel).getByText("60 %")).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: /Ver análisis completo/ }))
            .toHaveAttribute("href", "/market/analytics");
    });

    it("sin compras cerradas lo dice, en vez de dibujar un anillo vacío", () => {
        render(<HomeHub {...BASE} metrics={{ ...METRICS, purchases: { slices: [], total: 0 } }} />);

        expect(screen.getByText(/Todavía no hay compras cerradas/)).toBeInTheDocument();
    });

    it("lista los últimos movimientos con su signo y su ficha", () => {
        render(<HomeHub {...BASE} />);

        const movimiento = screen.getByRole("link", { name: /Supermaxi - Tumbaco/ });
        expect(movimiento).toHaveAttribute("href", "/financial/transactions/t1");
        expect(screen.getByText(`−${money(86.45)}`)).toBeInTheDocument();
        expect(screen.getByText(`+${money(1250)}`)).toBeInTheDocument();
    });

    it("convierte lo pendiente en avisos con su botón", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByText("1 escaneo pendiente")).toBeInTheDocument();
        expect(screen.getByText("4 cuentas sin corte reciente")).toBeInTheDocument();
        expect(screen.getByText("3 movimientos por confirmar")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Revisar" })).toHaveAttribute("href", "/financial/scans");
    });

    it("sin nada pendiente, la tarjeta de avisos lo dice", () => {
        render(
            <HomeHub
                {...BASE}
                balances={{ total: 4, pending: 0, lastAsOf: daysAgo(1) }}
                pendingScans={0}
                metrics={{ ...METRICS, pendingTransactions: 0 }}
            />,
        );

        expect(screen.getByText(/todo está al día/)).toBeInTheDocument();
    });

    // Móvil conserva la estructura de siempre; es CSS (`lg:hidden`) el que la
    // esconde en escritorio, así que aquí se comprueba que existe y a dónde va.
    it("mantiene las fichas de atención y los dos paneles del móvil", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("link", { name: /^Saldos/ })).toHaveAttribute("href", "/financial/balances");
        expect(screen.getByRole("link", { name: /Panel financiero Saldos, flujo y categorías/ }))
            .toHaveAttribute("href", "/financial");
        expect(screen.getByRole("link", { name: /Panel de compras Precios, productos y ahorro/ }))
            .toHaveAttribute("href", "/market/analytics");
    });

    it("sin ninguna cuenta registrada, no ofrece declarar saldos", () => {
        render(
            <HomeHub
                {...BASE}
                balances={{ total: 0, pending: 0, lastAsOf: null }}
                metrics={{ ...METRICS, accounts: 0, accountsWithBalance: 0 }}
            />,
        );

        expect(screen.queryByRole("link", { name: /^Saldos/ })).not.toBeInTheDocument();
    });

    // En un teléfono el servidor no mide el tablero: `metrics` llega en `null`
    // y esos bloques no se declaran, para no pagar consultas que nadie ve.
    it("sin cifras medidas, no dibuja el tablero pero sí lo de siempre", () => {
        render(<HomeHub {...BASE} metrics={null} />);

        expect(screen.queryByRole("link", { name: /Saldo total/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Panel financiero" })).not.toBeInTheDocument();
        expect(screen.queryByText(/Actividad reciente/)).not.toBeInTheDocument();

        expect(screen.getByRole("heading", { name: "Registrar un movimiento" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Saldos/ })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Accesos rápidos" })).toBeInTheDocument();
    });

    it("agrupa los accesos por módulo, con la configuración cerrando cada fila", () => {
        render(<HomeHub {...BASE} />);

        const accesos = screen.getByRole("heading", { name: "Accesos rápidos" })
            .parentElement?.parentElement as HTMLElement;
        const titulos = within(accesos).getAllByRole("link").map(link => link.textContent);

        expect(titulos[0]).toContain("Transacciones");
        expect(titulos[3]).toContain("Configuración de finanzas");
        expect(titulos[4]).toContain("Compras");
        expect(titulos[7]).toContain("Configuración de market");
    });
});
