import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PeriodFilter } from "@/components/ui/period-filter";

const PRESETS = [
    { id: "today", label: "Hoy" },
    { id: "week", label: "Esta semana" },
    { id: "month", label: "Este mes" },
    { id: "all", label: "Todos" },
];

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
        expect(screen.getByRole("button", { name: /Período: Este mes/i })).toBeInTheDocument();
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
        fireEvent.click(screen.getByText("Esta semana"));
        expect(props.onChange).toHaveBeenCalledWith("week");
    });

    it("opens the calendar from the range entry and applies the new range", () => {
        const props = renderFilter();
        openDropdown();

        // The range entry expands into the calendar — no separate date field.
        fireEvent.click(screen.getByText("22 jun – 21 jul 2026"));
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
