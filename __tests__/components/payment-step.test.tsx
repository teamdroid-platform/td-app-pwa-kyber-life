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

        expect(screen.queryByText("····0814")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Nueva cuenta/ })).not.toBeInTheDocument();
    });

    it("enseña lo que leyó el escaneo mientras no se elija otra cosa", () => {
        renderStep({ scannedAccounts: [scanned("SOURCE", "••••0814")] });

        // Sin identificar, el badge lo dice en tres letras y el número se
        // reduce a sus cuatro últimos.
        expect(screen.getByTitle(/Tipo desconocido/)).toHaveTextContent("DES");
        expect(screen.getByText("····0814")).toBeInTheDocument();
        expect(screen.getByText("sin registrar")).toBeInTheDocument();
    });

    it("y lo elegido cuando ya hay elección", () => {
        renderStep({ value: { accountId: "a1", paidWithCredit: false } });

        expect(screen.getByText("····0814")).toBeInTheDocument();
    });
});

describe("PaymentStep — elegir desde la hoja", () => {
    it("tocar el origen abre la hoja con las cuentas y el buscador", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
        expect(screen.getByText("····0814")).toBeInTheDocument();
        expect(screen.getByText("····8361")).toBeInTheDocument();
    });

    it("elegir una cuenta la ata como origen", () => {
        const { onChange } = renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.click(screen.getByText("····0814"));

        expect(onChange).toHaveBeenCalledWith({ accountId: "a1", paidWithCredit: false });
    });

    it("elegir una tarjeta de crédito difiere el gasto", () => {
        const { onChange } = renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.click(screen.getByText("····8361"));

        expect(onChange).toHaveBeenCalledWith({
            cardId: "c1", accountId: undefined, paidWithCredit: true,
        });
    });

    it("el destino solo ofrece cuentas: el dinero no entra a una tarjeta", () => {
        renderStep({ scannedAccounts: [scanned("DESTINATION", "••••8173")] });

        fireEvent.click(screen.getByText("Destino"));

        expect(screen.getByText("····0814")).toBeInTheDocument();
        expect(screen.queryByText("····8361")).not.toBeInTheDocument();
    });

    it("elegir el destino lo informa hacia arriba", () => {
        const { onDestinationChange } = renderStep({
            scannedAccounts: [scanned("DESTINATION", "••••8173")],
        });

        fireEvent.click(screen.getByText("Destino"));
        fireEvent.click(screen.getByText("····9511"));

        expect(onDestinationChange).toHaveBeenCalledWith("a2");
    });

    it("un ingreso no ofrece tarjetas de crédito", () => {
        renderStep({ creditEligible: false });

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.queryByText("····8361")).not.toBeInTheDocument();
    });

    it("el buscador filtra entre lo que hay", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));
        fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "corriente" } });

        expect(screen.getByText("····9511")).toBeInTheDocument();
        expect(screen.queryByText("····0814")).not.toBeInTheDocument();
    });
});

describe("PaymentStep — cada opción dice de qué banco es", () => {
    it("la cuenta enseña su emisor", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        // La cuenta de ahorros y la tarjeta comparten emisor, así que aparece
        // una vez por cada una.
        expect(screen.getAllByText("Banco del Austro").length).toBeGreaterThan(0);
        expect(screen.getByText("Banco Pichincha")).toBeInTheDocument();
    });

    it("la tarjeta dice qué es en tres letras, sin repetirlo en el emisor", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByTitle("Tarjeta de crédito")).toHaveTextContent("TCR");
        // El tipo vive en el acrónimo; el subtítulo es solo el emisor.
        expect(screen.queryByText("Crédito · Banco del Austro")).not.toBeInTheDocument();
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

        expect(screen.getByText("····9511")).toBeInTheDocument();
        expect(screen.queryByText("····0814")).not.toBeInTheDocument();
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
        // El número aparece varias veces —la fila del origen, la opción de la
        // hoja y el encabezado de alta—. La que se pulsa es la opción.
        // El nombre accesible de la opción empieza por lo que es y su número.
        fireEvent.click(screen.getByRole("button", { name: /^Ahorros ····0814/ }));

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

    it("propone registrar el número que leyó el escaneo, sea del tipo que sea", () => {
        renderStep({ scannedAccounts: [scanned("SOURCE", "••••0814")] });

        fireEvent.click(screen.getByText("Origen"));

        // Registrar lo que el movimiento trae es el caso más frecuente, y las
        // dos salidas están: antes solo la cuenta ofrecía registrarlo.
        expect(screen.getByText(/Registrar/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cuenta Ahorros, corriente…" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Tarjeta Crédito o débito" })).toBeInTheDocument();
    });

    it("sin escaneo no habla de registrar nada concreto", () => {
        renderStep();

        fireEvent.click(screen.getByText("Origen"));

        expect(screen.getByText("Nueva cuenta o tarjeta")).toBeInTheDocument();
        expect(screen.queryByText(/Registrar/)).not.toBeInTheDocument();
    });
});

/**
 * Quién responde «¿fue con tarjeta de crédito?» depende de si hay una tarjeta
 * elegida. Con una, la responde ella; sin ninguna, el usuario — que es el caso
 * de quien no lleva sus cuentas en Bancos.
 */
describe("PaymentStep — pagado con tarjeta de crédito", () => {
    it("deja decidir al usuario cuando no hay tarjeta elegida", () => {
        const { onChange } = renderStep({ value: {} });

        const toggle = screen.getByRole("switch", { name: /Pagado con tarjeta de crédito/i });
        expect(toggle).toBeInTheDocument();

        fireEvent.click(toggle);

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ paidWithCredit: true }));
    });

    it("conserva la cuenta elegida al marcarlo a mano", () => {
        const { onChange } = renderStep({ value: { accountId: "a1", paidWithCredit: false } });

        fireEvent.click(screen.getByRole("switch", { name: /Pagado con tarjeta de crédito/i }));

        expect(onChange).toHaveBeenCalledWith({ accountId: "a1", paidWithCredit: true });
    });

    it("lo da por hecho y no editable cuando el origen es una tarjeta de crédito", () => {
        renderStep({ value: { cardId: "c1", paidWithCredit: true } });

        // Ya no hay nada que decidir: lo dice la tarjeta.
        expect(screen.queryByRole("switch", { name: /Pagado con tarjeta de crédito/i })).not.toBeInTheDocument();
        expect(screen.getByText(/Lo define/)).toHaveTextContent("Mastercard");
    });

    it("no pregunta por el crédito en un tipo que no lo admite", () => {
        renderStep({ creditEligible: false, value: {} });

        expect(screen.queryByText(/Pagado con tarjeta de crédito/i)).not.toBeInTheDocument();
    });
});

/**
 * El escaneo ya sabe si el número que leyó es de cuenta o de tarjeta —los
 * enmascara distinto—, pero esa información no llegaba al alta: solo la cuenta
 * ofrecía registrar el número, aunque fuera el de una tarjeta.
 */
describe("PaymentStep — registrar lo que no está en la lista", () => {
    const scannedCard = (display: string): ScannedAccountView => ({
        ...scanned("SOURCE", display), kind: "CARD",
    });

    it("ofrece la tarjeta primero cuando el escaneo leyó una tarjeta", () => {
        renderStep({ scannedAccounts: [scannedCard("XXXX8361")] });

        fireEvent.click(screen.getByText("Origen"));

        const altas = screen.getAllByRole("button", { name: /Ahorros, corriente…|Crédito o débito/ });
        expect(altas[0]).toHaveAccessibleName("Tarjeta Crédito o débito");
        expect(altas[1]).toHaveAccessibleName("Cuenta Ahorros, corriente…");
    });

    it("ofrece la cuenta primero cuando el escaneo leyó una cuenta", () => {
        renderStep({ scannedAccounts: [scanned("SOURCE", "••••0814")] });

        fireEvent.click(screen.getByText("Origen"));

        const altas = screen.getAllByRole("button", { name: /Ahorros, corriente…|Crédito o débito/ });
        expect(altas[0]).toHaveAccessibleName("Cuenta Ahorros, corriente…");
    });

    it("deja crear algo que no tiene que ver con el número leído", () => {
        renderStep({ scannedAccounts: [scannedCard("XXXX8361")] });

        fireEvent.click(screen.getByText("Origen"));
        expect(screen.getByText(/Registrar/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Crear otra cuenta o tarjeta" }));

        // Deja de hablar del número leído: lo que se cree ahora es otra cosa.
        expect(screen.getByText("Nueva cuenta o tarjeta")).toBeInTheDocument();
        expect(screen.queryByText(/Registrar/)).not.toBeInTheDocument();
    });
});
