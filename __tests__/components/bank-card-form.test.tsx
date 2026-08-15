import { render, screen, fireEvent } from "@testing-library/react";
import { CardFormSheet } from "@/presentation/bank/components/CardFormSheet";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const institutions = [{
    id: "11111111-1111-4111-8111-111111111111", ownerUserId: "u",
    name: "Banco del Austro", kind: "BANK" as const, isUnconfirmed: false, ...STAMPS,
}];

const accounts = [{
    id: "22222222-2222-4222-8222-222222222222", ownerUserId: "u",
    institutionId: institutions[0].id,     accountType: "SAVINGS" as const, currency: "USD", status: "ACTIVE" as const,
    isUnconfirmed: false, ...STAMPS,
}];

function renderSheet() {
    return render(
        <CardFormSheet
            open
            onOpenChange={() => {}}
            institutions={institutions}
            accounts={accounts}
            trigger={<button>Nueva tarjeta</button>}
        />,
    );
}

describe("CardFormSheet", () => {
    it("arranca en crédito: pide cupo y ciclo, no pide cuenta", () => {
        renderSheet();
        expect(screen.getByLabelText(/cupo/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/día de corte/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/día de pago/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/atar a la cuenta/i)).not.toBeInTheDocument();
    });

    it("en débito pide cuenta y esconde cupo y ciclo", () => {
        renderSheet();
        fireEvent.click(screen.getByRole("button", { name: /^débito$/i }));

        expect(screen.getByLabelText(/atar a la cuenta/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/cupo/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/día de corte/i)).not.toBeInTheDocument();
    });

    it("explica que la tarjeta de crédito no cuelga de una cuenta", () => {
        renderSheet();
        expect(screen.getByText(/no se atan a una cuenta/i)).toBeInTheDocument();
    });
});
