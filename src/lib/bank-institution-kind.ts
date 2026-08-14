import type { BankInstitutionKind } from "@/domain/entities/bank";

/**
 * Nombres que sí son de un emisor y no de un comercio cualquiera.
 *
 * Es el portero de la creación automática: un escaneo de FARMASHOP no debe
 * fundar una institución bancaria llamada FARMASHOP.
 */
export const ISSUER_NAME = /banco|coop|coac|cooperativa|mutualista|billetera|pacificard/i;

/** Si el nombre da pie a que nazca una institución bancaria. */
export function looksLikeIssuer(name: string): boolean {
    return ISSUER_NAME.test(name.trim());
}

/**
 * El tipo de emisor que el nombre declara, o `OTHER` si no lo declara.
 *
 * Solo se infiere cuando la palabra es inequívoca. `PACIFICARD` es un producto
 * y `MUTUALISTA` no encaja limpio en ninguna categoría, así que ambos quedan
 * genéricos para que el usuario los clasifique — antes esto ponía BANK a todo.
 */
export function inferInstitutionKind(name: string): BankInstitutionKind {
    if (/coop|coac|cooperativa/i.test(name)) return "COOPERATIVE";
    if (/billetera|wallet/i.test(name)) return "WALLET";
    if (/banco/i.test(name)) return "BANK";
    return "OTHER";
}

/** Etiquetas en español, en el orden en que se ofrecen al usuario. */
export const INSTITUTION_KINDS: { value: BankInstitutionKind; label: string }[] = [
    { value: "BANK", label: "Banco" },
    { value: "COOPERATIVE", label: "Cooperativa" },
    { value: "WALLET", label: "Billetera digital" },
    { value: "OTHER", label: "Otro" },
];

export function institutionKindLabel(kind: BankInstitutionKind): string {
    return INSTITUTION_KINDS.find(k => k.value === kind)?.label ?? "Otro";
}
