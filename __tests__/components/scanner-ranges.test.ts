import { getWeekRange, toEcuadorDatePart } from "@/presentation/financial/components/ScannerManager";

/**
 * Which day a scan covered is a property of the scan, not of the viewer's
 * device — and the scanner must never be asked for days that haven't happened.
 * Both rules are pinned here because both produced visible wrong days.
 */
describe("scanner scan windows", () => {
    describe("toEcuadorDatePart", () => {
        it("keeps a plain calendar date verbatim", () => {
            expect(toEcuadorDatePart("2026-07-27")).toBe("2026-07-27");
        });

        it("keeps the requested day for the app's own Ecuador-offset boundaries", () => {
            expect(toEcuadorDatePart("2026-07-27T00:00:00.000-05:00")).toBe("2026-07-27");
            expect(toEcuadorDatePart("2026-08-02T23:59:59.999-05:00")).toBe("2026-08-02");
        });

        it("does not push a UTC boundary into the next day", () => {
            // 04:59 UTC is still the previous day in Ecuador (UTC-5). Reading the
            // literal date part lit up a day that was never scanned.
            expect(toEcuadorDatePart("2026-08-03T04:59:59.999+00:00")).toBe("2026-08-02");
            expect(toEcuadorDatePart("2026-07-31T04:59:59.999+00:00")).toBe("2026-07-30");
            expect(toEcuadorDatePart("2026-08-01T02:30:01.962Z")).toBe("2026-07-31");
        });

        it("leaves a UTC instant past 05:00 on its own day", () => {
            expect(toEcuadorDatePart("2026-07-31T14:30:01.839Z")).toBe("2026-07-31");
        });

        it("returns nothing for what it cannot read", () => {
            expect(toEcuadorDatePart(undefined)).toBeUndefined();
            expect(toEcuadorDatePart("")).toBeUndefined();
            expect(toEcuadorDatePart(42)).toBeUndefined();
        });

        it("falls back to any date it can find in an unparseable string", () => {
            expect(toEcuadorDatePart("scan of 2026-07-15 (broken)")).toBe("2026-07-15");
        });
    });

    describe("getWeekRange", () => {
        afterEach(() => {
            jest.useRealTimers();
        });

        const at = (iso: string) => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date(iso));
        };

        it("runs from Monday to today, never into the rest of the week", () => {
            // Saturday.
            at("2026-08-01T12:00:00");
            expect(getWeekRange()).toEqual({ start: "2026-07-27", end: "2026-08-01" });
        });

        it("covers the whole week once it is over", () => {
            // Sunday, the last day of the week.
            at("2026-08-02T12:00:00");
            expect(getWeekRange()).toEqual({ start: "2026-07-27", end: "2026-08-02" });
        });

        it("is a single day on a Monday", () => {
            at("2026-08-03T12:00:00");
            expect(getWeekRange()).toEqual({ start: "2026-08-03", end: "2026-08-03" });
        });
    });
});
