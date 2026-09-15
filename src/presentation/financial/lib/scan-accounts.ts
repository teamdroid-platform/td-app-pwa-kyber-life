import type { FinancialScannerTransaction } from "@/domain/entities/financial";
import type { ScannedAccountView } from "@/application/services/bank-service";
import { isTransactionPaidWithCredit } from "@/lib/financial-utils";

/**
 * Cómo se leen las cuentas de origen y destino que el escáner extrajo del
 * correo, y cómo se presentan.
 *
 * Estaba dentro de las 1129 líneas de `FinancialInbox`, que era el único sitio
 * que las pintaba. Salió aquí cuando el escritorio estrenó la tabla: son las
 * mismas dos cuentas, y el banco escribe el número de tantas formas que
 * resolverlo dos veces era garantizar que una de las vistas se quedara corta.
 */
export interface ScannedAccountDetails {
    source?: string | null;
    destination?: string | null;
}

/**
 * Extracts origin and destination account numbers from a scanner transaction.
 */
export function extractScannedAccounts(tx: FinancialScannerTransaction): ScannedAccountDetails {
    let source: string | null = null;
    let destination: string | null = null;

    // 1. Direct accounts array
    if (Array.isArray(tx.accounts) && tx.accounts.length > 0) {
        for (const entry of tx.accounts) {
            if (!entry || !entry.account) continue;
            const t = (entry.type || "").toLowerCase().trim();
            if (t.startsWith("orig") || t.startsWith("sourc") || t.includes("salid") || t.includes("desde")) {
                if (!source) source = entry.account;
            } else if (t.startsWith("dest") || t.startsWith("targ") || t.includes("entrad") || t.includes("hacia") || t.includes("para")) {
                if (!destination) destination = entry.account;
            } else {
                if (!source) source = entry.account;
                else if (!destination) destination = entry.account;
            }
        }
    }

    // 2. Fallback to originStats if missing
    if (!source || !destination) {
        const stats = tx.originStats as Record<string, unknown> | null | undefined;
        if (stats) {
            if (!source) {
                const s = stats.sourceAccount || stats.accountSource || stats.originAccount || stats.cuentaOrigen || stats.cuenta_origen;
                if (typeof s === "string" && s.trim() !== "") source = s.trim();
            }
            if (!destination) {
                const d = stats.destinationAccount || stats.accountDestination || stats.targetAccount || stats.cuentaDestino || stats.cuenta_destino;
                if (typeof d === "string" && d.trim() !== "") destination = d.trim();
            }
            if ((!source || !destination) && Array.isArray(stats.accounts)) {
                for (const entry of stats.accounts) {
                    if (!entry || typeof entry !== "object") continue;
                    const acc = (entry as { account?: string; type?: string }).account;
                    const typeStr = ((entry as { account?: string; type?: string }).type || "").toLowerCase();
                    if (!acc) continue;
                    if (typeStr.startsWith("orig") || typeStr.startsWith("sourc")) {
                        if (!source) source = acc;
                    } else if (typeStr.startsWith("dest") || typeStr.startsWith("targ")) {
                        if (!destination) destination = acc;
                    }
                }
            }
        }
    }

    return { source, destination };
}

function formatMaskedNumber(acc: string): string {
    const trimmed = acc.trim();
    const digitsMatch = trimmed.match(/\d{4}$/);
    if (digitsMatch) {
        return `**** ${digitsMatch[0]}`;
    }
    const lastDigits = trimmed.replace(/\D/g, "").slice(-4);
    if (lastDigits) {
        return `**** ${lastDigits}`;
    }
    return trimmed.length > 8 ? `**** ${trimmed.slice(-4)}` : trimmed;
}

export interface AccountBadgeInfo {
    raw: string;
    formattedNumber: string;
    /** TCR, TDE, AHO, CTE, EFE, INV — o CTA cuando no se sabe. */
    typeAcronym: string;
    ownershipAcronym: "MIA" | "TER";
}

/**
 * Si el texto nombra alguna de las palabras, completa.
 *
 * Contra la subcadena: «ltda» contiene «td» y «Cooperativa de Ahorro y Crédito»
 * contiene «crédito», y así dos cuentas de ahorros salían como tarjetas de
 * débito.
 */
function mentions(text: string, words: readonly string[]): boolean {
    return words.some(word => new RegExp(String.raw`(^|[^\p{L}\p{N}])${word}(?=$|[^\p{L}\p{N}])`, "u").test(text));
}

/**
 * «Ahorro y crédito» es el apellido de las cooperativas, no el tipo de la
 * cuenta: se quita antes de buscar tipos en el texto.
 */
const COOPERATIVE_NAME = /ahorros?\s+y\s+cr[eé]dito/gu;

/** El tipo que el texto del escaneo sugiere. Solo para números sin registrar. */
function inferTypeAcronym(accountNumber: string, tx: FinancialScannerTransaction): string {
    const text = `${accountNumber} ${tx.merchant || ""} ${tx.description || ""} ${tx.summary || ""}`
        .toLowerCase()
        .replace(COOPERATIVE_NAME, " ");

    const debit = mentions(text, ["débito", "debito", "tde", "td"]);
    if (debit) return "TDE";

    const credit = isTransactionPaidWithCredit(tx)
        || mentions(text, ["crédito", "credito", "mastercard", "visa", "diners", "amex", "tcr", "tc"]);
    if (credit) return "TCR";

    if (mentions(text, ["ahorros?", "aho"])) return "AHO";
    if (mentions(text, ["corriente", "cte"])) return "CTE";
    if (mentions(text, ["efectivo", "efe"])) return "EFE";
    if (mentions(text, ["inversión", "inversion", "inv"])) return "INV";
    return "CTA";
}

/** De quién sugiere el texto que es la cuenta. Solo para números sin registrar. */
function inferOwnership(role: "SOURCE" | "DESTINATION", tx: FinancialScannerTransaction): "MIA" | "TER" {
    // El origen casi siempre es del usuario: solo se envía dinero desde lo propio.
    if (role === "SOURCE") return "MIA";

    const text = `${tx.merchant || ""} ${tx.description || ""} ${tx.summary || ""}`.toLowerCase();
    return mentions(text, ["entre mis cuentas", "propia", "mismo titular", "ahorro personal", "mía", "mia"])
        ? "MIA"
        : "TER";
}

/**
 * Qué es una cuenta del escaneo y de quién, para sus insignias.
 *
 * Primero la base: si el número corresponde a una cuenta o tarjeta que el
 * usuario ya tiene —`view.match`, resuelto contra sus identidades—, su tipo es
 * el registrado y la cuenta es suya. Solo cuando no hay registro se infiere
 * del texto, que es una suposición y se equivoca: el nombre del banco, el
 * resumen del escáner y el número comparten un mismo texto.
 */
export function resolveAccountBadgeInfo(
    role: "SOURCE" | "DESTINATION",
    accountNumber: string,
    tx: FinancialScannerTransaction,
    view?: ScannedAccountView | null,
): AccountBadgeInfo {
    const formattedNumber = formatMaskedNumber(accountNumber);

    if (view?.match) {
        return {
            raw: accountNumber,
            formattedNumber,
            typeAcronym: view.match.typeAcronym,
            ownershipAcronym: "MIA",
        };
    }

    // Lo que el usuario ya dijo del número manda sobre lo que sugiera el texto.
    const declared = view?.ownership ? (view.ownership === "MINE" ? "MIA" : "TER") : null;

    return {
        raw: accountNumber,
        formattedNumber,
        typeAcronym: inferTypeAcronym(accountNumber, tx),
        ownershipAcronym: declared ?? inferOwnership(role, tx),
    };
}
