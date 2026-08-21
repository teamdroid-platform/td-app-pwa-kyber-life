import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BalanceBoardClient } from "@/presentation/bank/components/BalanceBoardClient";
import { registerBalanceSnapshotsAction } from "@/app/actions/bank";
import type { AccountBalanceStatus } from "@/application/services/bank-service";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("@/app/actions/bank", () => ({
    registerBalanceSnapshotsAction: jest.fn(),
}));

const saveAction = registerBalanceSnapshotsAction as jest.MockedFunction<
    typeof registerBalanceSnapshotsAction
>;

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const ENTRIES: AccountBalanceStatus[] = [
    {
        account: {
            id: "a1", ownerUserId: "u", institutionId: "i1", institutionName: "Jardín Azuayo",
            accountType: "SAVINGS", lastFour: "0814", currency: "USD", status: "ACTIVE",
            isUnconfirmed: false, ...STAMPS,
        },
        lastAsOf: "2026-08-09T00:00:00.000Z",
        lastBalance: 1842.3,
    },
    {
        account: {
            id: "a2", ownerUserId: "u", institutionId: null,
            accountType: "CASH", currency: "USD", status: "ACTIVE",
            isUnconfirmed: false, ...STAMPS,
        },
        lastAsOf: null,
        lastBalance: null,
    },
];

beforeEach(() => {
    saveAction.mockReset();
    saveAction.mockResolvedValue({ success: true, data: 1 });
});

describe("BalanceBoardClient", () => {
    it("agrupa por emisor y dice qué cuenta no tiene corte", () => {
        render(<BalanceBoardClient entries={ENTRIES} />);

        expect(screen.getByRole("heading", { name: /Jardín Azuayo/ })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /Sin institución/ })).toBeInTheDocument();
        expect(screen.getByText("sin registrar")).toBeInTheDocument();
    });

    it("no deja guardar mientras no haya ningún saldo escrito", () => {
        render(<BalanceBoardClient entries={ENTRIES} />);

        expect(screen.getByRole("button", { name: "Escribe al menos un saldo" })).toBeDisabled();
    });

    it("manda solo las casillas llenas, todas a la misma fecha", async () => {
        render(<BalanceBoardClient entries={ENTRIES} />);

        fireEvent.change(screen.getByLabelText(/XXXX0814/), { target: { value: "1900,50" } });
        fireEvent.change(screen.getByLabelText("Fecha del corte"), { target: { value: "2026-08-20" } });

        fireEvent.click(screen.getByRole("button", { name: "Guardar 1 saldo" }));

        await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1));
        expect(saveAction).toHaveBeenCalledWith({
            asOf: new Date("2026-08-20T00:00:00").toISOString(),
            entries: [{ accountId: "a1", balance: 1900.5 }],
        });
    });

    it("rechaza un saldo que no es un número antes de llamar al servidor", async () => {
        render(<BalanceBoardClient entries={ENTRIES} />);

        fireEvent.change(screen.getByLabelText(/XXXX0814/), { target: { value: "mil" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar 1 saldo" }));

        await waitFor(() => expect(saveAction).not.toHaveBeenCalled());
    });

    it("sin cuentas, manda a registrarlas en vez de mostrar un formulario vacío", () => {
        render(<BalanceBoardClient entries={[]} />);

        const link = screen.getByRole("link", { name: "Bancos" });
        expect(link).toHaveAttribute("href", "/financial/banks");
        expect(screen.queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
    });

    it("muestra el último saldo declarado junto a cuándo fue", () => {
        render(<BalanceBoardClient entries={ENTRIES} />);

        const row = screen.getByLabelText(/XXXX0814/).closest("div");
        expect(within(row as HTMLElement).getByText(/\$1\.842,30/)).toBeInTheDocument();
    });
});
