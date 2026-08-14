import type { NumberFingerprint } from "./bank-number-fingerprint";

/** Lo que se sabe del número de una identidad, sumando sus observaciones. */
export type IdentityFingerprint = Pick<
    NumberFingerprint,
    "prefixDigits" | "suffixDigits" | "bin" | "brand" | "totalLength" | "accountTypeHint" | "institutionHint"
> & {
    /**
     * Campos donde dos observaciones fusionadas se contradijeron entre sí
     * (`"bin"`, `"brand"`). El valor de ese campo sigue rigiéndose por la
     * regla de primero-gana; esto es lo único que evita que la contradicción
     * quede invisible — una fusión con conflictos sigue siendo determinista,
     * pero deja de afirmar algo que no sabe con certeza.
     */
    conflicts: string[];
};

export interface IdentityCandidate {
    id: string;
    kind: "ACCOUNT" | "CARD";
    fingerprint: IdentityFingerprint;
}

export type Resolution = "EXACT" | "INFERRED" | "PENDING";

export interface ResolutionResult {
    resolution: Resolution;
    /** La identidad elegida, o null si no hubo una sola. */
    targetId: string | null;
    targetKind: "ACCOUNT" | "CARD" | null;
    /** Todo lo compatible, para que la conciliación muestre las opciones. */
    candidateIds: string[];
}

/** Sufijo de 4 o más: suficiente para afirmar sin pedir confirmación. */
const STRONG_SUFFIX = 4;

/** El más corto es sufijo del más largo, y ninguno está vacío. */
function suffixContained(a: string, b: string): boolean {
    if (!a || !b) return false;
    return a.length <= b.length ? b.endsWith(a) : a.endsWith(b);
}

/** Uno vacío, o uno es prefijo del otro. */
function prefixCompatible(a: string, b: string): boolean {
    if (!a || !b) return true;
    return a.length <= b.length ? b.startsWith(a) : a.startsWith(b);
}

/** Uno ausente no contradice a ninguno; con los dos presentes, deben coincidir. */
function noConflict(a: string | null, b: string | null): boolean {
    if (a === null || b === null) return true;
    return a.toLowerCase() === b.toLowerCase();
}

/** Suma lo que cada observación aporta sobre el mismo número. */
export function mergeFingerprints(
    fingerprints: readonly NumberFingerprint[],
): IdentityFingerprint {
    const longest = (a: string, b: string) => (b.length > a.length ? b : a);

    return fingerprints.reduce<IdentityFingerprint>((acc, f) => {
        // El valor sigue la regla de primero-gana, pero que dos observaciones
        // se contradigan en bin o brand no puede quedar en silencio: es la
        // señal de que el ligado que las agrupó bajo esta identidad está mal.
        const conflicts = [...acc.conflicts];
        if (!noConflict(acc.bin, f.bin) && !conflicts.includes("bin")) conflicts.push("bin");
        if (!noConflict(acc.brand, f.brand) && !conflicts.includes("brand")) conflicts.push("brand");

        return {
            prefixDigits: longest(acc.prefixDigits, f.prefixDigits),
            suffixDigits: longest(acc.suffixDigits, f.suffixDigits),
            bin: acc.bin ?? f.bin,
            brand: acc.brand ?? f.brand,
            // El largo de la máscara no es fiable (la misma cuenta aparece como
            // *****9558 y ******9558), así que se conserva solo como pista.
            totalLength: Math.max(acc.totalLength, f.totalLength),
            accountTypeHint: acc.accountTypeHint ?? f.accountTypeHint,
            institutionHint: acc.institutionHint ?? f.institutionHint,
            conflicts,
        };
    }, {
        prefixDigits: "", suffixDigits: "", bin: null, brand: null,
        totalLength: 0, accountTypeHint: null, institutionHint: null,
        conflicts: [],
    });
}

/**
 * Dos huellas pueden ser el mismo número si ninguna parte conocida se
 * contradice. El largo queda fuera a propósito: contar caracteres de máscara
 * no es fiable, así que solo sirve para desempatar, nunca para rechazar.
 */
export function areCompatible(
    a: NumberFingerprint | IdentityFingerprint,
    b: NumberFingerprint | IdentityFingerprint,
): boolean {
    return suffixContained(a.suffixDigits, b.suffixDigits)
        && prefixCompatible(a.prefixDigits, b.prefixDigits)
        && noConflict(a.bin, b.bin)
        && noConflict(a.brand, b.brand);
}

/**
 * A qué identidad pertenece una huella.
 *
 * Con sufijo de 4 o más y un solo candidato la afirmación es firme (`EXACT`).
 * Con menos, el candidato único sigue siendo la única lectura posible pero se
 * marca `INFERRED` para que la conciliación lo muestre con su evidencia.
 * Varios candidatos, o ninguno, quedan `PENDING` y no tocan ningún saldo.
 */
export function resolveFingerprint(
    fingerprint: NumberFingerprint,
    candidates: readonly IdentityCandidate[],
): ResolutionResult {
    const compatible = candidates.filter(c => areCompatible(fingerprint, c.fingerprint));

    if (compatible.length !== 1) {
        return {
            resolution: "PENDING",
            targetId: null,
            targetKind: null,
            candidateIds: compatible.map(c => c.id),
        };
    }

    const [only] = compatible;
    return {
        resolution: fingerprint.suffixDigits.length >= STRONG_SUFFIX ? "EXACT" : "INFERRED",
        targetId: only.id,
        targetKind: only.kind,
        candidateIds: [only.id],
    };
}
