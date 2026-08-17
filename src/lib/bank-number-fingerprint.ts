export interface NumberFingerprint {
    /** La cadena tal cual llegó. Nunca se modifica. */
    raw: string;
    /** Dígitos antes de la primera máscara. Vacío si la máscara va delante. */
    prefixDigits: string;
    /** Dígitos después de la última máscara. */
    suffixDigits: string;
    /** Largo de la parte numérica y de máscara, sin letras ni separadores. */
    totalLength: number;
    /** Prefijo de 6 dígitos: identifica al emisor de una tarjeta. */
    bin: string | null;
    brand: string | null;
    /** SAVINGS | CHECKING, cuando el banco lo abrevió en la cadena. */
    accountTypeHint: string | null;
    /** Nombre de institución embebido en la cadena. */
    institutionHint: string | null;
    /** El número entero, sin ocultar nada. */
    isComplete: boolean;
}

/** Caracteres que los bancos usan para tapar dígitos. */
const MASK = /[X×x*•·●#]/;
const MASK_GLOBAL = /[X×x*•·●#]/g;

const BRANDS: readonly { pattern: RegExp; label: string }[] = [
    { pattern: /american\s*express|amex/i, label: "American Express" },
    { pattern: /mastercard/i, label: "Mastercard" },
    { pattern: /diners/i, label: "Diners Club" },
    { pattern: /visa/i, label: "Visa" },
];

/** Palabras que no son el nombre de una institución aunque lo parezcan. */
const NOT_INSTITUTION = /^(titular|tarjeta|cuenta|card|account|aho|cte|ahorros|corriente)$/i;

const TYPE_HINTS: readonly { pattern: RegExp; type: string }[] = [
    { pattern: /\bAHO\b|\bahorros?\b/i, type: "SAVINGS" },
    { pattern: /\bCTE\b|\bcorriente\b/i, type: "CHECKING" },
];

/** Por debajo de esto, una cadena sin máscara son los últimos dígitos, no el número. */
const COMPLETE_MIN_DIGITS = 8;

/**
 * Parsea una cadena cruda a su huella.
 *
 * La regla que gobierna todo: **nunca se inventan dígitos**. Prefijo y sufijo
 * van a campos separados justamente para que no se puedan pegar. `25XXX10`
 * es `prefix=25, suffix=10` y eso es todo lo que se afirma de él — no es la
 * cuenta 2510, que no existe.
 */
export function parseBankNumber(raw: string): NumberFingerprint {
    const brand = BRANDS.find(b => b.pattern.test(raw))?.label ?? null;
    const accountTypeHint = TYPE_HINTS.find(t => t.pattern.test(raw))?.type ?? null;
    const institutionHint = extractInstitutionHint(raw);

    // Deja solo dígitos y máscaras: las letras y separadores ya dieron lo suyo.
    const core = raw.replace(/[^0-9X×x*•·●#]/g, "");

    const maskIndex = core.search(MASK);
    const hasMask = maskIndex !== -1;

    if (!hasMask) {
        const digits = core;
        const isComplete = digits.length >= COMPLETE_MIN_DIGITS;
        return {
            raw,
            prefixDigits: isComplete ? digits.slice(0, 6) : "",
            suffixDigits: isComplete ? digits.slice(-4) : digits,
            totalLength: digits.length,
            bin: isComplete && looksLikeCard(digits) ? digits.slice(0, 6) : null,
            brand, accountTypeHint, institutionHint,
            isComplete,
        };
    }

    const prefixDigits = core.slice(0, maskIndex);
    const lastMask = lastIndexOfMask(core);
    const suffixDigits = core.slice(lastMask + 1);

    return {
        raw,
        prefixDigits,
        suffixDigits,
        totalLength: core.length,
        // Un prefijo de 6 dígitos es un BIN; uno de 2 es solo el inicio de una
        // cuenta que el banco decidió no tapar.
        bin: prefixDigits.length >= 6 ? prefixDigits.slice(0, 6) : null,
        brand, accountTypeHint, institutionHint,
        isComplete: false,
    };
}

function lastIndexOfMask(value: string): number {
    let last = -1;
    for (const match of value.matchAll(MASK_GLOBAL)) last = match.index;
    return last;
}

/** Un número completo de 15-16 dígitos que empieza por 3-5 es una tarjeta. */
function looksLikeCard(digits: string): boolean {
    return digits.length >= 15 && /^[3-5]/.test(digits);
}

/**
 * El nombre de institución que el banco metió en la cadena, si lo hizo.
 * Se queda con las palabras alfabéticas que no son la marca ni ruido.
 */
function extractInstitutionHint(raw: string): string | null {
    const words = raw.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]+/g);
    if (!words) return null;

    const kept = words.filter(word => {
        const clean = word.replace(/\./g, "");
        if (!clean) return false;
        // Las equis de la máscara son letras: sin esto, `AHO - XXXXXX0814`
        // reportaría "XXXXXX" como el nombre de la institución.
        if (/^[X×x]+$/.test(clean)) return false;
        if (NOT_INSTITUTION.test(clean)) return false;
        if (BRANDS.some(b => b.pattern.test(clean))) return false;
        // PACIFICARD y similares son nombres de producto, no de institución.
        if (/card$/i.test(clean)) return false;
        return true;
    });

    if (kept.length === 0) return null;

    const hint = kept.join(" ").trim();
    // Una sola palabra corta no identifica a nadie.
    return hint.length >= 4 ? hint : null;
}
