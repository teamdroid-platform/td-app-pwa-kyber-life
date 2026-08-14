import React from "react";
import { render, screen } from "@testing-library/react";
import { ScannedAccountsPanel } from "@/presentation/bank/components/ScannedAccountsPanel";
import type { ScannedAccountView } from "@/application/services/bank-service";

function view(overrides: Partial<ScannedAccountView> = {}): ScannedAccountView {
    return {
        role: "SOURCE",
        raw: "AHO - XXXXXX0814",
        display: "••••0814",
        kind: "ACCOUNT",
        resolution: "EXACT",
        match: { id: "acc-1", name: "Ahorros Principal", institutionName: "Banco del Austro" },
        institutionHint: null,
        ...overrides,
    };
}

describe("ScannedAccountsPanel", () => {
    it("sin cuentas no ocupa espacio en la pantalla", () => {
        const { container } = render(<ScannedAccountsPanel accounts={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("cada lado cabe en una sola línea", () => {
        render(
            <ScannedAccountsPanel accounts={[
                view(),
                view({ role: "DESTINATION", raw: "XXXXXX1582", display: "••••1582", match: null, resolution: "PENDING" }),
            ]} />,
        );

        const filas = screen.getAllByRole("listitem");
        expect(filas).toHaveLength(2);
        expect(filas[0]).toHaveTextContent("••••0814Ahorros Principal · Banco del Austro");
        expect(filas[1]).toHaveTextContent("••••1582De un tercero");
    });

    it("distingue los lados sin gastar una línea en decirlo", () => {
        render(<ScannedAccountsPanel accounts={[
            view(),
            view({ role: "DESTINATION", match: null }),
        ]} />);

        expect(screen.getByLabelText("Origen")).toBeInTheDocument();
        expect(screen.getByLabelText("Destino")).toBeInTheDocument();
    });

    it("guarda la cadena del banco donde se pueda consultar sin ocupar sitio", () => {
        render(<ScannedAccountsPanel accounts={[view()]} />);
        expect(screen.getByTitle(/AHO - XXXXXX0814/)).toBeInTheDocument();
    });

    it("explica una coincidencia por los últimos dígitos junto a la evidencia", () => {
        render(<ScannedAccountsPanel accounts={[view({ resolution: "INFERRED" })]} />);

        expect(screen.getByTitle(/Coincide por los últimos dígitos/)).toBeInTheDocument();
        // Y no la anuncia en la línea, que es lo que la alargaba.
        expect(screen.queryByText(/Coincide por los últimos dígitos/)).not.toBeInTheDocument();
    });

    it("de un destino sin identificar dice que no es tuyo", () => {
        render(<ScannedAccountsPanel accounts={[
            view({ role: "DESTINATION", match: null, resolution: "PENDING" }),
        ]} />);

        expect(screen.getByText(/De un tercero/)).toBeInTheDocument();
    });

    it("de un origen sin identificar no afirma que sea de otro: solo que falta registrarlo", () => {
        render(<ScannedAccountsPanel accounts={[
            view({ match: null, resolution: "PENDING" }),
        ]} />);

        expect(screen.getByText(/Sin registrar/)).toBeInTheDocument();
        expect(screen.queryByText(/De un tercero/)).not.toBeInTheDocument();
    });

    it("rescata el emisor que nombra el texto cuando no hay cuenta que mostrar", () => {
        render(<ScannedAccountsPanel accounts={[
            view({ match: null, resolution: "PENDING", institutionHint: "Pichincha" }),
        ]} />);

        expect(screen.getByText("Sin registrar · Pichincha")).toBeInTheDocument();
    });

    it("sin cadena escaneada no deja un tooltip vacío", () => {
        render(<ScannedAccountsPanel accounts={[view({ raw: "" })]} />);

        expect(screen.getByRole("listitem")).not.toHaveAttribute("title");
    });

    it("acepta otro título para la misma información ya confirmada", () => {
        render(<ScannedAccountsPanel accounts={[view()]} title="Cuentas del movimiento" />);

        expect(screen.getByText("Cuentas del movimiento")).toBeInTheDocument();
    });
});
