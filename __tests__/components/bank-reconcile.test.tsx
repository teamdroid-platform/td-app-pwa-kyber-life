import { act, fireEvent, render, screen } from "@testing-library/react";
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
    missingIssuer: { accounts: [], cards: [] },
    institutions: [],
    accounts: [],
};

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

/** Una cuenta nacida de un escaneo que no dedujo el banco. */
const SIN_EMISOR: ReconcileState["missingIssuer"]["accounts"][number] = {
    id: "a9", ownerUserId: "u", institutionId: null, accountType: "SAVINGS",
    lastFour: "8729", currency: "USD", status: "ACTIVE", isUnconfirmed: true,
    ...STAMPS,
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

    it("el número se muestra una sola vez", () => {
        render(<ReconcileClient initialData={state} />);

        // `XXXXXX0814` y `******0814` son el mismo número que el título
        // `XXXX0814`: solo cambia el largo de la máscara.
        expect(screen.getByText("XXXX0814")).toBeInTheDocument();
        expect(screen.queryByText("XXXXXX0814")).not.toBeInTheDocument();
        expect(screen.queryByText("******0814")).not.toBeInTheDocument();
    });

    it("la cadena cruda sobrevive cuando aporta dígitos que el número no tiene", () => {
        // Es la única pantalla donde el raw sale a la superficie, y aquí sí
        // dice algo: el normalizado sacrifica el prefijo largo.
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText("542258XXXXXXX361")).toBeInTheDocument();
        expect(screen.getByText("28XXX58")).toBeInTheDocument();

        // «AHO - XXXXXX0814» sí se va: sus dígitos son los del título, y el
        // «AHO» ya lo dice el tipo sugerido en la misma fila.
        expect(screen.queryByText("AHO - XXXXXX0814")).not.toBeInTheDocument();
    });

    it("dice cuántos movimientos re-apuntará al confirmar", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/83 movimientos/)).toBeInTheDocument();
    });

    it("avisa que nada entra a los saldos antes de confirmar", () => {
        render(<ReconcileClient initialData={state} />);
        // La copia anterior decía «Nada de esto no entra a tus saldos», que por
        // la doble negación afirmaba justo lo contrario de lo que quiere decir.
        expect(screen.getByText(/entra a tus saldos hasta que lo confirmes/i)).toBeInTheDocument();
        expect(screen.queryByText(/no entra a tus saldos/i)).not.toBeInTheDocument();
    });

    it("muestra el conteo de movimientos de cada grupo", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/52 mov\./)).toBeInTheDocument();
        expect(screen.getByText(/9 mov\./)).toBeInTheDocument();
    });

    it("avisa de las identidades que no se pueden confirmar por falta de emisor", () => {
        render(<ReconcileClient initialData={{
            ...state, missingIssuer: { accounts: [SIN_EMISOR], cards: [] },
        }} />);

        // El guardado reventaba contra el CHECK de la tabla; ahora se dice
        // antes de intentarlo, con la salida al lado.
        expect(screen.getByText(/1 identidad no se puede confirmar/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /XXXX8729.*Asignar emisor/ })).toBeInTheDocument();
    });

    it("sin identidades sin emisor no hay aviso", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.queryByText(/no se puede confirmar/i)).not.toBeInTheDocument();
    });

    it("una pendiente sin candidatos deja decir que sí es tuya", () => {
        render(<ReconcileClient initialData={{
            ...state,
            pending: [{ ...state.pending[0], candidateIds: [] }],
        }} />);

        // Antes la única salida era descartarla, aunque fuera una cuenta propia.
        const esMia = screen.getByRole("button", { name: "Es mía" });
        act(() => { fireEvent.click(esMia); });

        expect(screen.getByText("¿Qué es este número?")).toBeInTheDocument();
        expect(screen.getByText("Una cuenta")).toBeInTheDocument();
        expect(screen.getByText("Una tarjeta")).toBeInTheDocument();
    });

    it("sin nada que conciliar muestra el estado vacío", () => {
        render(<ReconcileClient initialData={{
            exact: [], inferred: [], pending: [], identities: [], totalMovements: 0,
            missingIssuer: { accounts: [], cards: [] }, institutions: [], accounts: [],
        }} />);
        expect(screen.getByText(/no hay nada que conciliar/i)).toBeInTheDocument();
    });
});
