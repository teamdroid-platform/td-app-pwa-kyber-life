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
                creditSpent={0}
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
});
