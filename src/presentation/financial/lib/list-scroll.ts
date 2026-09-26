/**
 * Dónde estaba la lista cuando se salió de ella.
 *
 * Abrir una transacción del final de la lista y volver dejaba la pantalla
 * otra vez arriba, con el dedo a diez pantallazos de donde estaba. No es un
 * fallo del navegador: la flecha de volver del detalle es un enlace a la
 * lista, o sea una navegación nueva, así que no hay posición que el navegador
 * pueda restaurar —y aunque la hubiera, la lista se vuelve a montar vacía y
 * crece después, cuando el intento de restaurar ya pasó—.
 *
 * Por eso la posición se guarda a mano al salir y se repone al volver, una
 * sola vez: repetirla convertiría una entrada nueva a la pantalla en un salto
 * inexplicable.
 */

/** La misma clave para toda la app: solo puede haber una lista saliendo a la vez. */
const STORAGE_KEY = "kyber:list-scroll";

/**
 * Cuánto vale una posición guardada. Media hora es de sobra para ir al
 * detalle y volver, y poco para que una sesión abierta desde ayer aterrice
 * donde nadie recuerda haber estado.
 */
const TTL_MS = 30 * 60 * 1000;

export interface ListScrollSnapshot {
    /**
     * Qué lista era, con sus filtros. Restaurar la posición de la lista de
     * gastos sobre la de ingresos sería peor que no restaurar nada: las dos
     * miden distinto y el sitio no significa lo mismo.
     */
    key: string;
    /** Desplazamiento vertical de la ventana, en píxeles. */
    y: number;
    /** Cuántas páginas del scroll infinito había cargadas. */
    pages: number;
    savedAt: number;
}

/** Guarda la posición. Un almacenamiento lleno o bloqueado no rompe la lista. */
export function writeListScroll(snapshot: ListScrollSnapshot): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
        // sessionStorage puede no existir (modo privado, ajustes del navegador).
    }
}

/**
 * La posición guardada para esta lista, **y la consume**: leerla dos veces
 * haría saltar la pantalla cada vez que se entra a ella.
 *
 * Devuelve null si no hay, si es de otra lista, si caducó o si el sitio era
 * el principio —volver al principio es justo lo que hace el navegador solo—.
 */
export function readListScroll(key: string, now: number = Date.now()): ListScrollSnapshot | null {
    let raw: string | null = null;
    try {
        raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

    let snapshot: ListScrollSnapshot;
    try {
        snapshot = JSON.parse(raw) as ListScrollSnapshot;
    } catch {
        return null;
    }

    if (snapshot?.key !== key) return null;
    if (!(snapshot.y > 0)) return null;
    if (!(now - snapshot.savedAt < TTL_MS)) return null;

    return snapshot;
}

/**
 * Vuelve a `y` en cuanto la página tenga alto suficiente.
 *
 * Las tarjetas aparecen después del primer pintado, así que un `scrollTo`
 * suelto se queda corto: el documento todavía mide una pantalla. Se reintenta
 * fotograma a fotograma mientras la página siga creciendo, con un tope para no
 * quedarse persiguiendo una lista que nunca llega a ese alto —porque se borró
 * una transacción, por ejemplo—.
 */
export function restoreListScroll(y: number, maxFrames = 30): void {
    let frames = 0;

    const step = () => {
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.min(y, max));

        // Llegó, o la página ya no puede crecer más hacia esa posición.
        if (max >= y || frames >= maxFrames) return;
        frames += 1;
        requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}
