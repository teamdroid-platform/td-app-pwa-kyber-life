import {
    toDateInputValue,
    toDateTimeLocalValue,
    isoToWallClockInput,
    wallClockInputToISO,
    defaultHubCustomRange,
    computeDateRange,
    cycleRangeContaining,
    cycleToDate,
    cyclePreviousRange,
    toFullDayDates,
    toFullDayIsoRange,
} from "@/lib/date-range";

describe("date-range", () => {
    describe("toDateInputValue", () => {
        it("formats a Date as zero-padded local YYYY-MM-DD", () => {
            expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
            expect(toDateInputValue(new Date(2026, 11, 31))).toBe("2026-12-31");
        });
    });

    describe("toDateTimeLocalValue", () => {
        it("formats a Date as local YYYY-MM-DDTHH:mm", () => {
            expect(toDateTimeLocalValue(new Date(2026, 5, 22, 9, 5))).toBe("2026-06-22T09:05");
        });
    });

    describe("isoToWallClockInput (literal wall-clock, timezone-independent)", () => {
        it("reads the UTC components of the stored timestamp verbatim", () => {
            // 03:15 stored → shown as 03:15 regardless of the device timezone.
            expect(isoToWallClockInput("2026-06-24T03:15:00.000Z")).toBe("2026-06-24T03:15");
            expect(isoToWallClockInput("2026-12-31T23:59:00Z")).toBe("2026-12-31T23:59");
        });

        it("returns null for nullish or invalid input", () => {
            expect(isoToWallClockInput(null)).toBeNull();
            expect(isoToWallClockInput(undefined)).toBeNull();
            expect(isoToWallClockInput("")).toBeNull();
            expect(isoToWallClockInput("not-a-date")).toBeNull();
        });

        it("round-trips with wallClockInputToISO without shifting", () => {
            const iso = "2026-06-24T03:15:00.000Z";
            const input = isoToWallClockInput(iso)!;
            expect(wallClockInputToISO(input)).toBe(iso);
        });
    });

    describe("wallClockInputToISO (persist digits as UTC)", () => {
        it("treats the datetime-local digits as UTC", () => {
            expect(wallClockInputToISO("2026-06-24T03:15")).toBe("2026-06-24T03:15:00.000Z");
        });

        it("accepts values that already include seconds", () => {
            expect(wallClockInputToISO("2026-06-24T03:15:30")).toBe("2026-06-24T03:15:30.000Z");
        });

        it("returns undefined for nullish or invalid input", () => {
            expect(wallClockInputToISO(null)).toBeUndefined();
            expect(wallClockInputToISO(undefined)).toBeUndefined();
            expect(wallClockInputToISO("")).toBeUndefined();
            expect(wallClockInputToISO("garbage")).toBeUndefined();
        });
    });

    describe("defaultHubCustomRange (billing cycle 22 → 21)", () => {
        it("uses the current cycle when the day is >= 22", () => {
            expect(defaultHubCustomRange(new Date(2026, 5, 22))).toEqual({
                start: "2026-06-22",
                end: "2026-07-21",
            });
        });

        it("keeps the same cycle for any day up to the 21st (does not roll early)", () => {
            // July 5 is still inside the Jun-22 → Jul-21 cycle, NOT Jul-22 → Aug-21.
            expect(defaultHubCustomRange(new Date(2026, 6, 5))).toEqual({
                start: "2026-06-22",
                end: "2026-07-21",
            });
            // The 21st is the last day of the cycle.
            expect(defaultHubCustomRange(new Date(2026, 6, 21))).toEqual({
                start: "2026-06-22",
                end: "2026-07-21",
            });
        });

        it("rolls forward only once the day reaches the 22nd", () => {
            expect(defaultHubCustomRange(new Date(2026, 6, 22))).toEqual({
                start: "2026-07-22",
                end: "2026-08-21",
            });
        });

        it("handles year rollover in both directions", () => {
            // Late December → cycle ends next January.
            expect(defaultHubCustomRange(new Date(2026, 11, 25))).toEqual({
                start: "2026-12-22",
                end: "2027-01-21",
            });
            // Early January → cycle started the previous December.
            expect(defaultHubCustomRange(new Date(2027, 0, 10))).toEqual({
                start: "2026-12-22",
                end: "2027-01-21",
            });
        });

        it("handles a sub-22 day in February (anchors to January)", () => {
            expect(defaultHubCustomRange(new Date(2026, 1, 15))).toEqual({
                start: "2026-01-22",
                end: "2026-02-21",
            });
        });

        describe("default reference resolves 'now' in APP_TIMEZONE (UTC-5)", () => {
            afterEach(() => {
                jest.useRealTimers();
            });

            it("does NOT roll forward on the evening of the 21st (bug: UTC already the 22nd)", () => {
                // 2026-06-22T04:01Z === 2026-06-21 23:01 in America/Guayaquil (UTC-5).
                // The UTC day is the 22nd, but the user's local day is still the 21st,
                // so the current cycle (May 22 → Jun 21) must remain selected.
                jest.useFakeTimers().setSystemTime(new Date("2026-06-22T04:01:00.000Z"));
                expect(defaultHubCustomRange()).toEqual({
                    start: "2026-05-22",
                    end: "2026-06-21",
                });
            });

            it("rolls forward once it is actually the 22nd in APP_TIMEZONE", () => {
                // 2026-06-22T05:01Z === 2026-06-22 00:01 in UTC-5.
                jest.useFakeTimers().setSystemTime(new Date("2026-06-22T05:01:00.000Z"));
                expect(defaultHubCustomRange()).toEqual({
                    start: "2026-06-22",
                    end: "2026-07-21",
                });
            });
        });
    });

    describe("computeDateRange", () => {
        it("returns no bounds for 'all'", () => {
            expect(computeDateRange("all")).toEqual({ startDate: undefined, endDate: undefined });
        });

        it("expands a custom range to full days (00:00 → 23:59:59)", () => {
            const { startDate, endDate } = computeDateRange("custom", "2026-06-22", "2026-07-21");
            expect(startDate).toBeDefined();
            expect(endDate).toBeDefined();

            const start = new Date(startDate!);
            expect(start.getFullYear()).toBe(2026);
            expect(start.getMonth()).toBe(5); // June
            expect(start.getDate()).toBe(22);
            expect(start.getHours()).toBe(0);
            expect(start.getMinutes()).toBe(0);
            expect(start.getSeconds()).toBe(0);

            const end = new Date(endDate!);
            expect(end.getMonth()).toBe(6); // July
            expect(end.getDate()).toBe(21);
            expect(end.getHours()).toBe(23);
            expect(end.getMinutes()).toBe(59);
            expect(end.getSeconds()).toBe(59);
        });

        it("returns no bounds for 'custom' without dates", () => {
            expect(computeDateRange("custom")).toEqual({ startDate: undefined, endDate: undefined });
        });

        describe("relative presets (anchored to 'now')", () => {
            beforeEach(() => {
                jest.useFakeTimers();
                jest.setSystemTime(new Date(2026, 5, 22, 10, 30, 0)); // 2026-06-22 10:30
            });
            afterEach(() => {
                jest.useRealTimers();
            });

            it("'today' spans the current day from 00:00 to 23:59:59", () => {
                const { startDate, endDate } = computeDateRange("today");
                const start = new Date(startDate!);
                const end = new Date(endDate!);
                expect(start.getDate()).toBe(22);
                expect(start.getHours()).toBe(0);
                expect(end.getDate()).toBe(22);
                expect(end.getHours()).toBe(23);
                expect(end.getMinutes()).toBe(59);
            });

            it("'month' starts on the 1st of the current month", () => {
                const { startDate, endDate } = computeDateRange("month");
                const start = new Date(startDate!);
                expect(start.getDate()).toBe(1);
                expect(start.getMonth()).toBe(5); // June
                expect(start.getHours()).toBe(0);
                expect(new Date(endDate!).getDate()).toBe(22); // up to "now"
            });
        });

        it("'today' uses the APP_TIMEZONE day, not the UTC day, near midnight", () => {
            // 2026-06-22T04:01Z === 2026-06-21 23:01 in America/Guayaquil (UTC-5).
            // The UTC day is already the 22nd, but "today" for the user is the 21st.
            jest.useFakeTimers().setSystemTime(new Date("2026-06-22T04:01:00.000Z"));
            const { startDate } = computeDateRange("today");
            const start = new Date(startDate!);
            expect(start.getMonth()).toBe(5); // June
            expect(start.getDate()).toBe(21);
            jest.useRealTimers();
        });
    });

    describe("cycleRangeContaining", () => {
        it("con corte 22, una fecha anterior al corte ancla el mes previo", () => {
            expect(cycleRangeContaining(22, new Date(2026, 8, 2))).toEqual({
                start: "2026-08-22",
                end: "2026-09-21",
            });
        });

        it("rueda exactamente el día del corte", () => {
            expect(cycleRangeContaining(22, new Date(2026, 8, 21))).toEqual({
                start: "2026-08-22",
                end: "2026-09-21",
            });
            expect(cycleRangeContaining(22, new Date(2026, 8, 22))).toEqual({
                start: "2026-09-22",
                end: "2026-10-21",
            });
        });

        it("cruza el año hacia atrás", () => {
            expect(cycleRangeContaining(22, new Date(2027, 0, 10))).toEqual({
                start: "2026-12-22",
                end: "2027-01-21",
            });
        });

        it("con corte 1 devuelve el mes natural completo, de 30 días", () => {
            expect(cycleRangeContaining(1, new Date(2026, 8, 15))).toEqual({
                start: "2026-09-01",
                end: "2026-09-30",
            });
        });

        it("con corte 1 devuelve el mes natural completo, de 31 días", () => {
            expect(cycleRangeContaining(1, new Date(2026, 9, 15))).toEqual({
                start: "2026-10-01",
                end: "2026-10-31",
            });
        });

        it("con corte 1 resuelve febrero sin caso especial", () => {
            expect(cycleRangeContaining(1, new Date(2026, 1, 15))).toEqual({
                start: "2026-02-01",
                end: "2026-02-28",
            });
        });

        it("con corte 31 recorta el ancla al último día real de febrero", () => {
            expect(cycleRangeContaining(31, new Date(2026, 1, 15))).toEqual({
                start: "2026-01-31",
                end: "2026-02-27",
            });
        });

        it("con corte 31 encadena ciclos desiguales sin huecos ni solapes", () => {
            const enero = cycleRangeContaining(31, new Date(2026, 1, 15));
            const febrero = cycleRangeContaining(31, new Date(2026, 2, 15));

            expect(enero).toEqual({ start: "2026-01-31", end: "2026-02-27" });
            expect(febrero).toEqual({ start: "2026-02-28", end: "2026-03-30" });

            // El día siguiente al fin de un ciclo es el inicio del siguiente.
            const diaDespues = new Date(`${enero.end}T00:00:00`);
            diaDespues.setDate(diaDespues.getDate() + 1);
            expect(toDateInputValue(diaDespues)).toBe(febrero.start);
        });
    });

    describe("cycleToDate", () => {
        it("arranca en el inicio del ciclo y termina en la referencia", () => {
            expect(cycleToDate(22, new Date(2026, 8, 10))).toEqual({
                start: "2026-08-22",
                end: "2026-09-10",
            });
        });

        it("con corte 1 es el mes natural hasta hoy", () => {
            expect(cycleToDate(1, new Date(2026, 8, 10))).toEqual({
                start: "2026-09-01",
                end: "2026-09-10",
            });
        });
    });

    describe("cyclePreviousRange", () => {
        it("devuelve el ciclo inmediatamente anterior", () => {
            expect(cyclePreviousRange(22, new Date(2026, 8, 2))).toEqual({
                start: "2026-07-22",
                end: "2026-08-21",
            });
        });

        it("con corte 31 no solapa aunque los ciclos midan distinto", () => {
            // El ciclo actual es 2026-02-28 → 2026-03-30; el anterior, 2026-01-31 → 2026-02-27.
            expect(cyclePreviousRange(31, new Date(2026, 2, 15))).toEqual({
                start: "2026-01-31",
                end: "2026-02-27",
            });
        });
    });

    describe("toFullDayDates / toFullDayIsoRange", () => {
        it("expande a día completo, del primer al último milisegundo", () => {
            const { start, end } = toFullDayDates({ start: "2026-08-22", end: "2026-09-21" });
            expect(start.getHours()).toBe(0);
            expect(start.getMinutes()).toBe(0);
            expect(end.getHours()).toBe(23);
            expect(end.getMinutes()).toBe(59);
            expect(end.getSeconds()).toBe(59);
            expect(end.getMilliseconds()).toBe(999);
        });

        it("la versión ISO devuelve los mismos instantes serializados", () => {
            const dates = toFullDayDates({ start: "2026-08-22", end: "2026-09-21" });
            expect(toFullDayIsoRange({ start: "2026-08-22", end: "2026-09-21" })).toEqual({
                startDate: dates.start.toISOString(),
                endDate: dates.end.toISOString(),
            });
        });
    });
});
