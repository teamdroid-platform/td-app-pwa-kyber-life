import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScannedAccountsPanel, AccountsTrail } from "@/presentation/bank/components/ScannedAccountsPanel";
import type { ScannedAccountView } from "@/application/services/bank-service";

function view(overrides: Partial<ScannedAccountView> = {}): ScannedAccountView {
    return {
        role: "SOURCE",
        raw: "AHO - XXXXXX0814",
        display: "XXXX0814",
        kind: "ACCOUNT",
        resolution: "EXACT",
        match: { id: "acc-1", typeLabel: "Ahorros", typeAcronym: "AHO", institutionName: "Banco del Austro" },
        institutionHint: null,
        ownership: null,
        decision: null,
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
                view({ role: "DESTINATION", raw: "XXXXXX1582", display: "XXXX1582", match: null, resolution: "PENDING" }),
            ]} />,
        );

        const filas = screen.getAllByRole("listitem");
        expect(filas).toHaveLength(2);
        // Tres letras, cuatro dígitos y de quién es. El tipo ya no se repite
        // en el texto: lo dice el acrónimo.
        expect(filas[0]).toHaveTextContent("AHOXXXX0814Banco del Austro");
        expect(filas[1]).toHaveTextContent("TERXXXX1582De un tercero");
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

describe("declarar de quién es cada cuenta", () => {
    const sinIdentificar = () => view({ match: null, resolution: "PENDING" });

    it("no pregunta cuando el panel es de solo lectura", () => {
        render(<ScannedAccountsPanel accounts={[sinIdentificar()]} />);

        expect(screen.queryByRole("button", { name: "Es mía" })).not.toBeInTheDocument();
    });

    it("pregunta por lo que no está identificado", () => {
        render(<ScannedAccountsPanel accounts={[sinIdentificar()]} onOwnershipChange={jest.fn()} />);

        expect(screen.getByRole("button", { name: "Es mía" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "De un tercero" })).toBeInTheDocument();
    });

    it("no discute lo que ya corresponde a una cuenta tuya", () => {
        // El número apunta a un registro que existe: no hay nada que declarar.
        render(<ScannedAccountsPanel accounts={[view()]} onOwnershipChange={jest.fn()} />);

        expect(screen.queryByRole("button", { name: "Es mía" })).not.toBeInTheDocument();
    });

    it("arranca en lo que se supone por el lado: un origen es propio…", () => {
        render(<ScannedAccountsPanel accounts={[sinIdentificar()]} onOwnershipChange={jest.fn()} />);

        expect(screen.getByRole("button", { name: "Es mía" })).toHaveAttribute("aria-pressed", "true");
    });

    it("…y un destino se supone ajeno, que es lo que fallaba entre cuentas propias", () => {
        render(
            <ScannedAccountsPanel
                accounts={[sinIdentificar()].map(a => ({ ...a, role: "DESTINATION" as const }))}
                onOwnershipChange={jest.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: "De un tercero" })).toHaveAttribute("aria-pressed", "true");
    });

    it("elegir emite la declaración con la cadena del banco", () => {
        const onOwnershipChange = jest.fn();
        render(
            <ScannedAccountsPanel
                accounts={[sinIdentificar()].map(a => ({ ...a, role: "DESTINATION" as const }))}
                onOwnershipChange={onOwnershipChange}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Es mía" }));

        expect(onOwnershipChange).toHaveBeenCalledWith(
            "AHO - XXXXXX0814",
            expect.objectContaining({ ownership: "MINE" }),
        );
    });

    it("lo declarado manda sobre la suposición del lado", () => {
        // Un destino que el usuario marcó suyo no puede seguir diciendo que es
        // de otro: sería contradecirle a la cara.
        render(<ScannedAccountsPanel accounts={[view({
            role: "DESTINATION", match: null, resolution: "PENDING", ownership: "MINE",
        })]} />);

        expect(screen.getByText(/Tuya, sin registrar aún/)).toBeInTheDocument();
        expect(screen.queryByText(/De un tercero/)).not.toBeInTheDocument();
    });

    it("y también en el recorrido de la fila", () => {
        render(<AccountsTrail accounts={[view({
            role: "DESTINATION", display: "10XXXXXX11", match: null,
            resolution: "PENDING", ownership: "MINE",
        })]} />);

        expect(screen.getByText(/Tuya, sin registrar aún/)).toBeInTheDocument();
    });

    it("y refleja lo declarado cuando el usuario ya eligió", () => {
        render(
            <ScannedAccountsPanel
                accounts={[view({ match: null, resolution: "PENDING", ownership: "MINE" })]}
                onOwnershipChange={jest.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: "Es mía" })).toHaveAttribute("aria-pressed", "true");
    });
});

describe("AccountsTrail", () => {
    it("resume el recorrido para caber dentro de otra fila", () => {
        render(
            <AccountsTrail accounts={[
                view({ display: "XXXX0814" }),
                view({ role: "DESTINATION", display: "XXXX1582", match: null, raw: "XXXXXX1582" }),
            ]} />,
        );

        expect(screen.getByText("XXXX0814")).toBeInTheDocument();
        expect(screen.getByText("XXXX1582")).toBeInTheDocument();
        expect(screen.getByLabelText("Origen")).toBeInTheDocument();
        expect(screen.getByLabelText("Destino")).toBeInTheDocument();
    });

    it("nombra la cuenta cuando se sabe cuál es", () => {
        render(<AccountsTrail accounts={[view()]} />);
        expect(screen.getByTitle("Ahorros")).toHaveTextContent("AHO");
        expect(screen.getByText("Banco del Austro")).toBeInTheDocument();
    });

    it("dice qué es la cuenta, sin repetir el número que ya se ve", () => {
        // Las cuentas no tienen nombre: la fila muestra el número y, al lado,
        // qué es y de quién.
        render(<AccountsTrail accounts={[view({
            display: "25XXXXXX10",
            match: { id: "a1", typeLabel: "Ahorros", typeAcronym: "AHO", institutionName: "COAC Jardín Azuayo" },
        })]} />);

        // El acrónimo dice qué es; el texto de al lado, de quién. Repetir el
        // tipo en ambos sería decir dos veces lo mismo.
        expect(screen.getByTitle("Ahorros")).toHaveTextContent("AHO");
        expect(screen.getByText("COAC Jardín Azuayo")).toBeInTheDocument();
        // El banco solo escribió dos dígitos después de la máscara, así que se
        // muestran dos: rellenar hasta cuatro inventaría un número que nadie
        // escribió. El «25» del principio sí se conoce y cabe en los ocho.
        expect(screen.getByText("25XXXX10")).toBeInTheDocument();
    });

    it("dice a quién pertenece lo que no es tuyo", () => {
        render(<AccountsTrail accounts={[view({
            role: "DESTINATION", display: "XXXX1582", match: null, resolution: "PENDING",
        })]} />);

        expect(screen.getByText("De un tercero")).toBeInTheDocument();
    });

    it("sin cuentas no pinta nada", () => {
        const { container } = render(<AccountsTrail accounts={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
