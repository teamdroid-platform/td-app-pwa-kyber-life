import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BalanceScopeManager } from "@/presentation/financial/components/settings/BalanceScopeManager";

jest.mock("@/app/actions/balance", () => ({
    setBalanceDefaultModeAction: jest.fn().mockResolvedValue({ success: true, data: {} }),
    setBalanceScopeRuleAction: jest.fn().mockResolvedValue({ success: true, data: {} }),
    clearBalanceScopeAction: jest.fn().mockResolvedValue({ success: true, data: null }),
}));

import { setBalanceScopeRuleAction } from "@/app/actions/balance";

const institutions = [{ id: "inst-1", name: "Pichincha" }];
const accounts = [
    { id: "acc-1", institutionId: "inst-1", label: "Ahorros ••1234" },
    { id: "acc-2", institutionId: "inst-1", label: "Corriente ••5678" },
];
const cards = [{ id: "card-1", institutionId: "inst-1", label: "Visa ••9620" }];

describe("BalanceScopeManager", () => {
    beforeEach(() => jest.clearAllMocks());

    it("sin reglas muestra el banco como incluido entero", () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        expect(screen.getByText(/Pichincha/)).toBeInTheDocument();
        expect(screen.getByText(/3 de 3 incluidas/i)).toBeInTheDocument();
    });

    it("con una excepción muestra el banco como parcial", () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[{
                    id: "r1", ownerUserId: "u", targetType: "ACCOUNT", targetId: "acc-2",
                    included: false, createdAt: "", updatedAt: "", isDeleted: false,
                }]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        expect(screen.getByText(/2 de 3 incluidas/i)).toBeInTheDocument();
    });

    it("alternar el banco limpia las excepciones de dentro", async () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[{
                    id: "r1", ownerUserId: "u", targetType: "ACCOUNT", targetId: "acc-2",
                    included: false, createdAt: "", updatedAt: "", isDeleted: false,
                }]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        fireEvent.click(screen.getByRole("checkbox", { name: /Pichincha/i }));

        await waitFor(() => {
            expect(setBalanceScopeRuleAction).toHaveBeenCalledWith(expect.objectContaining({
                targetType: "INSTITUTION",
                targetId: "inst-1",
                included: true,
                clearTargetIds: expect.arrayContaining(["acc-1", "acc-2", "card-1"]),
            }));
        });
    });

    it("banco incluido entero: click excluye todo", async () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        fireEvent.click(screen.getByRole("checkbox", { name: /Pichincha/i }));

        await waitFor(() => {
            expect(setBalanceScopeRuleAction).toHaveBeenCalledWith(expect.objectContaining({
                targetType: "INSTITUTION",
                targetId: "inst-1",
                included: false,
            }));
        });
    });

    it("banco excluido entero: click incluye todo", async () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[{
                    id: "r1", ownerUserId: "u", targetType: "INSTITUTION", targetId: "inst-1",
                    included: false, createdAt: "", updatedAt: "", isDeleted: false,
                }]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        fireEvent.click(screen.getByRole("checkbox", { name: /Pichincha/i }));

        await waitFor(() => {
            expect(setBalanceScopeRuleAction).toHaveBeenCalledWith(expect.objectContaining({
                targetType: "INSTITUTION",
                targetId: "inst-1",
                included: true,
            }));
        });
    });

    it("banco parcial: click incluye todo", async () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[{
                    id: "r1", ownerUserId: "u", targetType: "ACCOUNT", targetId: "acc-2",
                    included: false, createdAt: "", updatedAt: "", isDeleted: false,
                }]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        fireEvent.click(screen.getByRole("checkbox", { name: /Pichincha/i }));

        await waitFor(() => {
            expect(setBalanceScopeRuleAction).toHaveBeenCalledWith(expect.objectContaining({
                targetType: "INSTITUTION",
                targetId: "inst-1",
                included: true,
            }));
        });
    });
});
