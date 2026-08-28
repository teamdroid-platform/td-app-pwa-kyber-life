import { render, screen, fireEvent } from "@testing-library/react";
import { BalanceHeroCard } from "@/presentation/financial/components/BalanceHeroCard";

/**
 * The card wrapper is itself a `role="button"` (Enter/Space opens the KPI
 * modal via `onDetails`). `modeSwitch` embeds another interactive control
 * inside it, so a keyboard user activating the switch must not also
 * activate the card underneath it.
 */
describe("BalanceHeroCard", () => {
    it("Enter on the embedded switch does not also open the KPI modal — but Enter on the card itself still does", () => {
        const onDetails = jest.fn();
        render(
            <BalanceHeroCard
                value="+$100,00"
                negative={false}
                creditAmount={0}
                onDetails={onDetails}
                modeSwitch={<button type="button">Cambiar modo</button>}
            />
        );

        const [card, switchButton] = screen.getAllByRole("button");

        fireEvent.keyDown(switchButton, { key: "Enter" });
        expect(onDetails).not.toHaveBeenCalled();

        fireEvent.keyDown(card, { key: "Enter" });
        expect(onDetails).toHaveBeenCalledTimes(1);
    });

    it("defaults to 'spent' copy for the credit pill", () => {
        render(<BalanceHeroCard value="+$100,00" negative={false} creditAmount={50} />);
        expect(screen.getByText("$50,00 en tarjeta de crédito")).toBeInTheDocument();
    });

    it("switches to 'debt' copy when creditKind is debt (TOTAL mode)", () => {
        render(<BalanceHeroCard value="+$100,00" negative={false} creditAmount={50} creditKind="debt" />);
        expect(screen.getByText("$50,00 en deuda de tarjeta de crédito")).toBeInTheDocument();
    });

    it("shows the 'no debt' variant when creditKind is debt and the amount is zero", () => {
        render(<BalanceHeroCard value="+$100,00" negative={false} creditAmount={0} creditKind="debt" />);
        expect(screen.getByText("Sin deuda de tarjeta de crédito")).toBeInTheDocument();
    });
});
