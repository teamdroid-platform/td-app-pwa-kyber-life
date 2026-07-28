import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DateRangePicker } from "@/components/ui/date-range-picker";

/** Open the calendar and return the grid's day buttons. */
function openCalendar() {
    fireEvent.click(screen.getByRole("button", { name: /Rango de fechas/i }));
    return screen.getByText("Lun").closest("div")!.parentElement!;
}

const clickDay = (day: string) => {
    const grid = screen.getByText("Lun").parentElement!;
    const target = within(grid)
        .getAllByRole("button")
        .find((b) => b.textContent === day && !b.className.includes("text-muted-foreground/40"));
    fireEvent.click(target!);
};

describe("DateRangePicker", () => {
    it("shows the selected range as a single label", () => {
        render(<DateRangePicker start="2026-06-22" end="2026-07-21" onChange={jest.fn()} />);
        expect(screen.getByRole("button", { name: /22 jun 2026 – 21 jul 2026/i })).toBeInTheDocument();
    });

    it("prompts for a range when nothing is selected", () => {
        render(<DateRangePicker start="" end="" onChange={jest.fn()} />);
        expect(screen.getByText("Selecciona un rango")).toBeInTheDocument();
    });

    it("emits once, after both ends are picked", () => {
        const onChange = jest.fn();
        render(<DateRangePicker start="2026-06-10" end="2026-06-20" onChange={onChange} />);

        openCalendar();
        clickDay("5");
        // The first tap only opens the selection — nothing is applied yet.
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByText(/elige el fin/i)).toBeInTheDocument();

        clickDay("15");
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("2026-06-05", "2026-06-15");
    });

    it("flips the ends when the range is picked backwards", () => {
        const onChange = jest.fn();
        render(<DateRangePicker start="2026-06-10" end="2026-06-20" onChange={onChange} />);

        openCalendar();
        clickDay("18");
        clickDay("4"); // earlier than the first tap

        expect(onChange).toHaveBeenCalledWith("2026-06-04", "2026-06-18");
    });

    it("does not open when disabled", () => {
        render(<DateRangePicker start="2026-06-22" end="2026-07-21" onChange={jest.fn()} disabled />);
        fireEvent.click(screen.getByRole("button", { name: /Rango de fechas/i }));
        expect(screen.queryByText("Lun")).not.toBeInTheDocument();
    });
});
