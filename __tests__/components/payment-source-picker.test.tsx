import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentSourcePicker, paymentSourceForCard } from "@/presentation/bank/components/PaymentSourcePicker";

// Los formularios de alta que el picker puede abrir hablan con el router y con
// el servidor; aquí solo se comprueba que se ofrezcan.
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/actions/bank", () => ({
    createBankAccountAction: jest.fn(),
    createBankCardAction: jest.fn(),
    createBankInstitutionAction: jest.fn(),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const accounts = [
    {
        id: "a1", ownerUserId: "u", institutionId: "i1",         accountType: "SAVINGS" as const, lastFour: "0814", currency: "USD",
        status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
    {
        id: "cash", ownerUserId: "u", institutionId: null,         accountType: "CASH" as const, currency: "USD",
        status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
];

const cards = [
    {
        id: "c1", ownerUserId: "u", institutionId: "i1",         cardType: "CREDIT" as const, lastFour: "8361", currency: "USD",
        status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
    {
        id: "c2", ownerUserId: "u", institutionId: "i1", accountId: "a1",
        cardType: "DEBIT" as const, lastFour: "2780",
        currency: "USD", status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
];

describe("PaymentSourcePicker", () => {
    it("elegir una cuenta no marca pago con crédito", () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByText("Ahorros ••••0814"));

        expect(onChange).toHaveBeenCalledWith({ accountId: "a1", paidWithCredit: false });
    });

    it("elegir una tarjeta de crédito difiere el gasto", () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByText("Crédito XXXX8361"));

        expect(onChange).toHaveBeenCalledWith({ cardId: "c1", paidWithCredit: true });
    });

    it("una tarjeta de débito gasta de su cuenta, no difiere nada", () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByText("Débito XXXX2780"));

        expect(onChange).toHaveBeenCalledWith({
            cardId: "c2", accountId: "a1", paidWithCredit: false,
        });
    });

    it("volver a tocar lo seleccionado lo limpia", () => {
        const onChange = jest.fn();
        render(
            <PaymentSourcePicker
                accounts={accounts} cards={cards}
                value={{ accountId: "a1", paidWithCredit: false }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText("Ahorros ••••0814"));

        expect(onChange).toHaveBeenCalledWith({ paidWithCredit: false });
    });

    it("avisa que el crédito no baja el saldo hoy", () => {
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={jest.fn()} />);
        expect(screen.getByText(/no baja tu saldo hoy/i)).toBeInTheDocument();
    });

    it("sin cuentas ni tarjetas invita a registrarlas", () => {
        render(<PaymentSourcePicker accounts={[]} cards={[]} value={{}} onChange={jest.fn()} />);
        expect(screen.getByText(/todavía no registras cuentas/i)).toBeInTheDocument();
    });
});

describe("paymentSourceForCard", () => {
    it("el crédito difiere el gasto y no sale de ninguna cuenta", () => {
        expect(paymentSourceForCard(cards[0])).toEqual({ cardId: "c1", paidWithCredit: true });
    });

    it("el débito gasta de la cuenta a la que está atado", () => {
        expect(paymentSourceForCard(cards[1])).toEqual({
            cardId: "c2", accountId: "a1", paidWithCredit: false,
        });
    });

    it("un débito sin cuenta no inventa una", () => {
        const suelta = { ...cards[1], accountId: null };
        expect(paymentSourceForCard(suelta)).toEqual({
            cardId: "c2", accountId: undefined, paidWithCredit: false,
        });
    });
});

describe("PaymentSourcePicker — alta desde el paso", () => {
    const creation = {
        institutions: [],
        onAccountCreated: jest.fn(),
        onCardCreated: jest.fn(),
    };

    const nuevaCuenta = () => screen.queryByRole("button", { name: /Nueva cuenta/i });
    const nuevaTarjeta = () => screen.queryByRole("button", { name: /Nueva tarjeta/i });

    it("ofrece crear cuenta y tarjeta junto a las opciones", () => {
        render(
            <PaymentSourcePicker
                accounts={accounts} cards={cards} value={{}} onChange={jest.fn()} {...creation}
            />,
        );

        expect(nuevaCuenta()).toBeInTheDocument();
        expect(nuevaTarjeta()).toBeInTheDocument();
    });

    it("también las ofrece cuando no hay nada registrado — es cuando más falta hacen", () => {
        render(
            <PaymentSourcePicker accounts={[]} cards={[]} value={{}} onChange={jest.fn()} {...creation} />,
        );

        expect(nuevaCuenta()).toBeInTheDocument();
        expect(nuevaTarjeta()).toBeInTheDocument();
        // Ya no manda al usuario a otra pantalla a hacerlo.
        expect(screen.getByText(/créala aquí mismo/i)).toBeInTheDocument();
        expect(screen.queryByText(/crearlas en Bancos y/i)).not.toBeInTheDocument();
    });

    it("el botón abre de verdad el formulario de cuenta", () => {
        render(
            <PaymentSourcePicker accounts={[]} cards={[]} value={{}} onChange={jest.fn()} {...creation} />,
        );

        fireEvent.click(nuevaCuenta()!);

        expect(screen.getByText("Nueva cuenta", { selector: "h2, [data-slot='dialog-title']" }))
            .toBeInTheDocument();
        // Sin emisores registrados, el formulario tiene que dejar escribir uno:
        // si aquí hubiera un desplegable vacío, el alta seguiría sin salida.
        expect(screen.getByLabelText("Institución")).toBeInTheDocument();
    });

    it("el botón abre de verdad el formulario de tarjeta", () => {
        render(
            <PaymentSourcePicker accounts={[]} cards={[]} value={{}} onChange={jest.fn()} {...creation} />,
        );

        fireEvent.click(nuevaTarjeta()!);

        expect(screen.getByLabelText("Tipo de tarjeta")).toBeInTheDocument();
    });

    it("no ofrece crear nada a quien no sabe qué hacer con lo creado", () => {
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={jest.fn()} />);

        expect(nuevaCuenta()).not.toBeInTheDocument();
        expect(nuevaTarjeta()).not.toBeInTheDocument();
    });
});

describe("PaymentSourcePicker — lo detectado también se puede elegir", () => {
    const detectada = {
        id: "c9", ownerUserId: "u", institutionId: "i1",
        cardType: "DEBIT" as const, brand: "Visa", lastFour: "2780", prefixDigits: "493176",
        currency: "USD", status: "ACTIVE" as const, isUnconfirmed: true,
        ...STAMPS,
    };

    it("una tarjeta que detectó un escaneo aparece entre las opciones", () => {
        // Antes se filtraba por «revisada», y el paso decía «todavía no
        // registras cuentas ni tarjetas» justo encima de la tarjeta que el
        // propio movimiento acababa de identificar.
        render(
            <PaymentSourcePicker accounts={[]} cards={[detectada]} value={{}} onChange={jest.fn()} />,
        );

        expect(screen.getByText("Visa 493176XXXX2780")).toBeInTheDocument();
        expect(screen.queryByText(/todavía no registras cuentas/i)).not.toBeInTheDocument();
    });

    it("y avisa de que aún no está revisada", () => {
        render(
            <PaymentSourcePicker accounts={[]} cards={[detectada]} value={{}} onChange={jest.fn()} />,
        );

        expect(screen.getByText(/sin revisar/)).toBeInTheDocument();
    });

    it("elegirla ata la transacción a ella como cualquier otra", () => {
        const onChange = jest.fn();
        render(
            <PaymentSourcePicker accounts={[]} cards={[detectada]} value={{}} onChange={onChange} />,
        );

        fireEvent.click(screen.getByText("Visa 493176XXXX2780"));

        expect(onChange).toHaveBeenCalledWith({
            cardId: "c9", accountId: undefined, paidWithCredit: false,
        });
    });
});
