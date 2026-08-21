/**
 * Lo que el inicio necesita saber, ya masticado.
 *
 * El servidor lee de los servicios y arma aquí las cifras y las formas que la
 * pantalla dibuja: sumas, variación contra el mes anterior y los trazados SVG
 * de las gráficas. Todo son funciones puras —sin React y sin acceso a datos—
 * para que el cálculo se pueda probar sin montar la página.
 */

/** Un corte de saldo tal como lo devuelve `bankService.getBalanceBoard`. */
export interface BalanceBoardEntry {
    lastAsOf: string | null;
    lastBalance: number | null;
}

export interface BalanceTotals {
    /** Suma de los últimos cortes conocidos. */
    total: number;
    /** Cuentas activas del usuario. */
    accounts: number;
    /** De esas, cuántas tienen algún corte con el que sumar. */
    accountsWithBalance: number;
}

/**
 * El saldo total es la suma de los últimos cortes, no un dato del banco.
 *
 * Una cuenta sin ningún corte no suma cero: no se sabe cuánto tiene. Por eso
 * se cuenta aparte cuántas entraron en la suma — la pantalla lo dice cuando no
 * son todas, en vez de presentar un total al que le falta media cartera.
 */
export function sumBalances(board: readonly BalanceBoardEntry[]): BalanceTotals {
    const withBalance = board.filter(entry => entry.lastBalance !== null);
    return {
        total: withBalance.reduce((sum, entry) => sum + (entry.lastBalance ?? 0), 0),
        accounts: board.length,
        accountsWithBalance: withBalance.length,
    };
}

/**
 * Variación porcentual contra el periodo anterior.
 *
 * Devuelve `null` cuando no hay con qué comparar: sin gasto el mes pasado,
 * cualquier gasto de este es un aumento infinito, y «+∞ %» no informa de nada.
 */
export function percentChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

/** «$24.560,00». El importe siempre con su moneda: la app maneja varias. */
export function formatMoney(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

/** «12,5 %», sin signo: el signo lo pone la flecha que va al lado. */
export function formatPercent(value: number, digits = 1): string {
    return `${new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(Math.abs(value))} %`;
}

/** «8 ago» — la etiqueta corta del eje horizontal. */
export function formatDayLabel(isoDate: string): string {
    // Sin zona: `2026-08-08` interpretado como UTC se corre un día hacia atrás
    // en cualquier huso al oeste de Greenwich, que es donde vive el usuario.
    const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
        day: "numeric", month: "short",
    }).replace(".", "");
}

/** «10,2 mil» → «10,2 K». Para los números del eje, donde no cabe el importe. */
export function formatCompact(value: number): string {
    if (Math.abs(value) >= 1000) {
        const thousands = value / 1000;
        const digits = Math.abs(thousands) >= 10 ? 0 : 1;
        return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(thousands)} K`;
    }
    return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
}

export interface Domain {
    min: number;
    max: number;
}

/**
 * La escala vertical que comparten varias series.
 *
 * Cada línea escalada a su propio máximo miente por comparación: gastos de cien
 * e ingresos de diez mil se dibujarían con la misma altura. Y arranca en cero
 * —no en el mínimo— porque escalada al mínimo una variación de céntimos se
 * dibuja como una montaña.
 */
export function seriesDomain(...series: readonly (readonly number[])[]): Domain {
    const all = series.flat();
    return {
        min: Math.min(0, ...all),
        max: Math.max(0, ...all),
    };
}

export interface Viewport {
    width: number;
    height: number;
    /** Margen interior para que el trazo no se corte contra el borde. */
    padding?: number;
    /** Escala vertical impuesta. Sin ella, cada serie usa la suya. */
    domain?: Domain;
}

/** Serie de números a coordenadas dentro de un `viewBox`. */
export function toPoints(values: readonly number[], { width, height, padding = 0, domain }: Viewport): [number, number][] {
    if (values.length === 0) return [];
    const { min, max } = domain ?? seriesDomain(values);
    const span = max - min || 1;
    const usableHeight = height - padding * 2;
    const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

    return values.map((value, index) => [
        padding + index * step,
        padding + usableHeight - ((value - min) / span) * usableHeight,
    ]);
}

/** El trazo de la línea: `M x,y L x,y …`. Cadena vacía si no hay serie. */
export function linePath(values: readonly number[], viewport: Viewport): string {
    const points = toPoints(values, viewport);
    if (points.length === 0) return "";
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/** La misma línea cerrada contra el suelo, para el degradado de debajo. */
export function areaPath(values: readonly number[], viewport: Viewport): string {
    const line = linePath(values, viewport);
    if (!line) return "";
    const points = toPoints(values, viewport);
    const [firstX] = points[0];
    const [lastX] = points[points.length - 1];
    return `${line} L${lastX.toFixed(2)},${viewport.height} L${firstX.toFixed(2)},${viewport.height} Z`;
}

export interface DonutSlice {
    label: string;
    value: number;
    percentage: number;
    color: string;
}

export interface DonutArc extends DonutSlice {
    /** Trazado del arco, listo para `<path d>`. */
    d: string;
}

/**
 * Los arcos del anillo, en el orden en que llegan.
 *
 * Se dibuja con `stroke` sobre una circunferencia y no con sectores rellenos:
 * un anillo hecho de sectores necesita recortar el agujero del medio, y con
 * trazo el grosor es un número y el hueco sale solo.
 */
export function donutArcs(slices: readonly DonutSlice[], radius: number): DonutArc[] {
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return slices.map(slice => {
        const length = (slice.percentage / 100) * circumference;
        const arc: DonutArc = { ...slice, d: describeArc(radius, offset, length, circumference) };
        offset += length;
        return arc;
    });
}

/** Un arco desde `start` (medido en longitud de circunferencia) y de largo `length`. */
function describeArc(radius: number, start: number, length: number, circumference: number): string {
    const angleFor = (distance: number) => (distance / circumference) * 2 * Math.PI - Math.PI / 2;
    const from = angleFor(start);
    const to = angleFor(start + length);
    const largeArc = length / circumference > 0.5 ? 1 : 0;

    const x1 = radius * Math.cos(from);
    const y1 = radius * Math.sin(from);
    const x2 = radius * Math.cos(to);
    const y2 = radius * Math.sin(to);

    // Una porción del 100 % no se puede dibujar con un solo arco: sus extremos
    // caen en el mismo punto y el trazo desaparece. Se parte en dos medias.
    if (length >= circumference) {
        return `M0,${-radius} A${radius},${radius} 0 1 1 0,${radius} A${radius},${radius} 0 1 1 0,${-radius}`;
    }

    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/** Serie acumulada: cada punto es la suma de todo lo anterior más lo de hoy. */
export function cumulative(values: readonly number[]): number[] {
    let running = 0;
    return values.map(value => (running += value));
}

/** Las tres cosas que el inicio sabe que pueden estar esperando una decisión. */
export type AlertKind = "scans" | "balances" | "pending";

export interface AlertItem {
    kind: AlertKind;
    title: string;
    description: string;
    actionLabel: string;
    href: string;
}

export interface AlertSignals {
    /** Escaneos en la bandeja sin revisar. */
    pendingScans: number;
    /** Cuentas sin corte, o con el corte viejo. */
    pendingBalances: number;
    /** Movimientos detectados que nadie ha confirmado todavía. */
    pendingTransactions: number;
}

/**
 * De señales a avisos, en el orden en que conviene atenderlos.
 *
 * Solo se emite lo que tiene número: una ficha que avisa de algo que la app no
 * mide —un presupuesto que no existe— enseña a ignorar la tarjeta entera. Y
 * una señal en cero no produce aviso: la lista vacía es una respuesta.
 */
export function buildAlerts({ pendingScans, pendingBalances, pendingTransactions }: AlertSignals): AlertItem[] {
    const alerts: AlertItem[] = [];

    if (pendingScans > 0) {
        alerts.push({
            kind: "scans",
            title: `${pendingScans} ${pendingScans === 1 ? "escaneo pendiente" : "escaneos pendientes"}`,
            description: "Revisa los comprobantes en la bandeja de escaneos.",
            actionLabel: "Revisar",
            href: "/financial/scans",
        });
    }

    if (pendingBalances > 0) {
        alerts.push({
            kind: "balances",
            title: `${pendingBalances} ${pendingBalances === 1 ? "cuenta sin corte reciente" : "cuentas sin corte reciente"}`,
            description: "Pon los saldos al día para que el total cuadre.",
            actionLabel: "Actualizar",
            href: "/financial/balances",
        });
    }

    if (pendingTransactions > 0) {
        alerts.push({
            kind: "pending",
            title: `${pendingTransactions} ${pendingTransactions === 1 ? "movimiento por confirmar" : "movimientos por confirmar"}`,
            description: "Confírmalos para que entren en tus totales.",
            actionLabel: "Ver",
            href: "/financial/transactions",
        });
    }

    return alerts;
}

/**
 * «Hoy, 10:45» · «Ayer, 16:30» · «20 ago, 20:15».
 *
 * Los dos últimos días se nombran en vez de fecharse: en una lista de lo
 * reciente, «hoy» se ubica de un vistazo y «21 ago» hay que compararlo con el
 * calendario. La hora va siempre, que es lo que distingue dos movimientos del
 * mismo día.
 */
export function formatWhen(iso: string, now: Date = new Date()): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const days = Math.round((midnight(now) - midnight(date)) / 86_400_000);
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    if (days === 0) return `Hoy, ${time}`;
    if (days === 1) return `Ayer, ${time}`;

    // El día se arma con los captadores locales, no con `toISOString()`: al
    // oeste de Greenwich, un movimiento de la noche cae al día siguiente en UTC.
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return `${formatDayLabel(local)}, ${time}`;
}
