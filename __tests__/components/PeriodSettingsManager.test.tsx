import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PeriodSettingsManager } from "@/presentation/components/period/PeriodSettingsManager";

const setCycleStartDayAction = jest.fn();

jest.mock("@/app/actions/period-settings", () => ({
    setCycleStartDayAction: (...args: unknown[]) => setCycleStartDayAction(...args),
}));

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
    jest.clearAllMocks();
    setCycleStartDayAction.mockResolvedValue({ success: true, data: null });
    jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));
});

afterEach(() => {
    jest.useRealTimers();
});

describe("PeriodSettingsManager", () => {
    it("muestra el ciclo que corresponde al día guardado", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);
        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-08-22");
        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-09-21");
    });

    it("elegir un día en la rejilla recalcula la vista previa sin guardar", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);

        fireEvent.click(screen.getByRole("radio", { name: /día 1 .*mes natural/i }));

        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-09-01");
        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-09-30");
        expect(setCycleStartDayAction).not.toHaveBeenCalled();
    });

    it("la rejilla ofrece los 31 días y marca el guardado", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);

        expect(screen.getAllByRole("radio")).toHaveLength(31);
        expect(screen.getByRole("radio", { name: /^día 22$/i })).toBeChecked();
    });

    it("guarda el día elegido en la rejilla, no el que llegó por props", async () => {
        jest.useRealTimers();

        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);

        fireEvent.click(screen.getByRole("radio", { name: /^día 15$/i }));
        fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

        await waitFor(() => {
            expect(setCycleStartDayAction).toHaveBeenCalledWith({
                scope: "FINANCIAL", cycleStartDay: 15,
            });
        });
    });

    it("no avisa del recorte con días menores que 29", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);
        expect(screen.queryByTestId("short-month-warning")).toBeNull();
    });

    it("avisa del recorte con día 31", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={31} />);
        expect(screen.getByTestId("short-month-warning")).toBeInTheDocument();
    });

    it("guarda con el ámbito y el día elegidos", async () => {
        // Este test no depende de la fecha y sí espera a una action: con los
        // timers falsos, `waitFor` y la transición de React compiten por el reloj.
        jest.useRealTimers();

        render(<PeriodSettingsManager scope="MARKET" cycleStartDay={1} />);

        fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

        await waitFor(() => {
            expect(setCycleStartDayAction).toHaveBeenCalledWith({ scope: "MARKET", cycleStartDay: 1 });
        });
    });

    it("en Compras muestra el ciclo financiero como referencia", () => {
        render(
            <PeriodSettingsManager scope="MARKET" cycleStartDay={1} financialCycleStartDay={22} />,
        );
        expect(screen.getByTestId("financial-cycle-reference")).toHaveTextContent("2026-08-22");
    });
});
