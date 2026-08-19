/**
 * Detección de emisores repetidos.
 *
 * El caso real: «COAC Jardín Azuayo», «Coop Jardín Azuayo» y «Cooperativa de
 * Ahorro y Crédito Jardín Azuayo» son la misma cooperativa registrada tres
 * veces —dos de ellas nacidas de un escaneo—. Ninguna comparación de cadenas
 * las une, porque lo único que comparten es el nombre propio del final.
 *
 * La idea es quedarse con ese nombre propio: se quita la forma jurídica del
 * principio («banco», «cooperativa de ahorro y crédito», «coac», «coop») y lo
 * que sobra es la huella. Dos instituciones con la misma huella son la misma.
 */

/** Formas jurídicas y abreviaturas que no distinguen a un emisor de otro. */
const LEGAL_FORMS = [
    "cooperativa de ahorro y credito",
    "cooperativa de ahorro credito",
    "cooperativa de ahorro",
    "cooperativa",
    "coac",
    "coop",
    "banco del",
    "banco de",
    "banco",
    "bco",
    "mutualista",
    "financiera",
    "caja de ahorro",
    "caja",
];

/** Palabras que sobran dentro del nombre, no solo al principio. */
const NOISE_WORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "ltda", "sa", "s", "a"]);

/**
 * Reduce un nombre a lo que de verdad lo identifica: sin tildes, sin
 * mayúsculas, sin forma jurídica y sin palabras de relleno.
 *
 * Se exporta porque las pruebas necesitan fijar el comportamiento del
 * normalizador aparte del agrupamiento.
 */
export function institutionFingerprint(name: string): string {
    let text = name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Solo al principio: «Banco Pichincha» y «Pichincha» son el mismo emisor,
    // pero quitar la palabra en cualquier posición uniría cosas distintas.
    for (const form of LEGAL_FORMS) {
        if (text === form) return text;
        if (text.startsWith(`${form} `)) {
            text = text.slice(form.length + 1);
            break;
        }
    }

    return text
        .split(" ")
        .filter(word => word.length > 0 && !NOISE_WORDS.has(word))
        .join(" ");
}

export interface DuplicateGroup<T> {
    /** La huella compartida; sirve de clave estable en React. */
    fingerprint: string;
    /** Cómo llamar al grupo en pantalla: la huella con iniciales en mayúscula. */
    label: string;
    members: T[];
}

/**
 * Agrupa las instituciones que comparten huella. Solo devuelve los grupos con
 * más de un miembro: una sola no es un duplicado.
 */
export function findDuplicateInstitutions<T extends { id: string; name: string }>(
    institutions: T[],
): DuplicateGroup<T>[] {
    const byFingerprint = new Map<string, T[]>();

    for (const institution of institutions) {
        const fingerprint = institutionFingerprint(institution.name);
        // Un nombre que se queda en nada tras normalizar —«Banco», «Coop»— no
        // identifica a nadie; agruparlo uniría emisores sin relación.
        if (!fingerprint) continue;

        const bucket = byFingerprint.get(fingerprint);
        if (bucket) bucket.push(institution);
        else byFingerprint.set(fingerprint, [institution]);
    }

    return [...byFingerprint.entries()]
        .filter(([, members]) => members.length > 1)
        .map(([fingerprint, members]) => ({
            fingerprint,
            label: fingerprint.replace(/\b[a-z]/g, letter => letter.toUpperCase()),
            members,
        }));
}
