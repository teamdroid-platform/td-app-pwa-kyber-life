import { render, screen } from "@testing-library/react";
import { CardDetailClient } from "@/presentation/bank/components/CardDetailClient";
import type { BankCardDetail } from "@/application/services/bank-service";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const statement = {
    id: "st1", ownerUserId: "u", cardId: "c1",
    periodStart: "2026-07-21", periodEnd: "2026-08-20", dueDate: "2026-08-28",
    computedAmount: 611.4, totalAmount: 658.9, paidAmount: 0, status: "OPEN" as const,
    ...STAMPS,
};

const detail: BankCardDetail = {
    card: {
        id: "c1", ownerUserId: "u", institutionId: "i1",         cardType: "CREDIT", lastFour: "8361", currency: "USD", creditLimit: 3000,
        statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
        debt: 842.15, availableCredit: 2157.85, openStatement: statement,
        institutionName: "Banco del Austro", ...STAMPS,
    },
    statements: [statement],
    movements: [],
    periodMovements: [],
    payableAccounts: [],
};

describe("CardDetailClient", () => {
    it("muestra deuda total y cupo libre", () => {
        render(<CardDetailClient initialData={detail} />);
        expect(screen.getAllByText(/842,15/).length).toBeGreaterThan(0);
        expect(screen.getByText(/2\.157,85/)).toBeInTheDocument();
    });

    it("muestra el calculado, el declarado y la diferencia", () => {
        render(<CardDetailClient initialData={detail} />);
        expect(screen.getByText("$611,40")).toBeInTheDocument();
        expect(screen.getByText("$658,90")).toBeInTheDocument();
        // 658,90 − 611,40 = 47,50
        expect(screen.getByText("$47,50")).toBeInTheDocument();
    });

    it("no muestra la diferencia cuando el banco no declaró total", () => {
        const sinTotal = { ...statement, totalAmount: null };
        render(<CardDetailClient initialData={{
            ...detail,
            card: { ...detail.card, openStatement: sinTotal },
            statements: [sinTotal],
        }} />);
        expect(screen.queryByText(/diferencia sin explicar/i)).not.toBeInTheDocument();
    });

    it("muestra el cupo usado en porcentaje", () => {
        render(<CardDetailClient initialData={detail} />);
        // 842,15 de 3000 = 28%
        expect(screen.getByText("28%")).toBeInTheDocument();
    });

    it("una tarjeta sin cupo declarado no muestra la barra", () => {
        render(<CardDetailClient initialData={{
            ...detail,
            card: { ...detail.card, creditLimit: null, availableCredit: null },
        }} />);
        expect(screen.queryByText(/cupo usado/i)).not.toBeInTheDocument();
    });

    it("sin cuentas para pagar avisa en vez de ofrecer el botón", () => {
        render(<CardDetailClient initialData={detail} />);
        expect(screen.getByText(/registra una cuenta/i)).toBeInTheDocument();
    });
});
