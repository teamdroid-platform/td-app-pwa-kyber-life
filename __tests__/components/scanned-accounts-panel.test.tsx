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

    it("nombra cada lado del movimiento", () => {
        render(
            <ScannedAccountsPanel accounts={[
                view(),
                view({ role: "DESTINATION", raw: "XXXXXX1582", display: "••••1582", match: null, resolution: "PENDING" }),
            ]} />,
        );

        expect(screen.getByText("Origen")).toBeInTheDocument();
        expect(screen.getByText("Destino")).toBeInTheDocument();
    });

    it("muestra el número estandarizado y a qué cuenta corresponde", () => {
        render(<ScannedAccountsPanel accounts={[view()]} />);

        expect(screen.getByText("••••0814")).toBeInTheDocument();
        expect(screen.getByText(/Ahorros Principal/)).toBeInTheDocument();
        expect(screen.getByText(/Banco del Austro/)).toBeInTheDocument();
    });

    it("deja la cadena del banco a la vista como evidencia", () => {
        render(<ScannedAccountsPanel accounts={[view()]} />);
        expect(screen.getByText("AHO - XXXXXX0814")).toBeInTheDocument();
    });

    it("avisa cuando la atribución vino de los últimos dígitos", () => {
        render(<ScannedAccountsPanel accounts={[view({ resolution: "INFERRED" })]} />);
        expect(screen.getByText(/por los últimos dígitos/)).toBeInTheDocument();
    });

    it("de un destino sin identificar dice que no es tuyo", () => {
        render(<ScannedAccountsPanel accounts={[
            view({ role: "DESTINATION", match: null, resolution: "PENDING" }),
        ]} />);

        expect(screen.getByText(/No es una cuenta tuya/)).toBeInTheDocument();
    });

    it("de un origen sin identificar no afirma que sea de otro: solo que falta registrarlo", () => {
        render(<ScannedAccountsPanel accounts={[
            view({ match: null, resolution: "PENDING" }),
        ]} />);

        expect(screen.getByText(/Aún sin registrar en Bancos/)).toBeInTheDocument();
        expect(screen.queryByText(/No es una cuenta tuya/)).not.toBeInTheDocument();
    });

    it("rescata el emisor que nombra el texto cuando no hay cuenta que mostrar", () => {
        render(<ScannedAccountsPanel accounts={[
            view({ match: null, resolution: "PENDING", institutionHint: "Pichincha" }),
        ]} />);

        expect(screen.getByText(/Pichincha/)).toBeInTheDocument();
    });

    it("omite la evidencia cuando no hay cadena escaneada que juzgar", () => {
        render(<ScannedAccountsPanel accounts={[view({ raw: "" })]} />);

        expect(screen.getByText("••••0814")).toBeInTheDocument();
        expect(screen.queryByText("AHO - XXXXXX0814")).not.toBeInTheDocument();
    });

    it("acepta otro título para la misma información ya confirmada", () => {
        render(<ScannedAccountsPanel accounts={[view()]} title="Cuentas del movimiento" />);

        expect(screen.getByText("Cuentas del movimiento")).toBeInTheDocument();
    });
});
