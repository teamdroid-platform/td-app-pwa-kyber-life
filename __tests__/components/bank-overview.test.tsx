import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { BankOverviewClient } from "@/presentation/bank/components/BankOverviewClient";
import type { BankOverview } from "@/application/services/bank-service";

// Los sheets de alta llaman useRouter para refrescar tras guardar.
jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const overview: BankOverview = {
    institutions: [{
        id: "i1", ownerUserId: "u", name: "Banco del Austro", kind: "BANK",
        isUnconfirmed: false, ...STAMPS,
    }],
    accounts: [{
        id: "a1", ownerUserId: "u", institutionId: "i1",         accountType: "SAVINGS", lastFour: "0814", currency: "USD", status: "ACTIVE",
        isUnconfirmed: false, balance: 2104.18, lastSnapshotAt: "2026-08-01T00:00:00Z",
        ...STAMPS,
    }],
    cards: [
        {
            id: "c1", ownerUserId: "u", institutionId: "i1",             cardType: "CREDIT", lastFour: "8361", currency: "USD", creditLimit: 3000,
            statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
            debt: 842.15, availableCredit: 2157.85, openStatement: null, ...STAMPS,
        },
        {
            id: "c2", ownerUserId: "u", institutionId: "i1", accountId: "a1",
            cardType: "DEBIT", lastFour: "2780", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false,
            debt: 0, availableCredit: null, openStatement: null, ...STAMPS,
        },
    ],
    totalAvailable: 2104.18, totalDebt: 842.15, totalAvailableCredit: 2157.85,
    cashBalance: 185, nextDueDate: "2026-08-28", unconfirmedCount: 0,
};

const VACIA: BankOverview["institutions"][number] = {
    id: "i8", ownerUserId: "u", name: "Cooperativa JEP", kind: "COOPERATIVE",
    isUnconfirmed: false, ...STAMPS,
};

/** El caso real: la misma cooperativa registrada tres veces. */
const JARDIN: BankOverview["institutions"] = [
    { ...overview.institutions[0], id: "i1", name: "COAC Jardín Azuayo", kind: "COOPERATIVE" },
    { ...VACIA, id: "i2", name: "Coop Jardín Azuayo" },
    { ...VACIA, id: "i3", name: "Cooperativa de Ahorro y Crédito Jardín Azuayo" },
];

describe("BankOverviewClient", () => {
    it("identifica cada fila con su acrónimo y sus últimos dígitos", () => {
        render(<BankOverviewClient initialData={overview} />);

        // El tipo lo dice el acrónimo, el cuál lo dicen los últimos dígitos:
        // antes el título repetía el subtítulo entero.
        expect(screen.getByTitle("Ahorros")).toHaveTextContent("AHO");
        expect(screen.getByTitle("Tarjeta de crédito")).toHaveTextContent("TCR");
        expect(screen.getByTitle("Tarjeta de débito")).toHaveTextContent("TDE");

        expect(screen.getByText("XXXX0814")).toBeInTheDocument();
        expect(screen.getByText("XXXX8361")).toBeInTheDocument();
        expect(screen.getByText("XXXX2780")).toBeInTheDocument();
    });

    it("muestra el disponible, la deuda y el efectivo", () => {
        render(<BankOverviewClient initialData={overview} />);
        // Con una sola cuenta el monto sale tres veces: hero, total del grupo y
        // la fila de la cuenta.
        expect(screen.getAllByText("$2.104,18")).toHaveLength(3);
        // La deuda sale en la píldora del hero y en la fila de la tarjeta.
        expect(screen.getAllByText(/842,15/)).toHaveLength(2);
        // Efectivo y cupo dejaron de ser tarjetas sueltas: ahora son datos de
        // apoyo bajo la cifra grande, cada uno con su rótulo.
        expect(screen.getByText("Efectivo")).toBeInTheDocument();
        expect(screen.getByText("$185,00")).toBeInTheDocument();
        expect(screen.getByText("Cupo libre")).toBeInTheDocument();
        expect(screen.getByText("$2.157,85")).toBeInTheDocument();
    });

    it("la tarjeta de débito dice de qué cuenta come, no un saldo propio", () => {
        render(<BankOverviewClient initialData={overview} />);
        // La fila del débito nombra la cuenta de la que descuenta.
        expect(screen.getByText(/→ Ahorros XXXX0814/)).toBeInTheDocument();
        expect(screen.getByText(/usa el saldo de la cuenta/i)).toBeInTheDocument();
        // La de débito no muestra deuda ni cupo.
        expect(screen.queryByText(/^−\$0,00$/)).not.toBeInTheDocument();
    });

    it("una tarjeta de crédito al día dice «sin deuda», no «menos cero»", () => {
        render(<BankOverviewClient initialData={{
            ...overview,
            cards: [{ ...overview.cards[0], debt: 0, availableCredit: 3000 }],
            totalDebt: 0,
        }} />);

        expect(screen.getByText("Sin deuda")).toBeInTheDocument();
        expect(screen.queryByText("−$0,00")).not.toBeInTheDocument();
    });

    it("cada emisor se pliega desde su cabecera", () => {
        render(<BankOverviewClient initialData={overview} />);

        const header = screen.getByRole("button", { name: /Banco del Austro/i, expanded: true });
        expect(screen.getByText("XXXX0814")).toBeInTheDocument();

        act(() => { fireEvent.click(header); });

        expect(header).toHaveAttribute("aria-expanded", "false");
        // Plegado esconde las filas, no el total: el saldo del grupo sigue a la vista.
        expect(screen.queryByText("XXXX0814")).not.toBeInTheDocument();
        expect(screen.getAllByText("$2.104,18").length).toBeGreaterThan(0);
    });

    it("una institución vacía se anuncia como tal sin ocupar una caja", () => {
        render(<BankOverviewClient initialData={{
            ...overview,
            institutions: [...overview.institutions, VACIA],
        }} />);

        expect(screen.getByRole("button", { name: /Cooperativa JEP.*vacía/i })).toBeInTheDocument();
    });

    it("detecta los emisores repetidos y ofrece unificarlos", () => {
        render(<BankOverviewClient initialData={{ ...overview, institutions: JARDIN }} />);

        // El usuario no tiene que ir a buscar la opción: la pantalla se la ofrece.
        const aviso = screen.getByRole("button", { name: /3 emisores parecen el mismo/i });
        expect(aviso).toHaveTextContent("«Jardin Azuayo» está repetido");

        act(() => { fireEvent.click(aviso); });

        expect(screen.getByText(/Unificar «Jardin Azuayo»/)).toBeInTheDocument();
        // Sugiere quedarse con la que más tiene registrado.
        expect(screen.getByRole("button", { name: /Unificar en «COAC Jardín Azuayo»/ })).toBeInTheDocument();
        expect(screen.getByText(/se archivarán 2 instituciones/i)).toBeInTheDocument();
    });

    it("cualquier emisor se puede unificar a mano desde su menú", () => {
        // El detector solo ve las que comparten huella: «Coop. Jardín Azuayo
        // CJA» se le escapa por un sufijo que no es forma jurídica. La decisión
        // no puede depender de que la app la adivine.
        render(<BankOverviewClient initialData={{
            ...overview,
            institutions: [
                { ...VACIA, id: "i2", name: "Coop Jardín Azuayo" },
                { ...VACIA, id: "i3", name: "Coop. Jardín Azuayo CJA" },
            ],
        }} />);

        expect(screen.queryByText(/parecen el mismo/i)).not.toBeInTheDocument();

        act(() => { fireEvent.click(screen.getByRole("button", { name: /Acciones de Coop\. Jardín Azuayo CJA/ })); });
        act(() => { fireEvent.click(screen.getByText("Unificar con otra institución")); });

        const hoja = screen.getByRole("dialog");
        expect(within(hoja).getByText(/Unificar «Coop\. Jardín Azuayo CJA»/)).toBeInTheDocument();
        // El destino se elige entre las demás; la de origen no se ofrece.
        expect(within(hoja).getByText("Coop Jardín Azuayo")).toBeInTheDocument();
        expect(within(hoja).queryByText("Coop. Jardín Azuayo CJA")).not.toBeInTheDocument();
    });

    it("la dirección va fijada: se elige a dónde pasa lo de esta", () => {
        render(<BankOverviewClient initialData={{
            ...overview,
            institutions: [
                { ...VACIA, id: "i2", name: "Coop Jardín Azuayo" },
                { ...VACIA, id: "i3", name: "Coop. Jardín Azuayo CJA" },
            ],
        }} />);

        act(() => { fireEvent.click(screen.getByRole("button", { name: /Acciones de Coop\. Jardín Azuayo CJA/ })); });
        act(() => { fireEvent.click(screen.getByText("Unificar con otra institución")); });

        // Sin destino elegido no se puede confirmar: «unificar» sin decir con
        // qué archivaría la institución sin mover nada a ninguna parte.
        const hoja = screen.getByRole("dialog");
        expect(within(hoja).getByRole("button", { name: /Elige la institución destino/ })).toBeDisabled();

        act(() => { fireEvent.click(within(hoja).getByText("Coop Jardín Azuayo")); });
        expect(screen.getByRole("button", { name: /Pasar todo a «Coop Jardín Azuayo»/ })).toBeEnabled();
    });

    it("los cajones que no son bancos no ofrecen unificar", () => {
        render(<BankOverviewClient initialData={{
            ...overview,
            accounts: [
                ...overview.accounts,
                { ...overview.accounts[0], id: "a9", institutionId: null, accountType: "CASH", lastFour: null },
            ],
        }} />);

        // «Efectivo» y «Sin institución» agrupan, no son emisores.
        expect(screen.getByRole("button", { name: /Efectivo/, expanded: true })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Acciones de Efectivo/ })).not.toBeInTheDocument();
    });

    it("no avisa de duplicados cuando los emisores solo comparten «Banco»", () => {
        render(<BankOverviewClient initialData={{
            ...overview,
            institutions: [
                ...overview.institutions,
                { ...VACIA, id: "i9", name: "Banco del Pacífico" },
            ],
        }} />);

        expect(screen.queryByText(/parecen el mismo/i)).not.toBeInTheDocument();
    });

    it("el lápiz suelto se va: editar vive en el menú de la fila", () => {
        render(<BankOverviewClient initialData={overview} />);

        act(() => { fireEvent.click(screen.getByRole("button", { name: /Acciones de AHO XXXX0814/i })); });

        expect(screen.getByText("Editar")).toBeInTheDocument();
        expect(screen.getByText("Registrar saldo")).toBeInTheDocument();
        expect(screen.getByText("Archivar cuenta")).toBeInTheDocument();
        expect(screen.getByText("Ver detalle y movimientos")).toBeInTheDocument();
    });

    it("una tarjeta no ofrece registrar saldo: no tiene saldo propio", () => {
        render(<BankOverviewClient initialData={overview} />);

        act(() => { fireEvent.click(screen.getByRole("button", { name: /Acciones de TCR XXXX8361/i })); });

        expect(screen.getByText("Archivar tarjeta")).toBeInTheDocument();
        expect(screen.queryByText("Registrar saldo")).not.toBeInTheDocument();
    });

    it("el alta es una sola puerta con las tres opciones dentro", () => {
        render(<BankOverviewClient initialData={overview} />);

        act(() => { fireEvent.click(screen.getByRole("button", { name: /Añadir cuenta, tarjeta o institución/i })); });

        expect(screen.getByText("¿Qué quieres añadir?")).toBeInTheDocument();
        expect(screen.getByText("Cuenta")).toBeInTheDocument();
        expect(screen.getByText("Tarjeta")).toBeInTheDocument();
        expect(screen.getByText("Institución")).toBeInTheDocument();
    });

    it("avisa cuando hay cuentas sin revisar", () => {
        render(<BankOverviewClient initialData={{ ...overview, unconfirmedCount: 7 }} />);
        expect(screen.getByText(/7 cuentas sin revisar/i)).toBeInTheDocument();
    });

    it("sin ninguna pendiente baja el tono, pero no esconde Conciliar", () => {
        render(<BankOverviewClient initialData={overview} />);

        expect(screen.queryByText(/cuentas sin revisar/i)).not.toBeInTheDocument();
        // Los números por atribuir se acumulan aunque no haya identidades sin
        // revisar; sin este enlace la pantalla solo se alcanzaba por URL.
        expect(screen.getByRole("link", { name: /Conciliar/i })).toBeInTheDocument();
    });

    it("con la base vacía muestra el estado vacío en vez de reventar", () => {
        render(<BankOverviewClient initialData={{
            institutions: [], accounts: [], cards: [],
            totalAvailable: 0, totalDebt: 0, totalAvailableCredit: 0,
            cashBalance: 0, nextDueDate: null, unconfirmedCount: 0,
        }} />);
        expect(screen.getByText(/todavía no registras/i)).toBeInTheDocument();
    });
});
