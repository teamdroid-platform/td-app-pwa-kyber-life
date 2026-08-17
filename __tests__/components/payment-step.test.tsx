import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentStep } from "@/presentation/financial/components/transaction-wizard/steps/PaymentStep";
import type { ScannedAccountView } from "@/application/services/bank-service";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/app/actions/bank", () => ({
    createBankAccountAction: jest.fn(),
    createBankCardAction: jest.fn(),
    createBankInstitutionAction: jest.fn(),
}));

const STAMPS = { createdAt: "", updatedAt: "", isDeleted: false };

const ahorros = {
    id: "a1", ownerUserId: "u", institutionId: "i1", institutionName: "Banco del Austro",
    accountType: "SAVINGS" as const, lastFour: "0814", currency: "USD",
    status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
};

const corriente = {
    ...ahorros, id: "a2", accountType: "CHECKING" as const, lastFour: "9511",
    institutionId: "i2", institutionName: "Banco Pichincha",
};

const credito = {
    id: "c1", ownerUserId: "u", institutionId: "i1", institutionName: "Banco del Austro",
    cardType: "CREDIT" as const, brand: "Mastercard", lastFour: "8361",
    currency: "USD", status: "ACTIVE" as const, isUnconfirmed: false, ...STAMPS,
};

/** Nace de un escaneo que no dedujo el banco: existe, pero cuelga de nadie. */
const huerfana = {
    ...ahorros, id: "a3", lastFour: "1860",
    institutionId: null, institutionName: undefined,
};

function scanned(role: "SOURCE" | "DESTINATION", display: string): ScannedAccountView {
    return {
        role, raw: display, display, kind: "ACCOUNT", resolution: "PENDING",
        match: null, institutionHint: null, ownership: null, decision: null,
    };
}

function renderStep(props: Partial<React.ComponentProps<typeof PaymentStep>> = {}) {
    const onChange = jest.fn();
    const onDestinationChange = jest.fn();
    render(
        <PaymentStep
            accounts={[ahorros, corriente]}
            cards={[credito]}
            value={{}}
            onChange={onChange}
            creditEligible
            onDestinationChange={onDestinationChange}
            institutions={[]}
            {...props}
        />,
    );
    return { onChange, onDestinationChange };
}

describe("PaymentStep — el paso cabe en dos filas", () => {
    it("sin destino en el movimiento solo pregunta por el origen", () => {
        renderStep();

        expect(screen.getByText("Origen")).toBeInTheDocument();
        expect(screen.queryByText("Destino")).not.toBeInTheDocument();
    });

    it("con dos lados pregunta por ambos", () => {
        renderStep({
            scannedAccounts: [scanned("SOURCE", "••••0814"), scanned("DESTINATION", "••••8173")],
        });

        expect(screen.getByText("Origen")).toBeInTheDocument();
        expect(screen.getByText("Destino")).toBeInTheDocument();
    });

    it("no despliega la lista de cuentas hasta que se pide", () => {
        // Todo el saturado de antes —opciones, altas, avisos— vive en la hoja.
        renderStep();

        expect(screen.queryByText(/Ahorros ••••0814/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Nueva cuenta/ })).not.toBeInTheDocument();
    });

    it("enseña lo que leyó el escaneo mientras no se elija otra cosa", () => {
        renderStep({ scannedAccounts: [scanned("SOURCE", "••••0814")] });

        expect(screen.getByText(/••••0814 · sin registrar/)).toBeInTheDocument();
    });

    it("y lo elegido cuando ya hay elección", () => {
        renderStep({ value: { accountId: "a1", paidWithCredit: false } });

        expect(screen.getByText("Ahorros ••••0814")).toBeInTheDocument();
    });
});

describe("PaymentStep — elegir desde la hoja", () => {
    it("tocar el origen abre la hoja con las cuentas y el buscador", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
        expect(screen.getByText("Ahorros ••••0814")).toBeInTheDocument();
        expect(screen.getByText("Mastercard XXXX8361")).toBeInTheDocument();
    });

    it("elegir una cuenta la ata como origen", () => {
        const { onChange } = renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.click(screen.getByText("Ahorros ••••0814"));

        expect(onChange).toHaveBeenCalledWith({ accountId: "a1", paidWithCredit: false });
    });

    it("elegir una tarjeta de crédito difiere el gasto", () => {
        const { onChange } = renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.click(screen.getByText("Mastercard XXXX8361"));

        expect(onChange).toHaveBeenCalledWith({
            cardId: "c1", accountId: undefined, paidWithCredit: true,
        });
    });

    it("el destino solo ofrece cuentas: el dinero no entra a una tarjeta", () => {
        renderStep({ scannedAccounts: [scanned("DESTINATION", "••••8173")] });

        fireEvent.click(screen.getByText("Destino"));

        expect(screen.getByText("Ahorros ••••0814")).toBeInTheDocument();
        expect(screen.queryByText("Mastercard XXXX8361")).not.toBeInTheDocument();
    });

    it("elegir el destino lo informa hacia arriba", () => {
        const { onDestinationChange } = renderStep({
            scannedAccounts: [scanned("DESTINATION", "••••8173")],
        });

        fireEvent.click(screen.getByText("Destino"));
        fireEvent.click(screen.getByText("Corriente ••••9511"));

        expect(onDestinationChange).toHaveBeenCalledWith("a2");
    });

    it("un ingreso no ofrece tarjetas de crédito", () => {
        renderStep({ creditEligible: false });

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.queryByText("Mastercard XXXX8361")).not.toBeInTheDocument();
    });

    it("el buscador filtra entre lo que hay", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "corriente" } });

        expect(screen.getByText("Corriente ••••9511")).toBeInTheDocument();
        expect(screen.queryByText("Ahorros ••••0814")).not.toBeInTheDocument();
    });
});

describe("PaymentStep — cada opción dice de qué banco es", () => {
    it("la cuenta enseña su emisor", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByText("Banco del Austro")).toBeInTheDocument();
        expect(screen.getByText("Banco Pichincha")).toBeInTheDocument();
    });

    it("la tarjeta enseña su emisor junto al tipo", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByText("Crédito · Banco del Austro")).toBeInTheDocument();
    });

    it("una cuenta sin banco lo dice, en vez de callar", () => {
        // Callarlo la deja indistinguible de una bien atada, y el usuario nunca
        // sabe cuál necesita mantenimiento.
        renderStep({ accounts: [huerfana], cards: [] });

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByText("Sin institución")).toBeInTheDocument();
    });

    it("el buscador también entiende el nombre del banco", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "pichincha" } });

        expect(screen.getByText("Corriente ••••9511")).toBeInTheDocument();
        expect(screen.queryByText("Ahorros ••••0814")).not.toBeInTheDocument();
    });
});

describe("PaymentStep — lo elegido responde de quién es", () => {
    it("elegir una cuenta propia declara suyo el número del escaneo", () => {
        const onScannedDecision = jest.fn();
        renderStep({
            scannedAccounts: [scanned("SOURCE", "••••0814")],
            onScannedDecision,
        });

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.click(screen.getByText("Ahorros ••••0814"));

        expect(onScannedDecision).toHaveBeenCalledWith("••••0814", { ownership: "MINE" });
    });

    it("«no es una cuenta mía» lo deja fuera de Bancos", () => {
        const onScannedDecision = jest.fn();
        renderStep({
            scannedAccounts: [scanned("SOURCE", "••••0814")],
            onScannedDecision,
        });

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.click(screen.getByText("No es una cuenta mía"));

        expect(onScannedDecision).toHaveBeenCalledWith("••••0814", { ownership: "EXTERNAL" });
    });

    it("el alta se abre con el número que leyó el escaneo", () => {
        renderStep({ scannedAccounts: [scanned("SOURCE", "••••0814")] });

        fireEvent.click(screen.getByText("Origen"));

        // Registrar lo que el movimiento trae es el caso más frecuente.
        expect(screen.getByRole("button", { name: /Registrar ••••0814/ })).toBeInTheDocument();
    });

    it("sin escaneo el alta es genérica", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByRole("button", { name: /Nueva cuenta/ })).toBeInTheDocument();
    });
});
