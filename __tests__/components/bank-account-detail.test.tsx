import { render, screen } from "@testing-library/react";
import { AccountDetailClient } from "@/presentation/bank/components/AccountDetailClient";
import type { BankAccountDetail } from "@/application/services/bank-service";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const detail: BankAccountDetail = {
    account: {
        id: "a1", ownerUserId: "u", institutionId: "i1",         accountType: "SAVINGS", lastFour: "0814", currency: "USD", status: "ACTIVE",
        isUnconfirmed: false, balance: 2104.18, lastSnapshotAt: "2026-08-01T00:00:00Z",
        institutionName: "Banco del Austro", ...STAMPS,
    },
    snapshots: [{
        id: "s1", ownerUserId: "u", accountId: "a1", balance: 2310,
        asOf: "2026-08-01T00:00:00Z", source: "MANUAL", ...STAMPS,
    }],
    movements: [
        {
            transactionId: "t1", ownerUserId: "u", date: "2026-08-12T00:00:00Z",
            accountId: "a1", cardId: null, direction: "OUT", amount: 96.41,
            currency: "USD", description: "Transferencia", merchant: "Banco Pacifico", categoryId: null,
        },
        {
            transactionId: "t2", ownerUserId: "u", date: "2026-08-11T00:00:00Z",
            accountId: "a1", cardId: null, direction: "IN", amount: 500,
            currency: "USD", description: "Anticipo", merchant: "Tymarq", categoryId: null,
        },
    ],
    running: [2104.18, 2200.59],
};

describe("AccountDetailClient", () => {
    it("muestra el saldo actual y el corte declarado", () => {
        render(<AccountDetailClient initialData={detail} />);
        expect(screen.getAllByText(/2\.104,18/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/2\.310,00/).length).toBeGreaterThan(0);
    });

    it("muestra el saldo corrido junto a cada movimiento", () => {
        render(<AccountDetailClient initialData={detail} />);
        expect(screen.getByText("$2.200,59")).toBeInTheDocument();
    });

    it("distingue entradas de salidas por signo", () => {
        render(<AccountDetailClient initialData={detail} />);
        expect(screen.getByText("−$96,41")).toBeInTheDocument();
        expect(screen.getByText("+$500,00")).toBeInTheDocument();
    });

    it("el panel de conciliación muestra la diferencia entre corte y saldo", () => {
        render(<AccountDetailClient initialData={detail} />);
        // 2104,18 − 2310,00 = −205,82
        expect(screen.getByText("−$205,82")).toBeInTheDocument();
    });

    it("sin cortes invita a registrar el primero en vez de mostrar el panel", () => {
        render(<AccountDetailClient initialData={{
            ...detail,
            account: { ...detail.account, lastSnapshotAt: null },
            snapshots: [],
        }} />);
        expect(screen.queryByText(/diferencia/i)).not.toBeInTheDocument();
        expect(screen.getByText(/registra el saldo que dice tu banco/i)).toBeInTheDocument();
    });

    it("sin movimientos no revienta", () => {
        render(<AccountDetailClient initialData={{ ...detail, movements: [], running: [] }} />);
        expect(screen.getByText(/todavía no hay movimientos/i)).toBeInTheDocument();
    });
});
