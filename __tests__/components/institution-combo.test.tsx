import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
    InstitutionCombo, matchInstitution, ensureInstitution, EMPTY_INSTITUTION_CHOICE,
    type InstitutionChoice,
} from "@/presentation/bank/components/InstitutionCombo";
import { createBankInstitutionAction } from "@/app/actions/bank";
import type { BankInstitution } from "@/domain/entities/bank";

jest.mock("@/app/actions/bank", () => ({
    createBankInstitutionAction: jest.fn(),
}));

const now = new Date().toISOString();

function institution(name: string, kind: BankInstitution["kind"], id: string): BankInstitution {
    return {
        id, ownerUserId: "user-1", name, shortName: null, kind,
        logoUrl: null, color: null, country: "EC", financialInstitutionId: null,
        isUnconfirmed: false, createdAt: now, updatedAt: now, isDeleted: false,
    };
}

const AUSTRO = institution("Banco del Austro", "BANK", "inst-1");
const JEP = institution("Coop JEP", "COOPERATIVE", "inst-2");

describe("matchInstitution", () => {
    it("encuentra el emisor aunque cambie la caja", () => {
        expect(matchInstitution([AUSTRO], "BANCO DEL AUSTRO")?.id).toBe("inst-1");
    });

    it("encuentra el emisor aunque falten los acentos", () => {
        const pichincha = institution("Banco Pichinchá", "BANK", "inst-9");
        expect(matchInstitution([pichincha], "banco pichincha")?.id).toBe("inst-9");
    });

    it("no confunde dos emisores distintos", () => {
        expect(matchInstitution([AUSTRO, JEP], "Banco Bolivariano")).toBeUndefined();
    });

    it("no encuentra nada con un nombre vacío", () => {
        expect(matchInstitution([AUSTRO], "   ")).toBeUndefined();
    });
});

describe("ensureInstitution", () => {
    beforeEach(() => jest.clearAllMocks());

    it("usa el emisor elegido sin crear nada", async () => {
        const result = await ensureInstitution(
            { id: "inst-1", name: "Banco del Austro", kind: "BANK" }, [AUSTRO],
        );

        expect(result).toEqual({ ok: true, id: "inst-1", created: null });
        expect(createBankInstitutionAction).not.toHaveBeenCalled();
    });

    it("reusa el que ya existe en vez de duplicarlo por la escritura", async () => {
        const result = await ensureInstitution(
            { id: null, name: "  BANCO DEL AUSTRO ", kind: "OTHER" }, [AUSTRO],
        );

        expect(result).toEqual({ ok: true, id: "inst-1", created: null });
        expect(createBankInstitutionAction).not.toHaveBeenCalled();
    });

    it("crea el que no existe, con el tipo que se declaró", async () => {
        const nuevo = institution("Banco Bolivariano", "BANK", "inst-3");
        (createBankInstitutionAction as jest.Mock).mockResolvedValue({ success: true, data: nuevo });

        const result = await ensureInstitution(
            { id: null, name: "Banco Bolivariano", kind: "BANK" }, [AUSTRO],
        );

        expect(createBankInstitutionAction).toHaveBeenCalledWith({
            name: "Banco Bolivariano", kind: "BANK",
        });
        expect(result).toEqual({ ok: true, id: "inst-3", created: nuevo });
    });

    it("se niega sin nombre en vez de crear un emisor en blanco", async () => {
        const result = await ensureInstitution(EMPTY_INSTITUTION_CHOICE, [AUSTRO]);

        expect(result).toEqual({ ok: false, error: expect.stringContaining("institución") });
        expect(createBankInstitutionAction).not.toHaveBeenCalled();
    });

    it("devuelve el error del servidor sin inventarse un id", async () => {
        (createBankInstitutionAction as jest.Mock).mockResolvedValue({
            success: false, error: "No autorizado",
        });

        expect(await ensureInstitution({ id: null, name: "Banco X", kind: "BANK" }, []))
            .toEqual({ ok: false, error: "No autorizado" });
    });
});

describe("InstitutionCombo", () => {
    function renderCombo(value: InstitutionChoice = EMPTY_INSTITUTION_CHOICE) {
        const onChange = jest.fn();
        const view = render(
            <InstitutionCombo institutions={[AUSTRO, JEP]} value={value} onChange={onChange} />,
        );
        return { onChange, view };
    }

    const input = () => screen.getByLabelText("Institución");

    it("escribir un nombre nuevo lo deja listo para crearse, con el tipo inferido", () => {
        const { onChange } = renderCombo();

        fireEvent.change(input(), { target: { value: "Banco Bolivariano" } });

        expect(onChange).toHaveBeenCalledWith({
            id: null, name: "Banco Bolivariano", kind: "BANK",
        });
    });

    it("escribir el nombre de uno que ya existe lo reusa en vez de duplicarlo", () => {
        const { onChange } = renderCombo();

        fireEvent.change(input(), { target: { value: "banco del austro" } });

        expect(onChange).toHaveBeenCalledWith({
            id: "inst-1", name: "banco del austro", kind: "BANK",
        });
    });

    it("elegir de la lista fija el emisor con su propio tipo", () => {
        const { onChange } = renderCombo();

        fireEvent.focus(input());
        fireEvent.click(screen.getByRole("option", { name: "Coop JEP" }));

        expect(onChange).toHaveBeenCalledWith({
            id: "inst-2", name: "Coop JEP", kind: "COOPERATIVE",
        });
    });

    it("anuncia el alta y pide el tipo solo cuando el emisor es nuevo", () => {
        renderCombo({ id: null, name: "Banco Bolivariano", kind: "BANK" });

        expect(screen.getByText(/Se creará/)).toBeInTheDocument();
        expect(screen.getByLabelText("Tipo de institución")).toHaveTextContent("Banco");
    });

    it("no pide el tipo de uno que ya existe", () => {
        renderCombo({ id: "inst-1", name: "Banco del Austro", kind: "BANK" });

        expect(screen.queryByText(/Se creará/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Tipo de institución")).not.toBeInTheDocument();
    });

    it("no anuncia nada mientras el campo está vacío", () => {
        renderCombo();

        expect(screen.queryByText(/Se creará/)).not.toBeInTheDocument();
    });
});
