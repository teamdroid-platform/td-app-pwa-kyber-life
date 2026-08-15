import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountFormSheet } from "@/presentation/bank/components/AccountFormSheet";
import { createBankAccountAction, updateBankAccountAction } from "@/app/actions/bank";
import type { BankAccount, BankInstitution } from "@/domain/entities/bank";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/actions/bank", () => ({
    createBankAccountAction: jest.fn().mockResolvedValue({ success: true, data: {} }),
    updateBankAccountAction: jest.fn().mockResolvedValue({ success: true, data: {} }),
    createBankInstitutionAction: jest.fn(),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const azuayo: BankInstitution = {
    id: "i1", ownerUserId: "u", name: "COAC Jardín Azuayo", shortName: null,
    kind: "COOPERATIVE", logoUrl: null, color: null, country: "EC",
    financialInstitutionId: null, isUnconfirmed: false, ...STAMPS,
};

const pichincha: BankInstitution = { ...azuayo, id: "i2", name: "Banco Pichincha", kind: "BANK" };

const cuenta: BankAccount = {
    id: "a1", ownerUserId: "u", institutionId: "i1", name: "Cuenta ••••11",
    accountType: "SAVINGS", lastFour: "11", prefixDigits: "10", currency: "USD",
    status: "ACTIVE", isUnconfirmed: true, ...STAMPS,
};

function open(props: Partial<React.ComponentProps<typeof AccountFormSheet>> = {}) {
    render(
        <AccountFormSheet
            institutions={[azuayo, pichincha]}
            trigger={<button>Abrir</button>}
            {...props}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
}

beforeEach(() => jest.clearAllMocks());

describe("AccountFormSheet — el número de la cuenta", () => {
    it("muestra el número que ya tiene, no solo sus últimos dígitos", () => {
        open({ account: cuenta });

        // 10 delante y 11 detrás: los dos extremos que el banco mostró.
        expect(screen.getByLabelText(/Número de cuenta/)).toHaveValue("10••••11");
    });

    it("guarda principio y final de lo que se escriba", async () => {
        open({ account: cuenta });

        fireEvent.change(screen.getByLabelText(/Número de cuenta/), {
            target: { value: "25XXX10" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

        await waitFor(() => expect(updateBankAccountAction).toHaveBeenCalled());
        expect(updateBankAccountAction).toHaveBeenCalledWith("a1", expect.objectContaining({
            prefixDigits: "25",
            lastFour: "10",
        }));
    });

    it("no pierde los dígitos del principio al guardar sin tocarlo", async () => {
        open({ account: cuenta });

        fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

        await waitFor(() => expect(updateBankAccountAction).toHaveBeenCalled());
        expect(updateBankAccountAction).toHaveBeenCalledWith("a1", expect.objectContaining({
            prefixDigits: "10",
            lastFour: "11",
        }));
    });

    it("un alta sin número no inventa dígitos", async () => {
        open();

        fireEvent.change(screen.getByLabelText("Institución"), { target: { value: "COAC Jardín Azuayo" } });
        fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ahorros" } });
        fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));

        await waitFor(() => expect(createBankAccountAction).toHaveBeenCalled());
        expect(createBankAccountAction).toHaveBeenCalledWith(expect.objectContaining({
            prefixDigits: null,
            lastFour: null,
        }));
    });
});

describe("AccountFormSheet — corregir la institución", () => {
    it("deja buscar otra aunque ya tenga una asignada", () => {
        open({ account: cuenta });

        fireEvent.focus(screen.getByLabelText("Institución"));

        // Antes la lista solo aparecía sin emisor elegido, y al editar —que es
        // cuando se quiere cambiar— el campo parecía no admitir cambios.
        expect(screen.getByRole("option", { name: "Banco Pichincha" })).toBeInTheDocument();
    });

    it("filtra mientras se escribe", () => {
        open({ account: cuenta });

        fireEvent.change(screen.getByLabelText("Institución"), { target: { value: "pichin" } });

        expect(screen.getByRole("option", { name: "Banco Pichincha" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "COAC Jardín Azuayo" })).not.toBeInTheDocument();
    });

    it("elegir otra la manda al guardar", async () => {
        open({ account: cuenta });

        fireEvent.focus(screen.getByLabelText("Institución"));
        fireEvent.click(screen.getByRole("option", { name: "Banco Pichincha" }));
        fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

        await waitFor(() => expect(updateBankAccountAction).toHaveBeenCalled());
        expect(updateBankAccountAction).toHaveBeenCalledWith("a1", expect.objectContaining({
            institutionId: "i2",
        }));
    });

    it("guardar da la cuenta por revisada", async () => {
        open({ account: cuenta });

        fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

        await waitFor(() => expect(updateBankAccountAction).toHaveBeenCalled());
        expect(updateBankAccountAction).toHaveBeenCalledWith("a1", expect.objectContaining({
            isUnconfirmed: false,
        }));
    });
});
