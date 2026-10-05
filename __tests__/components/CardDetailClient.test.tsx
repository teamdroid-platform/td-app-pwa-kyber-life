import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CardDetailClient } from "@/presentation/bank/components/CardDetailClient";
import type { BankCardDetail } from "@/application/services/bank-service";

jest.mock("@/app/actions/bank", () => ({
    payCardAction: jest.fn().mockResolvedValue({ success: true, data: null }),
    deleteCardPaymentAction: jest.fn().mockResolvedValue({ success: true, data: null }),
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
        statements: [], movements: [], periodMovements: [], paymentsWithoutSource: [],
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

describe("CardDetailClient — tarjeta sin día de corte", () => {
    // El caso real: una Mastercard con meses de consumos y dos pagos, pero sin
    // día de corte configurado. Sin corte no hay estado de cuenta, sin estado
    // no hay periodo, y la lista del periodo salía vacía debajo de una deuda
    // que nada explicaba.
    function mov(transactionId: string, direction: "CHARGE" | "PAYMENT", amount: number, date: string, description: string) {
        return {
            transactionId, ownerUserId: "u1", date, accountId: null, cardId: "card-1",
            direction, amount, currency: "USD", description, merchant: null, categoryId: null,
        };
    }

    function withHistory(): BankCardDetail {
        return {
            ...detail({ debt: 54.84 }),
            movements: [
                mov("t1", "CHARGE", 42.38, "2026-09-27T01:15:00.000Z", "Consumo en restaurante"),
                mov("t2", "PAYMENT", 319.5, "2026-09-25T19:27:00.000Z", "Pago de tarjeta de crédito"),
                mov("t3", "CHARGE", 19.99, "2026-08-18T10:00:00.000Z", "Suscripción Gemini"),
            ],
        } as unknown as BankCardDetail;
    }

    it("enseña los consumos y los pagos aunque no haya periodo", () => {
        render(<CardDetailClient initialData={withHistory()} />);

        expect(screen.queryByText("Sin consumos en este período.")).toBeNull();
        expect(screen.getByText("Consumo en restaurante")).toBeInTheDocument();
        expect(screen.getByText("Pago de tarjeta de crédito")).toBeInTheDocument();
        expect(screen.getByText("Suscripción Gemini")).toBeInTheDocument();
    });

    it("los agrupa por mes, del más reciente al más viejo", () => {
        render(<CardDetailClient initialData={withHistory()} />);

        const meses = screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent?.toLowerCase());
        expect(meses[0]).toMatch(/septiembre/);
        expect(meses[1]).toMatch(/agosto/);
    });

    it("explica por qué no hay estado de cuenta y cómo tenerlo", () => {
        render(<CardDetailClient initialData={withHistory()} />);

        expect(screen.getByText(/no tiene día de corte ni de pago/i)).toBeInTheDocument();
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

describe("PayCardSheet — el pago no es una transacción", () => {
    it("no pregunta desde qué cuenta y dice que ningún saldo se mueve", () => {
        render(<CardDetailClient initialData={detail()} />);
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));

        expect(screen.queryByRole("combobox", { name: /cuenta de origen/i })).toBeNull();
        expect(screen.getByText(/no crea una transacción/i)).toBeInTheDocument();
    });

    it("registra el pago solo con tarjeta, monto y fecha", async () => {
        const { payCardAction } = jest.requireMock("@/app/actions/bank");
        payCardAction.mockClear();
        payCardAction.mockResolvedValue({ success: true, data: null });

        render(<CardDetailClient initialData={detail()} />);
        fireEvent.click(screen.getByRole("button", { name: /pagar/i }));
        fireEvent.click(screen.getByRole("button", { name: /registrar pago/i }));

        await waitFor(() => {
            expect(payCardAction).toHaveBeenCalledWith({
                cardId: "card-1", amount: 534.56, date: expect.any(String),
            });
        });
    });
});

describe("CardDetailClient — pagos registrados desde Bancos", () => {
    function conPago(cardPaymentId: string | null): BankCardDetail {
        return {
            ...detail(),
            movements: [{
                transactionId: "p1", ownerUserId: "u1", date: "2026-09-05T12:00:00Z",
                accountId: null, cardId: "card-1", direction: "PAYMENT",
                amount: 100, currency: "USD", description: "Pago Mastercard XXXX8361",
                merchant: null, categoryId: null, cardPaymentId,
            }],
        } as unknown as BankCardDetail;
    }

    it("se pueden borrar desde la tarjeta, que es donde existen", () => {
        render(<CardDetailClient initialData={conPago("p1")} />);
        expect(screen.getByRole("button", { name: /borrar pago/i })).toBeInTheDocument();
    });

    it("un pago que es transacción no se borra desde aquí", () => {
        render(<CardDetailClient initialData={conPago(null)} />);
        expect(screen.queryByRole("button", { name: /borrar pago/i })).toBeNull();
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
            // Sin estado de cuenta el servicio no llena `periodMovements`: la
            // pantalla enseña entonces la historia entera, que viaja en
            // `movements`.
            movements: [movimiento("tx-sin"), movimiento("tx-con")],
            periodMovements: [],
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

describe("StatementPanel — saldo a favor de periodos anteriores", () => {
    // El caso real: el estado suma $461,81 en consumos, pero un pago anterior
    // dejó $64,16 a favor y la deuda total es $397,65.
    function conSaldoAFavor(debt: number): BankCardDetail {
        const statement = {
            id: "st-1", ownerUserId: "u1", cardId: "card-1",
            periodStart: "2026-09-21", periodEnd: "2026-10-20", dueDate: "2026-10-28",
            computedAmount: 461.81, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z", isDeleted: false,
        };
        const base = detail({ debt, openStatement: statement } as never);
        return { ...base, statements: [statement] } as unknown as BankCardDetail;
    }

    it("no pide pagar más que la deuda total", () => {
        render(<CardDetailClient initialData={conSaldoAFavor(397.65)} />);

        expect(screen.getByRole("button", { name: /marcar \$397,65 como pagado/i })).toBeInTheDocument();
        expect(screen.getByText("Cubierto por saldo a favor")).toBeInTheDocument();
        expect(screen.getByText("$64,16")).toBeInTheDocument();
    });

    it("sin saldo a favor pide el estado entero", () => {
        render(<CardDetailClient initialData={conSaldoAFavor(900)} />);

        expect(screen.getByRole("button", { name: /marcar \$461,81 como pagado/i })).toBeInTheDocument();
        expect(screen.queryByText("Cubierto por saldo a favor")).toBeNull();
    });

    it("con la deuda saldada no ofrece pagar el estado", () => {
        render(<CardDetailClient initialData={conSaldoAFavor(0)} />);

        expect(screen.queryByRole("button", { name: /como pagado/i })).toBeNull();
    });
});
