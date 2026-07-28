import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useChartTooltipDismiss } from "@/hooks/use-chart-tooltip-dismiss";

/** Minimal chart-like host: reports the value it would pass to <Tooltip active={...} />. */
function Host({ autoHideMs }: { autoHideMs?: number }) {
    const { containerRef, tooltipActive, handlePointerDown } = useChartTooltipDismiss(
        autoHideMs === undefined ? undefined : { autoHideMs },
    );
    return (
        <div>
            <div ref={containerRef} onPointerDown={handlePointerDown} data-testid="chart">
                chart
            </div>
            <div data-testid="outside">outside</div>
            <span data-testid="state">{tooltipActive === false ? "closed" : "auto"}</span>
        </div>
    );
}

const state = () => screen.getByTestId("state").textContent;

/**
 * jsdom has no `PointerEvent`, so `fireEvent.pointerDown(el, { pointerType })`
 * loses the pointer type. Build the event and set it explicitly instead.
 */
function pointerDown(el: HTMLElement, pointerType: "touch" | "mouse") {
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(el, event);
}

const touch = (el: HTMLElement) => pointerDown(el, "touch");

describe("useChartTooltipDismiss", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("leaves the tooltip to Recharts until something dismisses it", () => {
        render(<Host />);
        expect(state()).toBe("auto");
    });

    it("auto-hides a few seconds after the last touch", () => {
        render(<Host autoHideMs={3000} />);
        touch(screen.getByTestId("chart"));
        expect(state()).toBe("auto");

        act(() => { jest.advanceTimersByTime(2999); });
        expect(state()).toBe("auto");

        act(() => { jest.advanceTimersByTime(1); });
        expect(state()).toBe("closed");
    });

    it("closes with a single tap outside the chart", () => {
        render(<Host />);
        touch(screen.getByTestId("chart"));
        expect(state()).toBe("auto");

        touch(screen.getByTestId("outside"));
        expect(state()).toBe("closed");
    });

    it("closes when the page is scrolled", () => {
        render(<Host />);
        touch(screen.getByTestId("chart"));

        act(() => { fireEvent.scroll(window); });
        expect(state()).toBe("closed");
    });

    it("re-opens on the next touch of the chart", () => {
        render(<Host autoHideMs={3000} />);
        touch(screen.getByTestId("chart"));
        act(() => { jest.advanceTimersByTime(3000); });
        expect(state()).toBe("closed");

        touch(screen.getByTestId("chart"));
        expect(state()).toBe("auto");
    });

    it("does not arm the auto-hide for mouse pointers (desktop hover is unchanged)", () => {
        render(<Host autoHideMs={3000} />);
        pointerDown(screen.getByTestId("chart"), "mouse");

        act(() => { jest.advanceTimersByTime(5000); });
        expect(state()).toBe("auto");
    });
});
