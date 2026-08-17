import { render, screen } from "@testing-library/react";
import { ReconcileClient } from "@/presentation/bank/components/ReconcileClient";
import type { ReconcileState } from "@/app/actions/bank-reconcile";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const state: ReconcileState = {
    exact: [{
        key: "|0814", suffixDigits: "0814", prefixDigits: "",
        occurrences: 52,
        samples: ["XXXXXX0814", "******0814", "AHO - XXXXXX0814"],
        observationIds: ["o1", "o2", "o3"], candidateIds: ["a1"],
        institutionHint: "Banco del Austro", brand: null, accountTypeHint: "SAVINGS",
        accountId: "a1", cardId: null,
    }],
    inferred: [{
        key: "542258|361", suffixDigits: "361", prefixDigits: "542258",
        occurrences: 22,
        samples: ["****361", "542258XXXXXXX361", "Mastercard 8361"],
        observationIds: ["o4"], candidateIds: ["c1"],
        institutionHint: null, brand: "Mastercard", accountTypeHint: null,
        accountId: null, cardId: "c1",
        evidence: "361 coincide con una sola identidad y no hay otro candidato",
    }],
    pending: [{
        key: "22|58", suffixDigits: "58", prefixDigits: "22",
        occurrences: 9,
        samples: ["22XXXXXX58", "28XXX58"],
        observationIds: ["o5"], candidateIds: ["a3", "a4"],
        institutionHint: null, brand: null, accountTypeHint: null,
        accountId: null, cardId: null,
    }],
    identities: [
        { id: "a1", kind: "ACCOUNT", label: "Ahorros Principal ••••0814" },
        { id: "a3", kind: "ACCOUNT", label: "Ahorros ••••9558" },
        { id: "a4", kind: "ACCOUNT", label: "Corriente ••••4058" },
        { id: "c1", kind: "CARD", label: "Pacificard XXXX8361" },
    ],
    totalMovements: 83,
};

describe("ReconcileClient", () => {
    it("agrupa en resueltas, inferidas y pendientes", () => {
        render(<ReconcileClient initialData={state} />);
        // Cada nombre sale dos veces: en el subtítulo de la cabecera y como
        // título de su sección.
        expect(screen.getAllByText(/resueltas/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/inferidas/i)).toHaveLength(2);
        expect(screen.getAllByText(/pendientes/i)).toHaveLength(2);
    });

    it("una inferida muestra por qué se ligó", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/361 coincide con una sola identidad/)).toBeInTheDocument();
    });

    it("una ambigua ofrece sus candidatos y no preselecciona ninguno", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText("Ahorros ••••9558")).toBeInTheDocument();
        expect(screen.getByText("Corriente ••••4058")).toBeInTheDocument();
        // Ninguno viene marcado: elegir es del usuario.
        expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    });

    it("las cadenas crudas se muestran como evidencia", () => {
        // Es la única pantalla donde el raw sale a la superficie.
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText("AHO - XXXXXX0814")).toBeInTheDocument();
        expect(screen.getByText("542258XXXXXXX361")).toBeInTheDocument();
        expect(screen.getByText("28XXX58")).toBeInTheDocument();
    });

    it("dice cuántos movimientos re-apuntará al confirmar", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/83 movimientos/)).toBeInTheDocument();
    });

    it("avisa que nada entra a los saldos antes de confirmar", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/no entra a tus saldos hasta que lo confirmes/i)).toBeInTheDocument();
    });

    it("muestra el conteo de transacciones de cada grupo", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/52 tx/)).toBeInTheDocument();
        expect(screen.getByText(/9 tx/)).toBeInTheDocument();
    });

    it("sin nada que conciliar muestra el estado vacío", () => {
        render(<ReconcileClient initialData={{
            exact: [], inferred: [], pending: [], identities: [], totalMovements: 0,
        }} />);
        expect(screen.getByText(/no hay nada que conciliar/i)).toBeInTheDocument();
    });
});
