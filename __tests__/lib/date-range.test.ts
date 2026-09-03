import {
    toDateInputValue,
    toDateTimeLocalValue,
    isoToWallClockInput,
    wallClockInputToISO,
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

        it("cruza el año hacia adelante", () => {
            // Migrado de defaultHubCustomRange ("handles year rollover in both
            // directions"): diciembre con día >= 22 hace que el fin del ciclo (21
            // del mes siguiente) caiga en enero del año siguiente.
            expect(cycleRangeContaining(22, new Date(2026, 11, 25))).toEqual({
                start: "2026-12-22",
                end: "2027-01-21",
            });
        });

        it("con corte 22, un día anterior al corte en febrero ancla enero", () => {
            // Migrado de defaultHubCustomRange ("handles a sub-22 day in
            // February"): ningún otro caso de este describe usa corte 22 con
            // referencia en febrero.
            expect(cycleRangeContaining(22, new Date(2026, 1, 15))).toEqual({
                start: "2026-01-22",
                end: "2026-02-21",
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

        describe("con reference por defecto ('ahora' resuelto en APP_TIMEZONE, UTC-5)", () => {
            // Migrado de defaultHubCustomRange ("default reference resolves 'now'
            // in APP_TIMEZONE"): cubre el parámetro por defecto (reference =
            // zonedNow()), que ningún otro test de este describe ejercita.
            afterEach(() => {
                jest.useRealTimers();
            });

            it("no rueda en la noche del día de corte (el día UTC ya es el siguiente)", () => {
                // 2026-06-22T04:01Z === 2026-06-21 23:01 en America/Guayaquil (UTC-5).
                // El día UTC ya es el 22, pero el día local del usuario sigue siendo
                // el 21, así que el ciclo vigente (22 mayo → 21 junio) sigue activo.
                jest.useFakeTimers().setSystemTime(new Date("2026-06-22T04:01:00.000Z"));
                expect(cycleRangeContaining(22)).toEqual({
                    start: "2026-05-22",
                    end: "2026-06-21",
                });
            });

            it("rueda en cuanto es realmente el día de corte en APP_TIMEZONE", () => {
                // 2026-06-22T05:01Z === 2026-06-22 00:01 en UTC-5.
                jest.useFakeTimers().setSystemTime(new Date("2026-06-22T05:01:00.000Z"));
                expect(cycleRangeContaining(22)).toEqual({
                    start: "2026-06-22",
                    end: "2026-07-21",
                });
            });
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
