import {
    readListScroll, restoreListScroll, writeListScroll,
} from "@/presentation/financial/lib/list-scroll";

const KEY = '{"status":"CONFIRMED"}';
const OTRA = '{"status":"ARCHIVED"}';
const AHORA = 1_790_000_000_000;

beforeEach(() => {
    sessionStorage.clear();
});

describe("writeListScroll / readListScroll", () => {
    it("devuelve la posición de la misma lista", () => {
        writeListScroll({ key: KEY, y: 1840, pages: 3, savedAt: AHORA });

        expect(readListScroll(KEY, AHORA + 5_000)).toEqual({
            key: KEY, y: 1840, pages: 3, savedAt: AHORA,
        });
    });

    it("la consume: entrar de nuevo a la pantalla no vuelve a saltar", () => {
        writeListScroll({ key: KEY, y: 1840, pages: 3, savedAt: AHORA });

        expect(readListScroll(KEY, AHORA + 5_000)).not.toBeNull();
        expect(readListScroll(KEY, AHORA + 5_000)).toBeNull();
    });

    it("no restaura la posición de una lista con otros filtros", () => {
        // El mismo sitio no significa lo mismo en dos listas distintas: la de
        // gastos y la de ingresos ni siquiera miden igual.
        writeListScroll({ key: OTRA, y: 1840, pages: 3, savedAt: AHORA });

        expect(readListScroll(KEY, AHORA + 5_000)).toBeNull();
    });

    it("olvida una posición de hace más de media hora", () => {
        writeListScroll({ key: KEY, y: 1840, pages: 3, savedAt: AHORA });

        expect(readListScroll(KEY, AHORA + 31 * 60 * 1000)).toBeNull();
    });

    it("ignora el principio de la lista: ahí ya llega el navegador solo", () => {
        writeListScroll({ key: KEY, y: 0, pages: 1, savedAt: AHORA });

        expect(readListScroll(KEY, AHORA + 5_000)).toBeNull();
    });

    it("con la sesión sin nada guardado no devuelve nada", () => {
        expect(readListScroll(KEY, AHORA)).toBeNull();
    });

    it("un contenido corrupto no rompe la lista", () => {
        sessionStorage.setItem("kyber:list-scroll", "{no es json");

        expect(readListScroll(KEY, AHORA)).toBeNull();
    });
});

describe("restoreListScroll", () => {
    let scrollTo: jest.Mock;
    let frames: FrameRequestCallback[];

    /** Corre los fotogramas pendientes, como haría el navegador. */
    function runFrames(count: number) {
        for (let i = 0; i < count; i++) {
            const next = frames.shift();
            if (!next) return;
            next(0);
        }
    }

    /** Mueve la ventana como lo haría el navegador al hacer scrollTo. */
    function setScrollY(y: number) {
        Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    }

    function setPageHeight(height: number) {
        Object.defineProperty(document.documentElement, "scrollHeight", {
            value: height, configurable: true,
        });
    }

    beforeEach(() => {
        frames = [];
        scrollTo = jest.fn((_x: number, y: number) => setScrollY(y));
        Object.defineProperty(window, "scrollTo", { value: scrollTo, writable: true });
        Object.defineProperty(window, "innerHeight", { value: 800, writable: true });
        setScrollY(0);
        jest.spyOn(window, "requestAnimationFrame").mockImplementation(cb => {
            frames.push(cb);
            return frames.length;
        });
    });

    afterEach(() => { jest.restoreAllMocks(); });

    it("espera a que la lista tenga alto antes de dar por buena la posición", () => {
        // Al montar, la lista todavía no ha pintado sus tarjetas: no hay dónde
        // ir, pero tampoco se da por hecho que ya está.
        setPageHeight(800);
        restoreListScroll(2000);

        runFrames(4);
        expect(scrollTo).not.toHaveBeenCalled();
        expect(frames.length).toBeGreaterThan(0);

        // Las tarjetas aparecen y la página crece.
        setPageHeight(4000);
        runFrames(1);
        expect(scrollTo).toHaveBeenLastCalledWith(0, 2000);
    });

    it("insiste si algo devuelve la ventana al principio después", () => {
        // El router lleva la pantalla nueva al principio, y a veces lo hace
        // después de este primer intento: acertar una vez no basta.
        setPageHeight(4000);
        restoreListScroll(2000);

        runFrames(1);
        expect(scrollTo).toHaveBeenLastCalledWith(0, 2000);

        setScrollY(0);
        runFrames(1);
        expect(scrollTo).toHaveBeenLastCalledWith(0, 2000);
    });

    it("para cuando la posición se sostiene sola", () => {
        setPageHeight(4000);
        restoreListScroll(2000);

        // Uno para llegar y tres en los que nadie la mueve.
        runFrames(10);
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(frames).toHaveLength(0);
    });

    it("suelta la posición en cuanto el usuario hace scroll", () => {
        setPageHeight(4000);
        restoreListScroll(2000);

        runFrames(1);
        expect(scrollTo).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new Event("wheel"));
        setScrollY(300);
        runFrames(5);

        // No vuelve a moverla: la lleva el usuario.
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it("se rinde en vez de perseguir un alto que ya no existe", () => {
        // La transacción del final se borró: la lista nunca vuelve a medir eso.
        setPageHeight(900);
        restoreListScroll(5000, 3);

        runFrames(10);
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(frames).toHaveLength(0);
    });
});
