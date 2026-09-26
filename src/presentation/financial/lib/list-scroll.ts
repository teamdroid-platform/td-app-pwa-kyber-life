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
 * Vuelve a `y` y **se queda ahí** mientras la pantalla se termina de armar.
 *
 * Hay dos cosas que pelean por la posición. Las tarjetas aparecen después del
 * primer pintado, así que un `scrollTo` suelto se queda corto: el documento
 * todavía mide una pantalla. Y el router lleva la ventana al principio cuando
 * monta la pantalla nueva, a veces después de este primer intento. Por eso no
 * basta con acertar una vez: se reintenta fotograma a fotograma hasta que la
 * posición se sostiene sola unos cuantos seguidos.
 *
 * Se abandona en cuanto el usuario toca el scroll —es suyo, no nuestro— y en
 * todo caso al llegar al tope de fotogramas, para no quedarse persiguiendo un
 * alto que ya no existe porque se borró la transacción del final.
 */
export function restoreListScroll(y: number, maxFrames = 40): void {
    let frames = 0;
    let settled = 0;
    let done = false;

    const stop = () => {
        done = true;
        for (const event of USER_SCROLL_EVENTS) {
            window.removeEventListener(event, stop);
        }
    };

    for (const event of USER_SCROLL_EVENTS) {
        window.addEventListener(event, stop, { passive: true, once: true });
    }

    const step = () => {
        if (done) return;

        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const target = Math.min(y, max);

        if (Math.abs(window.scrollY - target) > 1) {
            window.scrollTo(0, target);
            settled = 0;
        } else {
            settled += 1;
        }

        frames += 1;
        // Llegó al sitio pedido y se mantuvo: nadie más lo está moviendo.
        if (settled >= SETTLED_FRAMES && max >= y) return stop();
        if (frames >= maxFrames) return stop();

        requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}

/** Gestos con los que el usuario dice que la posición la lleva él. */
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const;

/** Cuántos fotogramas seguidos tiene que aguantar la posición para darla por buena. */
const SETTLED_FRAMES = 3;
