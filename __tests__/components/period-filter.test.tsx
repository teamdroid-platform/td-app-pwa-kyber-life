import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PeriodFilter } from "@/components/ui/period-filter";

import { STANDARD_PERIOD_PRESETS } from "@/lib/date-range";

const PRESETS = STANDARD_PERIOD_PRESETS;

function renderFilter(overrides: Partial<React.ComponentProps<typeof PeriodFilter>> = {}) {
    const props = {
        value: "month",
        onChange: jest.fn(),
        presets: PRESETS,
        customId: "custom",
        customStart: "2026-06-22",
        customEnd: "2026-07-21",
        onCustomRangeChange: jest.fn(),
        ...overrides,
    };
    render(<PeriodFilter {...props} />);
    return props;
}

const openDropdown = () => fireEvent.click(screen.getByRole("button", { name: /Período:/i }));

describe("PeriodFilter", () => {
    it("shows the active preset on the trigger", () => {
        renderFilter({ value: "month" });
        expect(screen.getByRole("button", { name: /Período: Mes/i })).toBeInTheDocument();
    });

    it("shows the dates — not 'Personalizado' — when the custom range is active", () => {
        renderFilter({ value: "custom" });
        expect(screen.getByRole("button", { name: /Período: 22 jun – 21 jul 2026/i })).toBeInTheDocument();
        expect(screen.queryByText("Personalizado")).not.toBeInTheDocument();
    });

    it("lists the custom entry by its range instead of a generic label", () => {
        renderFilter();
        openDropdown();
        expect(screen.getByText("22 jun – 21 jul 2026")).toBeInTheDocument();
        expect(screen.queryByText("Personalizado")).not.toBeInTheDocument();
    });

    it("selects a preset from the same control", () => {
        const props = renderFilter();
        openDropdown();
        fireEvent.click(screen.getByText("Semana"));
        expect(props.onChange).toHaveBeenCalledWith("week");
    });

    it("lists the standard options, in order, with the range last", () => {
        renderFilter();
        openDropdown();

        // Option buttons are the ones without an aria-label (the trigger and the
        // range arrow do have one).
        const optionTexts = screen
            .getAllByRole("button")
            .filter((b) => !b.getAttribute("aria-label"))
            .map((b) => b.textContent?.trim());

        expect(optionTexts).toEqual(["Todos", "Hoy", "Semana", "Mes", "22 jun – 21 jul 2026"]);
    });

    it("applies the range directly when its label is tapped, without opening the calendar", () => {
        const props = renderFilter({ value: "month" });
        openDropdown();

        fireEvent.click(screen.getByText("22 jun – 21 jul 2026"));

        expect(props.onChange).toHaveBeenCalledWith("custom");
        expect(screen.queryByText("Lun")).not.toBeInTheDocument(); // no calendar
    });

    it("opens the calendar from the arrow and applies the new range", () => {
        const props = renderFilter();
        openDropdown();

        // Only the arrow drills into the calendar.
        fireEvent.click(screen.getByRole("button", { name: /Ajustar el rango de fechas/i }));
        expect(screen.getByText("Lun")).toBeInTheDocument();

        const grid = screen.getByText("Lun").parentElement!;
        const days = within(grid).getAllByRole("button");
        const pick = (label: string) =>
            days.find((b) => b.textContent === label && !b.className.includes("text-muted-foreground/40"))!;

        fireEvent.click(pick("3"));
        expect(props.onCustomRangeChange).not.toHaveBeenCalled(); // still half-picked
        fireEvent.click(pick("9"));

        expect(props.onCustomRangeChange).toHaveBeenCalledTimes(1);
        expect(props.onCustomRangeChange).toHaveBeenCalledWith("2026-06-03", "2026-06-09");
    });
});
