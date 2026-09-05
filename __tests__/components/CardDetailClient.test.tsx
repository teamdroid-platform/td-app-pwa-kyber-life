import { render, screen } from "@testing-library/react";
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
