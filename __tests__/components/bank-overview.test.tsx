import { render, screen } from "@testing-library/react";
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
        id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
        accountType: "SAVINGS", lastFour: "0814", currency: "USD", status: "ACTIVE",
        isUnconfirmed: false, balance: 2104.18, lastSnapshotAt: "2026-08-01T00:00:00Z",
        ...STAMPS,
    }],
    cards: [
        {
            id: "c1", ownerUserId: "u", institutionId: "i1", name: "Pacificard Mastercard",
            cardType: "CREDIT", lastFour: "8361", currency: "USD", creditLimit: 3000,
            statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
            debt: 842.15, availableCredit: 2157.85, openStatement: null, ...STAMPS,
        },
        {
            id: "c2", ownerUserId: "u", institutionId: "i1", accountId: "a1",
            name: "Visa Débito", cardType: "DEBIT", lastFour: "2780", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false,
            debt: 0, availableCredit: null, openStatement: null, ...STAMPS,
        },
    ],
    totalAvailable: 2104.18, totalDebt: 842.15, totalAvailableCredit: 2157.85,
    cashBalance: 185, nextDueDate: "2026-08-28", unconfirmedCount: 0,
};

describe("BankOverviewClient", () => {
    it("muestra la cuenta con puntos y la tarjeta con equis", () => {
        render(<BankOverviewClient initialData={overview} />);
        expect(screen.getByText(/••••0814/)).toBeInTheDocument();
        expect(screen.getByText(/XXXX8361/)).toBeInTheDocument();
    });

    it("muestra el disponible, la deuda y el efectivo", () => {
        render(<BankOverviewClient initialData={overview} />);
        // Con una sola cuenta el monto sale tres veces: hero, total del grupo y
        // la fila de la cuenta.
        expect(screen.getAllByText("$2.104,18")).toHaveLength(3);
        // La deuda sale en la píldora del hero y en la fila de la tarjeta.
        expect(screen.getAllByText(/842,15/)).toHaveLength(2);
        expect(screen.getByText("$185,00")).toBeInTheDocument();
        expect(screen.getByText(/Cupo libre \$2\.157,85/)).toBeInTheDocument();
    });

    it("la tarjeta de débito dice de qué cuenta come, no un saldo propio", () => {
        render(<BankOverviewClient initialData={overview} />);
        // Una vez como fila de cuenta, otra como destino de la tarjeta de débito.
        expect(screen.getAllByText(/Ahorros Principal/)).toHaveLength(2);
        expect(screen.getByText(/usa el saldo de la cuenta/i)).toBeInTheDocument();
        // La de débito no muestra deuda ni cupo.
        expect(screen.queryByText(/^−\$0,00$/)).not.toBeInTheDocument();
    });

    it("avisa cuando hay cuentas sin identificar", () => {
        render(<BankOverviewClient initialData={{ ...overview, unconfirmedCount: 7 }} />);
        expect(screen.getByText(/7 cuentas sin identificar/i)).toBeInTheDocument();
    });

    it("no muestra el aviso cuando no hay ninguna", () => {
        render(<BankOverviewClient initialData={overview} />);
        expect(screen.queryByText(/sin identificar/i)).not.toBeInTheDocument();
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
