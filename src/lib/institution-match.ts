/**
 * Fuzzy matching of a scanned merchant string against existing institution names.
 *
 * Comparison is case-insensitive and ignores accents/special characters. Instead
 * of requiring an exact match, it scores similarity with the Sørensen–Dice
 * coefficient over character bigrams and only accepts matches above a threshold,
 * so a loose coincidence never silently replaces the merchant with the wrong
 * institution.
 */

/** Strip diacritics + non-alphanumerics and lowercase, for matching only. */
export function normalizeForMatch(str?: string | null): string {
    if (!str) return "";
    try {
        return str
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toLowerCase();
    } catch {
        return str.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
    }
}

/** Lo mínimo que necesita {@link pickInstitutionByName} de una institución. */
export interface NameableInstitution {
    name: string;
    createdAt: string;
    isDeleted: boolean;
}

/**
 * El emisor que ya existe con ese nombre, o `null`.
 *
 * Es el criterio único con el que la app decide «este banco ya lo tengo», y
 * vive aquí —fuera de SQL— para que los dos repositorios no puedan discrepar:
 * el escaneo comparaba con un `ilike` exacto mientras el formulario comparaba
 * con {@link normalizeForMatch}, así que «COOP JARDIN AZUAYO» fundaba un emisor
 * al lado de «Coop Jardín Azuayo».
 *
 * Tres reglas que no son cosméticas:
 *
 * 1. **Mira también los archivados.** Buscar solo entre los vivos hacía que
 *    borrar un duplicado fuera justo lo que lo traía de vuelta: el siguiente
 *    escaneo no lo encontraba y fundaba otro. Peor que cosmético — el emisor
 *    nuevo estrena id, y la regla de balance del usuario cuelga del id, así que
 *    un banco que él había excluido volvía a contar en su balance.
 * 2. **Varios homónimos devuelven el más antiguo, nunca `null`.** La consulta
 *    usaba `.maybeSingle()`, que da error con dos filas, y el llamador leía ese
 *    error como «no existe»: una vez duplicado, cada escaneo añadía uno más.
 * 3. **Emparejamiento exacto normalizado, no difuso.** Unir dos nombres
 *    distintos del mismo banco es de la pantalla de fusión, que lo pregunta;
 *    hacerlo en un escaneo automático uniría bancos distintos sin confirmación.
 */
export function pickInstitutionByName<T extends NameableInstitution>(
    institutions: readonly T[],
    name: string,
): T | null {
    const target = normalizeForMatch(name);
    if (!target) return null;

    const matches = institutions.filter(i => normalizeForMatch(i.name) === target);
    if (matches.length === 0) return null;

    // Un emisor vivo gana al archivado; entre iguales, el más antiguo, para que
    // la elección no dependa del orden en que la base devuelva las filas.
    return [...matches].sort((a, b) =>
        Number(a.isDeleted) - Number(b.isDeleted) ||
        a.createdAt.localeCompare(b.createdAt),
    )[0];
}

function bigrams(s: string): string[] {
    const grams: string[] = [];
    for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
    return grams;
}

/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
function diceCoefficient(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const ga = bigrams(a);
    const gb = bigrams(b);
    const counts = new Map<string, number>();
    for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
    let intersection = 0;
    for (const g of gb) {
        const c = counts.get(g) ?? 0;
        if (c > 0) {
            intersection++;
            counts.set(g, c - 1);
        }
    }
    return (2 * intersection) / (ga.length + gb.length);
}

/** Normalized similarity in [0, 1] between two raw strings. */
export function institutionSimilarity(a?: string | null, b?: string | null): number {
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    // Substring containment (both reasonably long) is a strong partial signal,
    // e.g. "bancopichincha" ⊃ "pichincha".
    if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) {
        return Math.max(diceCoefficient(na, nb), 0.9);
    }
    return diceCoefficient(na, nb);
}

/** Minimum similarity required to auto-resolve a merchant to an institution. */
export const INSTITUTION_MATCH_THRESHOLD = 0.7;

/** A confident, "verified"-grade identification. */
export const INSTITUTION_MATCH_VERIFIED_THRESHOLD = 0.85;

/** Below this, there is effectively no usable coincidence. */
export const INSTITUTION_MATCH_WARNING_THRESHOLD = 0.5;

/**
 * Best-matching institution for a merchant (highest similarity > 0), regardless
 * of any threshold. Returns null only when there is no candidate at all.
 */
export function bestInstitutionMatch(
    merchant: string | null | undefined,
    institutionNames: string[],
): { name: string; score: number } | null {
    if (!merchant) return null;
    let best: { name: string; score: number } | null = null;
    for (const name of institutionNames) {
        const score = institutionSimilarity(merchant, name);
        if (score > 0 && (!best || score > best.score)) {
            best = { name, score };
        }
    }
    return best;
}

/**
 * Best-matching institution name for a merchant, or null if none clears the
 * threshold. Returns the original institution name (not the normalized form).
 */
export function matchInstitutionName(
    merchant: string | null | undefined,
    institutionNames: string[],
    threshold: number = INSTITUTION_MATCH_THRESHOLD,
): string | null {
    const best = bestInstitutionMatch(merchant, institutionNames);
    return best && best.score >= threshold ? best.name : null;
}

export type InstitutionMatchLevel = "verified" | "warning" | "none";

export interface InstitutionMatchInfo {
    /** "verified" (high confidence), "warning" (partial), "none" (not identified). */
    level: InstitutionMatchLevel;
    /** Best similarity found, 0..1. */
    score: number;
    /** Best candidate institution name, or null when nothing was found. */
    matchedName: string | null;
}

/**
 * Classify how confidently a scanned merchant maps to an existing institution,
 * for the verification badge:
 *   - score >= 0.85 → "verified"
 *   - 0.5 <= score < 0.85 → "warning"
 *   - score < 0.5 (or no candidate) → "none"
 */
export function getInstitutionMatchInfo(
    merchant: string | null | undefined,
    institutionNames: string[],
): InstitutionMatchInfo {
    const best = bestInstitutionMatch(merchant, institutionNames);
    const score = best?.score ?? 0;

    if (!best || score < INSTITUTION_MATCH_WARNING_THRESHOLD) {
        // Not identified — don't surface a name we won't act on.
        return { level: "none", score, matchedName: null };
    }
    if (score >= INSTITUTION_MATCH_VERIFIED_THRESHOLD) {
        return { level: "verified", score, matchedName: best.name };
    }
    return { level: "warning", score, matchedName: best.name };
}
