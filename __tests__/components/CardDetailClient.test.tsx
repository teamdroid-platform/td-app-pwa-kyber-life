import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CardDetailClient } from "@/presentation/bank/components/CardDetailClient";
import type { BankCardDetail } from "@/application/services/bank-service";

jest.mock("@/app/actions/bank", () => ({
    payCardAction: jest.fn().mockResolvedValue({ success: true, data: null }),
    setStatementTotalAction: jest.fn(),
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

function detail(overrides: Partial<BankCardDetail["card"]> = {}): BankCardDetail {
    return {
        card: {
            id: "card-1", ownerUserId: "u1", cardType: "CREDIT", currency: "USD",
            lastFour: "8361", status: "ACTIVE", isUnconfirmed: false,
            institutionName: "Banco del Pacífico",
            createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
            isDeleted: false,
            debt: 534.56, availableCredit: null, openStatement: null,
            ...overrides,
        },
        statements: [], movements: [], periodMovements: [],
        payableAccounts: [{
            id: "acc-1", ownerUserId: "u1", accountType: "SAVINGS", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, institutionName: "Pichincha",
            createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
            isDeleted: false, balance: 1000, lastSnapshotAt: null,
        }],
    } as unknown as BankCardDetail;
}

describe("CardDetailClient", () => {
    it("ofrece pagar cuando hay deuda aunque no exista estado de cuenta", () => {
        render(<CardDetailClient initialData={detail()} />);
        expect(screen.getByRole("button", { name: /pagar/i })).toBeInTheDocument();
    });

    it("no ofrece pagar cuando la deuda está en cero", () => {
        render(<CardDetailClient initialData={detail({ debt: 0 })} />);
        expect(screen.queryByRole("button", { name: /pagar/i })).toBeNull();
    });

    it("no ofrece pagar en una tarjeta de débito", () => {
        render(<CardDetailClient initialData={detail({ cardType: "DEBIT", debt: 100 })} />);
        expect(screen.queryByRole("button", { name: /pagar/i })).toBeNull();
    });
});

describe("PayCardSheet — arreglos ronda 1", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("precarga la fecha local del usuario, no la UTC", () => {
        // A esta hora, en Ecuador (UTC-5) todavía es 5 de septiembre; en UTC
        // ya es 6. El input de fecha debe mostrar el día local.
        jest.useFakeTimers().setSystemTime(new Date("2026-09-05T23:30:00-05:00"));

        render(<CardDetailClient initialData={detail()} />);
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));

        expect(screen.getByLabelText("Fecha del pago")).toHaveValue("2026-09-05");
    });

    it("repone el importe a la deuda vigente al reabrir el sheet", () => {
        render(<CardDetailClient initialData={detail()} />);

        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));
        const amountInput = screen.getByLabelText("Monto del pago");
        fireEvent.change(amountInput, { target: { value: "100" } });
        expect(amountInput).toHaveValue("100");

        // Cerrar sin enviar: Radix solo oculta el contenido del sheet, no
        // desmonta el componente, así que el importe editado sobreviviría
        // si no se repusiera explícitamente al reabrir.
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));

        expect(screen.getByLabelText("Monto del pago")).toHaveValue("534.56");
    });
});

describe("PayCardSheet — origen opcional y banco visible", () => {
    it("llega con el origen sin definir y avisa de que ningún saldo se mueve", () => {
        render(<CardDetailClient initialData={detail()} />);
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));

        expect(screen.getByRole("combobox", { name: /cuenta de origen/i }))
            .toHaveTextContent(/sin definir/i);
        expect(screen.getByTestId("sin-origen-aviso")).toBeInTheDocument();
    });

    it("cada cuenta del selector dice de qué banco es", () => {
        render(<CardDetailClient initialData={detail()} />);
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));
        fireEvent.click(screen.getByRole("combobox", { name: /cuenta de origen/i }));

        const opcion = screen.getByRole("option", { name: /ahorros xxxx?\s*8361|ahorros/i });
        expect(opcion).toHaveTextContent(/Pichincha/);
    });

    it("registra el pago con la cuenta en null cuando no se define", async () => {
        const { payCardAction } = jest.requireMock("@/app/actions/bank");
        payCardAction.mockClear();
        payCardAction.mockResolvedValue({ success: true, data: null });

        render(<CardDetailClient initialData={detail()} />);
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));
        fireEvent.click(screen.getByRole("button", { name: /registrar pago/i }));

        await waitFor(() => {
            expect(payCardAction).toHaveBeenCalledWith(
                expect.objectContaining({ cardId: "card-1", sourceAccountId: null, amount: 534.56 }),
            );
        });
    });
});

describe("CardDetailClient — pagos sin origen en los movimientos", () => {
    function conPagos(): BankCardDetail {
        const base = detail();
        const movimiento = (transactionId: string) => ({
            transactionId, ownerUserId: "u1", date: "2026-09-05T12:00:00Z",
            accountId: null, cardId: "card-1", direction: "PAYMENT",
            amount: 100, currency: "USD", description: "Pago Mastercard XXXX8361",
            merchant: "Banco del Pacífico", categoryId: null,
        });
        return {
            ...base,
            openStatement: null,
            periodMovements: [movimiento("tx-sin"), movimiento("tx-con")],
            paymentsWithoutSource: ["tx-sin"],
        } as unknown as BankCardDetail;
    }

    it("marca solo el pago que no dice de dónde salió", () => {
        render(<CardDetailClient initialData={conPagos()} />);
        expect(screen.getAllByText(/sin origen/i)).toHaveLength(1);
    });

    it("no marca nada cuando todos los pagos tienen cuenta", () => {
        const data = { ...conPagos(), paymentsWithoutSource: [] } as unknown as BankCardDetail;
        render(<CardDetailClient initialData={data} />);
        expect(screen.queryByText(/sin origen/i)).toBeNull();
    });
});
