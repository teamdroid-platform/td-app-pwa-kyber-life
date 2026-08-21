import {
    buildAlerts, cumulative, donutArcs, formatWhen, linePath, percentChange,
    seriesDomain, sumBalances, toPoints,
} from "@/lib/home-overview";

describe("sumBalances", () => {
    it("suma solo las cuentas que tienen corte, y dice cuántas fueron", () => {
        const totals = sumBalances([
            { lastAsOf: "2026-08-20T00:00:00Z", lastBalance: 1200 },
            { lastAsOf: "2026-08-01T00:00:00Z", lastBalance: 300.5 },
            { lastAsOf: null, lastBalance: null },
        ]);

        expect(totals).toEqual({ total: 1500.5, accounts: 3, accountsWithBalance: 2 });
    });

    it("sin cuentas, el total es cero y no explota", () => {
        expect(sumBalances([])).toEqual({ total: 0, accounts: 0, accountsWithBalance: 0 });
    });
});

describe("percentChange", () => {
    it("mide la variación contra el periodo anterior", () => {
        expect(percentChange(120, 100)).toBe(20);
        expect(percentChange(80, 100)).toBe(-20);
    });

    // Sin gasto el mes pasado cualquier gasto es un aumento infinito, y eso no
    // se puede escribir como porcentaje.
    it("no compara contra cero", () => {
        expect(percentChange(50, 0)).toBeNull();
    });
});

describe("cumulative", () => {
    it("acumula cada punto sobre los anteriores", () => {
        expect(cumulative([10, -4, 2])).toEqual([10, 6, 8]);
        expect(cumulative([])).toEqual([]);
    });
});

describe("seriesDomain", () => {
    it("comparte una sola escala entre las series, siempre con el cero dentro", () => {
        expect(seriesDomain([10, 20], [5, 40])).toEqual({ min: 0, max: 40 });
        expect(seriesDomain([-30, 10])).toEqual({ min: -30, max: 10 });
    });
});

describe("toPoints", () => {
    it("reparte los puntos a lo ancho y respeta la escala impuesta", () => {
        const points = toPoints([0, 50, 100], { width: 100, height: 100, domain: { min: 0, max: 100 } });

        expect(points).toEqual([[0, 100], [50, 50], [100, 0]]);
    });

    it("sin serie no hay trazo", () => {
        expect(toPoints([], { width: 10, height: 10 })).toEqual([]);
        expect(linePath([], { width: 10, height: 10 })).toBe("");
    });
});

/** El punto del que parte un trazado: lo que sigue a la `M`. */
function startOf(path: string): string {
    return path.slice(1).split(" ")[0];
}

/** El punto en el que termina: el último par de coordenadas del arco. */
function endOf(path: string): string {
    const parts = path.trim().split(" ");
    return parts[parts.length - 1];
}

describe("donutArcs", () => {
    it("encadena los arcos uno detrás de otro sin dejar hueco", () => {
        const arcs = donutArcs([
            { label: "Súper", value: 40, percentage: 40, color: "#2dd4bf" },
            { label: "Transporte", value: 60, percentage: 60, color: "#a78bfa" },
        ], 46);

        expect(arcs).toHaveLength(2);
        // Arranca arriba del todo, en las doce en punto.
        expect(arcs[0].d.startsWith("M0.00,-46.00")).toBe(true);
        // Y la segunda porción empieza justo donde acabó la primera.
        expect(startOf(arcs[1].d)).toBe(endOf(arcs[0].d));
    });

    it("una sola categoría al 100 % se dibuja como anillo entero", () => {
        const [arc] = donutArcs([{ label: "Súper", value: 10, percentage: 100, color: "#2dd4bf" }], 46);

        // Dos medias circunferencias: con un solo arco los extremos coinciden
        // y el trazo desaparece.
        expect(arc.d.match(/A46,46/g)).toHaveLength(2);
    });
});

describe("formatWhen", () => {
    const now = new Date(2026, 7, 21, 12, 0);

    it("nombra los dos últimos días en vez de fecharlos", () => {
        expect(formatWhen(new Date(2026, 7, 21, 10, 45).toISOString(), now)).toBe("Hoy, 10:45");
        expect(formatWhen(new Date(2026, 7, 20, 16, 30).toISOString(), now)).toBe("Ayer, 16:30");
    });

    it("más atrás, fecha corta y hora", () => {
        expect(formatWhen(new Date(2026, 7, 15, 20, 15).toISOString(), now)).toBe("15 ago, 20:15");
    });

    it("una fecha ilegible no rompe la fila", () => {
        expect(formatWhen("no-es-una-fecha", now)).toBe("");
    });
});

describe("buildAlerts", () => {
    it("emite un aviso por cada señal con número, en orden de atención", () => {
        const alerts = buildAlerts({ pendingScans: 2, pendingBalances: 1, pendingTransactions: 3 });

        expect(alerts.map(alert => alert.kind)).toEqual(["scans", "balances", "pending"]);
        expect(alerts[0].title).toBe("2 escaneos pendientes");
        expect(alerts[1].title).toBe("1 cuenta sin corte reciente");
        expect(alerts[2].href).toBe("/financial/transactions");
    });

    it("una señal en cero no produce aviso", () => {
        expect(buildAlerts({ pendingScans: 0, pendingBalances: 0, pendingTransactions: 0 })).toEqual([]);
    });
});
