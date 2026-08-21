import { render, screen, within } from "@testing-library/react";
import { HomeMobile } from "@/presentation/components/dashboard/HomeMobile";

// El diálogo de captura navega al resumen tras interpretar.
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
}));

/** Relativo a hoy: la ficha cuenta días contra el reloj, no contra una fecha fija. */
function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
}

const BASE = {
    balances: { total: 4, pending: 4, lastAsOf: daysAgo(12) },
    pendingScans: 1,
};

describe("HomeMobile", () => {
    it("abre con las tres vías de registro, no con cifras", () => {
        render(<HomeMobile {...BASE} />);

        expect(screen.getByRole("heading", { name: "Registrar un movimiento" })).toBeInTheDocument();
        for (const way of ["Audio", "Texto", "Formulario"]) {
            expect(screen.getByRole("button", { name: way })).toBeInTheDocument();
        }
        // Escanear es del tablero de escritorio; aquí no entra.
        expect(screen.queryByText(/Escanear comprobante/)).not.toBeInTheDocument();
    });

    it("lleva a los paneles de cada módulo", () => {
        render(<HomeMobile {...BASE} />);

        expect(screen.getByRole("link", { name: /Panel financiero/ }))
            .toHaveAttribute("href", "/financial");
        expect(screen.getByRole("link", { name: /Panel de compras/ }))
            .toHaveAttribute("href", "/market/analytics");
    });

    it("pide poner los saldos al día, con una palabra y el contador", () => {
        render(<HomeMobile {...BASE} />);

        const saldos = screen.getByRole("link", { name: /^Saldos/ });
        expect(saldos).toHaveAttribute("href", "/financial/balances");
        expect(within(saldos).getByText("4")).toBeInTheDocument();
    });

    it("cuando ninguna cuenta espera corte, lo dice sin número", () => {
        render(<HomeMobile {...BASE} balances={{ total: 4, pending: 0, lastAsOf: daysAgo(1) }} />);

        const saldos = screen.getByRole("link", { name: /^Saldos/ });
        expect(within(saldos).getByText("Al día")).toBeInTheDocument();
    });

    it("cuenta los escaneos que esperan en la bandeja", () => {
        render(<HomeMobile {...BASE} pendingScans={7} />);

        const escaneos = screen.getByRole("link", { name: /Escaneos/ });
        expect(escaneos).toHaveAttribute("href", "/financial/scans");
        expect(within(escaneos).getByText("7")).toBeInTheDocument();
    });

    it("mantiene la ficha de escaneos con la bandeja vacía, diciendo que está al día", () => {
        render(<HomeMobile {...BASE} pendingScans={0} />);

        const escaneos = screen.getByRole("link", { name: /Escaneos/ });
        expect(within(escaneos).getByText("Al día")).toBeInTheDocument();
    });

    it("sin ninguna cuenta registrada, no ofrece declarar saldos", () => {
        render(<HomeMobile {...BASE} balances={{ total: 0, pending: 0, lastAsOf: null }} />);

        expect(screen.queryByRole("link", { name: /^Saldos/ })).not.toBeInTheDocument();
    });

    it("pone el historial al frente de los accesos", () => {
        render(<HomeMobile {...BASE} />);

        const accesos = screen.getByRole("link", { name: /Transacciones/ })
            .parentElement as HTMLElement;
        const titulos = within(accesos).getAllByRole("link")
            .map(link => link.textContent?.trim().split("Historial")[0]);

        expect(titulos[0]).toContain("Transacciones");
        expect(titulos).toHaveLength(4);
    });
});
