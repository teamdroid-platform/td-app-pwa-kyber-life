import { render, screen } from "@testing-library/react";
import {
    PeriodSettingsProvider, useCycleRange, useCycleStartDay,
} from "@/presentation/components/period/PeriodSettingsProvider";

function Probe() {
    const day = useCycleStartDay();
    const range = useCycleRange();
    return <div data-testid="probe">{`${day}|${range.start}|${range.end}`}</div>;
}

describe("PeriodSettingsProvider", () => {
    it("expone el día que recibe y el ciclo que lo contiene", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));

        render(
            <PeriodSettingsProvider cycleStartDay={22}>
                <Probe />
            </PeriodSettingsProvider>,
        );

        expect(screen.getByTestId("probe").textContent).toBe("22|2026-08-22|2026-09-21");

        jest.useRealTimers();
    });

    it("un día distinto produce un ciclo distinto", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));

        render(
            <PeriodSettingsProvider cycleStartDay={1}>
                <Probe />
            </PeriodSettingsProvider>,
        );

        expect(screen.getByTestId("probe").textContent).toBe("1|2026-09-01|2026-09-30");

        jest.useRealTimers();
    });

    it("sin provider, el hook falla en vez de inventarse un día", () => {
        // Silencia el error que React imprime al reventar el render.
        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        expect(() => render(<Probe />)).toThrow(/PeriodSettingsProvider/);
        spy.mockRestore();
    });
});
