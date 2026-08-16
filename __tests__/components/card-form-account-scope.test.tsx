import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardFormSheet } from "@/presentation/bank/components/CardFormSheet";
import type { BankAccount, BankInstitution } from "@/domain/entities/bank";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/actions/bank", () => ({
    createBankCardAction: jest.fn(),
    updateBankCardAction: jest.fn(),
    createBankAccountAction: jest.fn(),
    updateBankAccountAction: jest.fn(),
    createBankInstitutionAction: jest.fn(),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const austro: BankInstitution = {
    id: "i1", ownerUserId: "u", name: "Banco del Austro", shortName: null,
    kind: "BANK", logoUrl: null, color: null, country: "EC",
    financialInstitutionId: null, isUnconfirmed: false, ...STAMPS,
};
const pichincha: BankInstitution = { ...austro, id: "i2", name: "Banco Pichincha" };

const delAustro: BankAccount = {
    id: "a1", ownerUserId: "u", institutionId: "i1", accountType: "SAVINGS",
    lastFour: "0814", currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...STAMPS,
};
const deOtroBanco: BankAccount = { ...delAustro, id: "a2", institutionId: "i2", lastFour: "9511" };

function open() {
    render(
        <CardFormSheet
            institutions={[austro, pichincha]}
            accounts={[delAustro, deOtroBanco]}
            trigger={<button>Abrir</button>}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    // El formulario abre en crédito, que no ata cuenta.
    fireEvent.click(screen.getByRole("button", { name: "Débito" }));
}

describe("CardFormSheet — atar a la cuenta", () => {
    it("solo ofrece cuentas del banco que emite la tarjeta", () => {
        open();

        // El emisor por defecto es el primero: Banco del Austro.
        expect(screen.getByLabelText("Atar a la cuenta")).toHaveTextContent("Ahorros ••••0814");
        expect(screen.queryByText("Ahorros ••••9511")).not.toBeInTheDocument();
    });

    it("cambiar de banco descarta la cuenta que ya no pertenece", () => {
        open();

        fireEvent.change(screen.getByLabelText("Institución"), { target: { value: "Banco Pichincha" } });

        // La del Austro deja de ofrecerse; la elección anterior se limpia.
        expect(screen.queryByLabelText("Atar a la cuenta")).not.toHaveTextContent("••••0814");
    });

    it("sin cuentas en ese banco lo dice, en vez de un desplegable vacío", () => {
        render(
            <CardFormSheet
                institutions={[austro]}
                accounts={[]}
                trigger={<button>Abrir</button>}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
        fireEvent.click(screen.getByRole("button", { name: "Débito" }));

        expect(screen.getByText(/No tienes cuentas en Banco del Austro/)).toBeInTheDocument();
    });

    it("y siempre deja crear una", () => {
        open();

        expect(screen.getByRole("button", { name: /Nueva cuenta/ })).toBeInTheDocument();
    });
});
