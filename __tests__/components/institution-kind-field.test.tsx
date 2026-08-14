import React from "react";
import { render, screen } from "@testing-library/react";
import { InstitutionStep } from "@/presentation/financial/components/transaction-wizard/steps/PickerSteps";
import type { FinancialInstitution } from "@/domain/entities/financial";

jest.mock("@/app/actions/financial-settings", () => ({
    updateInstitutionAction: jest.fn(),
    createInstitutionAction: jest.fn(),
}));

const now = new Date().toISOString();

const institutions: FinancialInstitution[] = [
    {
        id: "inst-1", ownerUserId: "user-1", name: "Banco del Austro", logoUrl: null,
        institutionTypeId: null, createdAt: now, updatedAt: now, isDeleted: false,
    },
];

function renderStep(props: Partial<React.ComponentProps<typeof InstitutionStep>> = {}) {
    const onBankInstitutionKindChange = jest.fn();
    render(
        <InstitutionStep
            institutions={institutions}
            institutionTypes={[]}
            value="Banco del Austro"
            onSelect={jest.fn()}
            onInstitutionsChange={jest.fn()}
            query=""
            onQueryChange={jest.fn()}
            pendingEdit={null}
            onPendingEditChange={jest.fn()}
            bankInstitutionKind={null}
            onBankInstitutionKindChange={onBankInstitutionKindChange}
            {...props}
        />,
    );
    return { onBankInstitutionKindChange };
}

const field = () => screen.queryByLabelText("Tipo de institución");

describe("tipo de institución en el paso «¿Dónde fue?»", () => {
    it("se pregunta cuando el nombre puede fundar un emisor", () => {
        renderStep();
        expect(field()).toBeInTheDocument();
    });

    it("no se pregunta por un comercio: nunca nacería la institución", () => {
        renderStep({ value: "FARMASHOP" });
        expect(field()).not.toBeInTheDocument();
    });

    it("no se pregunta antes de elegir nada", () => {
        renderStep({ value: "" });
        expect(field()).not.toBeInTheDocument();
    });

    it("arranca en lo que el nombre sugiere, sin haberlo guardado", () => {
        renderStep();
        expect(field()).toHaveTextContent("Banco");
    });

    it("propone el genérico cuando el nombre no dice qué es", () => {
        renderStep({ value: "PACIFICARD" });
        expect(field()).toHaveTextContent("Otro");
    });

    it("muestra lo que el usuario declaró por encima de la sugerencia", () => {
        renderStep({ bankInstitutionKind: "COOPERATIVE" });
        expect(field()).toHaveTextContent("Cooperativa");
    });

    it("dice que solo aplica si la institución todavía no existe", () => {
        renderStep();
        expect(screen.getByText(/aún no está en Bancos/i)).toBeInTheDocument();
    });

    it("se calla del todo cuando quien usa el paso no sabe de Bancos", () => {
        renderStep({ onBankInstitutionKindChange: undefined });
        expect(field()).not.toBeInTheDocument();
    });
});
