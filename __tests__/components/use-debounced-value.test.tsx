import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

describe("useDebouncedValue", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("returns the initial value immediately (no delayed first load)", () => {
        const { result } = renderHook(() => useDebouncedValue("2026-06-22", 400));
        expect(result.current).toBe("2026-06-22");
    });

    it("waits for the delay before settling on the new value", () => {
        const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), {
            initialProps: { v: "2026-06-22" },
        });

        rerender({ v: "2026-07-01" });
        expect(result.current).toBe("2026-06-22"); // still the old one

        act(() => { jest.advanceTimersByTime(399); });
        expect(result.current).toBe("2026-06-22");

        act(() => { jest.advanceTimersByTime(1); });
        expect(result.current).toBe("2026-07-01");
    });

    it("only emits the last value of a burst (typing a date by hand)", () => {
        const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), {
            initialProps: { v: "" },
        });

        // What a date input emits while the year is typed digit by digit.
        for (const partial of ["0002-07-01", "0020-07-01", "0202-07-01", "2026-07-01"]) {
            rerender({ v: partial });
            act(() => { jest.advanceTimersByTime(100) });
        }

        expect(result.current).toBe(""); // nothing settled mid-burst
        act(() => { jest.advanceTimersByTime(400); });
        expect(result.current).toBe("2026-07-01"); // only the final value
    });
});
