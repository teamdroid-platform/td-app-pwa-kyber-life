import {
    STALE_AFTER_DAYS, daysAgoLabel, daysSince, summarizeBalanceFreshness,
} from "@/lib/balance-freshness";

const NOW = new Date("2026-08-21T10:00:00.000Z");

/** Mismo día local que `NOW`, sea cual sea la hora. */
function sameDay(hour: string) {
    return `2026-08-21T${hour}:00:00.000Z`;
}

describe("daysSince", () => {
    it("cuenta días de calendario, no bloques de 24 horas", () => {
        expect(daysSince(sameDay("23"), NOW)).toBe(0);
        expect(daysSince("2026-08-20T23:00:00.000Z", NOW)).toBe(1);
        expect(daysSince("2026-08-09T00:00:00.000Z", NOW)).toBe(12);
    });
});

describe("daysAgoLabel", () => {
    it("dice hoy, ayer o los días que hayan pasado", () => {
        expect(daysAgoLabel(sameDay("01"), NOW)).toBe("hoy");
        expect(daysAgoLabel("2026-08-20T12:00:00.000Z", NOW)).toBe("ayer");
        expect(daysAgoLabel("2026-08-09T00:00:00.000Z", NOW)).toBe("hace 12 días");
    });
});

describe("summarizeBalanceFreshness", () => {
    it("cuenta como pendiente la cuenta sin corte y la que lo tiene viejo", () => {
        const stale = new Date(NOW);
        stale.setDate(stale.getDate() - STALE_AFTER_DAYS);

        const summary = summarizeBalanceFreshness([
            { lastAsOf: null },
            { lastAsOf: stale.toISOString() },
            { lastAsOf: sameDay("08") },
        ], NOW);

        expect(summary.total).toBe(3);
        expect(summary.pending).toBe(2);
    });

    it("se queda con el corte más reciente, comparando instantes y no texto", () => {
        const summary = summarizeBalanceFreshness([
            { lastAsOf: "2026-08-09T00:00:00.000Z" },
            { lastAsOf: "2026-08-20T00:00:00+00:00" },
        ], NOW);

        expect(summary.lastAsOf).toBe("2026-08-20T00:00:00+00:00");
    });

    it("sin cuentas, no hay nada que poner al día", () => {
        expect(summarizeBalanceFreshness([], NOW)).toEqual({
            total: 0, pending: 0, lastAsOf: null,
        });
    });
});
