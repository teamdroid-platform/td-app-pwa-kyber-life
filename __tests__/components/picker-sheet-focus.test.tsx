import { render, screen } from "@testing-library/react";
import { PaymentSourceSheet } from "@/presentation/bank/components/PaymentSourceSheet";
import { FormSheet } from "@/components/ui/form-sheet";
import type { BankAccount } from "@/domain/entities/bank";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/actions/bank", () => ({
    createBankAccountAction: jest.fn(),
    createBankCardAction: jest.fn(),
    createBankInstitutionAction: jest.fn(),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const accounts = [{
    id: "a1", ownerUserId: "u", institutionId: "i1", accountType: "SAVINGS", lastFour: "0814",
    currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...STAMPS,
}] as BankAccount[];

describe("hojas para elegir de una lista", () => {
    it("al abrir «¿De dónde salió?» el buscador no toma el foco: el teclado no tapa la lista", () => {
        render(
            <PaymentSourceSheet
                open onOpenChange={jest.fn()} title="¿De dónde salió?"
                accounts={accounts} cards={[]} institutions={[]}
                value={{ kind: "NONE" } as never} onPick={jest.fn()}
            />,
        );

        const search = screen.getByLabelText("Buscar");
        expect(search).not.toHaveFocus();
        // El foco queda dentro de la hoja, no se pierde.
        expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    });

    it("una hoja de formulario normal sigue enfocando su primer campo", () => {
        render(
            <FormSheet open onOpenChange={jest.fn()} title="Nueva cuenta" footer={null}>
                <input aria-label="Nombre" />
            </FormSheet>,
        );

        expect(screen.getByLabelText("Nombre")).toHaveFocus();
    });
});
