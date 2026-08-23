import { render, screen } from "@testing-library/react";
import { PaymentIdentityLine } from "@/presentation/bank/components/PaymentIdentityLine";

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const ahorros = {
    id: "a1", ownerUserId: "u", institutionId: "i1", institutionName: "COAC Jardín Azuayo",
    accountType: "SAVINGS" as const, lastFour: "2510", currency: "USD",
    status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
};

const corriente = {
    ...ahorros, id: "a2", accountType: "CHECKING" as const, lastFour: "9558",
    institutionId: "i2", institutionName: "Banco Pichincha",
};

const credito = {
    id: "c1", ownerUserId: "u", institutionId: "i2", institutionName: "Banco Pichincha",
    cardType: "CREDIT" as const, brand: "Visa", lastFour: "8361",
    currency: "USD", status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
};

const SIN_NADA = <span>Efectivo o débito</span>;

function renderLine(props: Partial<React.ComponentProps<typeof PaymentIdentityLine>> = {}) {
    render(
        <PaymentIdentityLine
            accounts={[ahorros, corriente]}
            cards={[credito]}
            fallback={SIN_NADA}
            {...props}
        />,
    );
}

describe("PaymentIdentityLine", () => {
    it("sin cuenta ni tarjeta, dice lo genérico", () => {
        renderLine();

        expect(screen.getByText("Efectivo o débito")).toBeInTheDocument();
    });

    it("con solo origen lo muestra sin flechas: no hay nada que distinguir", () => {
        renderLine({ accountId: corriente.id });

        expect(screen.getByText(/9558/)).toBeInTheDocument();
        expect(screen.getByText("Banco Pichincha")).toBeInTheDocument();
        expect(screen.queryByLabelText("Entró")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Salió")).not.toBeInTheDocument();
    });

    // El caso que fallaba: un ingreso solo tiene destino, y el resumen decía
    // «Efectivo o débito» justo después de elegir la cuenta.
    it("con solo destino muestra esa cuenta, marcada como entrada", () => {
        renderLine({ destinationAccountId: ahorros.id });

        expect(screen.queryByText("Efectivo o débito")).not.toBeInTheDocument();
        expect(screen.getByText(/2510/)).toBeInTheDocument();
        expect(screen.getByText("COAC Jardín Azuayo")).toBeInTheDocument();
        expect(screen.getByLabelText("Entró")).toBeInTheDocument();
    });

    it("con los dos lados los muestra ambos, cada uno con su flecha", () => {
        renderLine({ accountId: corriente.id, destinationAccountId: ahorros.id });

        expect(screen.getByText(/9558/)).toBeInTheDocument();
        expect(screen.getByText(/2510/)).toBeInTheDocument();
        expect(screen.getByLabelText("Salió")).toBeInTheDocument();
        expect(screen.getByLabelText("Entró")).toBeInTheDocument();
    });

    it("la tarjeta manda sobre la cuenta en el lado del origen", () => {
        renderLine({ accountId: corriente.id, cardId: credito.id });

        expect(screen.getByText(/8361/)).toBeInTheDocument();
        expect(screen.queryByText(/9558/)).not.toBeInTheDocument();
    });
});
