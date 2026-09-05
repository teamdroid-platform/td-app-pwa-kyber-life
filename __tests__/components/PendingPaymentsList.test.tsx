import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingPaymentsList } from "@/presentation/bank/components/PendingPaymentsList";
import type { PaymentGroup } from "@/domain/services/card-payment-detection";
import type { BankCard } from "@/domain/entities/bank";

const confirmCardPaymentAction = jest.fn();
const dismissCardPaymentAction = jest.fn();

jest.mock("@/app/actions/bank", () => ({
    confirmCardPaymentAction: (...a: unknown[]) => confirmCardPaymentAction(...a),
    dismissCardPaymentAction: (...a: unknown[]) => dismissCardPaymentAction(...a),
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const CARD = {
    id: "card-8361", ownerUserId: "u1", cardType: "CREDIT", currency: "USD",
    lastFour: "8361", status: "ACTIVE", isUnconfirmed: false,
    institutionName: "Banco del Pacífico",
    createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", isDeleted: false,
} as unknown as BankCard;

const GROUP = {
    cardId: "card-8361", amount: 481.61, date: "2026-08-06T13:25:00Z",
    readNumber: "XXXX8361",
    primary: {
        id: "tx-1", description: "Pago de tarjeta de crédito",
        amount: 481.61, date: "2026-08-06T13:25:00Z", bankSourceAccountId: "acc-1",
    },
    twins: [{ id: "tx-2", description: "Pago de tarjeta de crédito", amount: 481.61 }],
} as unknown as PaymentGroup;

beforeEach(() => {
    jest.clearAllMocks();
    confirmCardPaymentAction.mockResolvedValue({ success: true, data: null });
    dismissCardPaymentAction.mockResolvedValue({ success: true, data: null });
});

describe("PendingPaymentsList", () => {
    it("muestra el monto, el número leído y que hay una copia", () => {
        render(<PendingPaymentsList groups={[GROUP]} cards={[CARD]} />);

        expect(screen.getByText(/481,61|481\.61/)).toBeInTheDocument();
        // Acotado al `.font-mono` de la evidencia: la tarjeta propuesta ya trae el
        // mismo número en el selector ("Crédito XXXX8361"), y un match genérico
        // encontraría los dos.
        expect(screen.getByText("XXXX8361", { selector: ".font-mono" })).toBeInTheDocument();
        expect(screen.getByText(/2 registros/i)).toBeInTheDocument();
    });

    it("confirmar ata la transacción principal a la tarjeta propuesta", async () => {
        render(<PendingPaymentsList groups={[GROUP]} cards={[CARD]} />);

        fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

        await waitFor(() => {
            expect(confirmCardPaymentAction).toHaveBeenCalledWith({
                transactionId: "tx-1", cardId: "card-8361",
            });
        });
    });

    it("descartar manda solo la transacción principal", async () => {
        render(<PendingPaymentsList groups={[GROUP]} cards={[CARD]} />);

        fireEvent.click(screen.getByRole("button", { name: /descartar/i }));

        await waitFor(() => {
            expect(dismissCardPaymentAction).toHaveBeenCalledWith({ transactionId: "tx-1" });
        });
    });

    it("sin pendientes, lo dice en vez de mostrar una lista vacía", () => {
        render(<PendingPaymentsList groups={[]} cards={[CARD]} />);
        expect(screen.getByText(/no hay pagos por confirmar/i)).toBeInTheDocument();
    });
});
