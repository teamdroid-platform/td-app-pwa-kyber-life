/**
 * Si el beneficiario que nombra un escaneo es el propio usuario.
 *
 * Buscar el nombre del usuario en cualquier parte del texto no sirve: casi
 * todos los comprobantes lo nombran como **remitente** —«desde la cuenta de
 * Fernando Xavier Garnica Bautista a Marcos…»—, y así toda transferencia a un
 * tercero saldría como propia. Solo cuenta el nombre que sigue a una frase que
 * presenta al que recibe.
 *
 * Los bancos acortan el nombre del beneficiario —«Xavier Garnica»—, así que
 * no se exige el nombre completo: basta con que **todas** las palabras del
 * beneficiario estén en el del perfil, y que sean al menos dos. Una sola
 * palabra, o un apellido compartido con otra palabra ajena, no identifican a
 * nadie.
 *
 * @returns `true` si algún beneficiario es el usuario, `false` si se nombró a
 *   alguien y no es él, `null` si el texto no nombra a nadie —o no hay perfil—
 *   y por tanto no hay nada que decidir.
 */
export function beneficiaryIsOwner(text: string, ownerName: string | null | undefined): boolean | null {
    const owner = new Set(normalize(ownerName ?? "").split(/[^\p{L}]+/u).filter(w => w.length >= 2));
    if (owner.size === 0) return null;

    const names = beneficiaryNames(normalize(text));
    if (names.length === 0) return null;

    return names.some(name => name.every(word => owner.has(word)));
}

/** Las frases con las que un comprobante presenta a quien recibe el dinero. */
const MARKERS = [
    "a la cuenta de",
    "hacia la cuenta de",
    "a nombre de",
    "a favor de",
    "beneficiario cta. destino:",
    "beneficiario:",
    "transferencia a",
];

/**
 * Palabras que cortan un nombre, o que delatan que lo que sigue al marcador no
 * es una persona: «a la cuenta de ahorros», «transferencia a cuenta de Banco…».
 */
const STOPWORDS = new Set([
    "la", "el", "los", "las", "de", "del", "al", "y", "en", "con", "por", "para",
    "desde", "hacia", "su", "sus", "mi", "tu", "un", "una", "que", "fue",
    "cuenta", "cuentas", "ahorro", "ahorros", "corriente", "banco", "cooperativa", "coop",
]);

/** Un nombre tiene pocas palabras; más allá ya se está leyendo otra cosa. */
const MAX_NAME_WORDS = 5;

function normalize(value: string): string {
    return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function beneficiaryNames(text: string): string[][] {
    const names: string[][] = [];

    for (const marker of MARKERS) {
        for (let at = text.indexOf(marker); at >= 0; at = text.indexOf(marker, at + marker.length)) {
            // «hacia la cuenta de» contiene «a la cuenta de»: el marcador tiene
            // que empezar en una palabra, no en medio de otra.
            if (at > 0 && /\p{L}/u.test(text[at - 1])) continue;

            const name = nameAfter(text.slice(at + marker.length));
            if (name.length >= 2) names.push(name);
        }
    }

    return names;
}

function nameAfter(rest: string): string[] {
    const words: string[] = [];

    for (const piece of rest.trim().split(" ")) {
        const word = piece.match(/^\p{L}+/u)?.[0];
        // «Dispositivo:» es la etiqueta del campo siguiente, no parte del nombre.
        if (!word || STOPWORDS.has(word) || piece.endsWith(":")) break;

        words.push(word);
        // Una coma o un punto pegados cierran el nombre.
        if (word !== piece || words.length === MAX_NAME_WORDS) break;
    }

    return words;
}
