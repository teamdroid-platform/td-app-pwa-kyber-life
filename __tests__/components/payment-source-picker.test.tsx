import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentSourcePicker } from "@/presentation/bank/components/PaymentSourcePicker";

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const accounts = [
    {
        id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
        accountType: "SAVINGS" as const, lastFour: "0814", currency: "USD",
        status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
    {
        id: "cash", ownerUserId: "u", institutionId: null, name: "Efectivo",
        accountType: "CASH" as const, currency: "USD",
        status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
];

const cards = [
    {
        id: "c1", ownerUserId: "u", institutionId: "i1", name: "Pacificard Mastercard",
        cardType: "CREDIT" as const, lastFour: "8361", currency: "USD",
        status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
    {
        id: "c2", ownerUserId: "u", institutionId: "i1", accountId: "a1",
        name: "Visa Débito", cardType: "DEBIT" as const, lastFour: "2780",
        currency: "USD", status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
    },
];

describe("PaymentSourcePicker", () => {
    it("elegir una cuenta no marca pago con crédito", () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByText("Ahorros Principal"));

        expect(onChange).toHaveBeenCalledWith({ accountId: "a1", paidWithCredit: false });
    });

    it("elegir una tarjeta de crédito difiere el gasto", () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByText("Pacificard Mastercard"));

        expect(onChange).toHaveBeenCalledWith({ cardId: "c1", paidWithCredit: true });
    });

    it("una tarjeta de débito gasta de su cuenta, no difiere nada", () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByText("Visa Débito"));

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
        fireEvent.click(screen.getByText("Ahorros Principal"));

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
