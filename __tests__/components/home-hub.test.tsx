import { render, screen, within } from "@testing-library/react";
import { HomeHub } from "@/presentation/components/dashboard/HomeHub";

// El diálogo de captura navega al resumen tras interpretar.
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
}));

/** Relativo a hoy: la fila cuenta días contra el reloj, no contra una fecha fija. */
function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
}

const BASE = {
    userFirstName: "Xavier",
    todayLabel: "viernes, 21 de agosto",
    balances: { total: 4, pending: 4, lastAsOf: daysAgo(12) },
    pendingScans: 1,
};

describe("HomeHub", () => {
    it("abre con las tres vías de registro, no con cifras", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("heading", { name: "Hola, Xavier" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Registrar un movimiento" })).toBeInTheDocument();
        for (const way of ["Audio", "Texto", "Formulario"]) {
            expect(screen.getByRole("button", { name: way })).toBeInTheDocument();
        }
    });

    it("lleva a los paneles de cada módulo", () => {
        render(<HomeHub {...BASE} />);

        expect(screen.getByRole("link", { name: /Panel financiero/ }))
            .toHaveAttribute("href", "/financial");
        expect(screen.getByRole("link", { name: /Panel de compras/ }))
            .toHaveAttribute("href", "/market/analytics");
    });

    it("pide poner los saldos al día, con una palabra y el contador", () => {
        render(<HomeHub {...BASE} />);

        const chip = screen.getByRole("link", { name: /^Saldos/ });
        expect(chip).toHaveAttribute("href", "/financial/balances");
        expect(within(chip).getByText("4")).toBeInTheDocument();
    });

    it("cuando ninguna cuenta espera corte, lo dice sin número", () => {
        render(<HomeHub {...BASE} balances={{ total: 4, pending: 0, lastAsOf: daysAgo(1) }} />);

        const chip = screen.getByRole("link", { name: /^Saldos/ });
        expect(within(chip).getByText("Al día")).toBeInTheDocument();
    });

    it("cuenta los escaneos que esperan en la bandeja", () => {
        render(<HomeHub {...BASE} pendingScans={233} />);

        const chip = screen.getByRole("link", { name: /^Escaneos/ });
        expect(chip).toHaveAttribute("href", "/financial/scans");
        expect(within(chip).getByText("233")).toBeInTheDocument();
    });

    it("no menciona escaneos cuando la bandeja está vacía", () => {
        render(<HomeHub {...BASE} pendingScans={0} />);

        expect(screen.queryByRole("link", { name: /^Escaneos/ })).not.toBeInTheDocument();
    });

    it("pone el historial al frente de los accesos", () => {
        render(<HomeHub {...BASE} />);

        const accesos = screen.getByRole("link", { name: /Transacciones/ })
            .parentElement as HTMLElement;
        const titulos = within(accesos).getAllByRole("link")
            .map(link => link.textContent?.trim().split("Historial")[0]);

        expect(titulos[0]).toContain("Transacciones");
    });

    it("esconde la sección de atención cuando no hay cuentas ni escaneos", () => {
        render(
            <HomeHub
                {...BASE}
                balances={{ total: 0, pending: 0, lastAsOf: null }}
                pendingScans={0}
            />,
        );

        expect(screen.queryByText("Requiere tu atención")).not.toBeInTheDocument();
        // Los accesos siguen ahí: el inicio no se queda sin a dónde ir.
        expect(screen.getByRole("link", { name: /Bancos/ })).toBeInTheDocument();
    });
});
