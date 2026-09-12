import type { FinancialScannerTransaction } from "@/domain/entities/financial";
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
    typeAcronym: "TCR" | "TDE" | "AHO" | "CTE" | "EFE" | "INV" | "CTA";
    ownershipAcronym: "MIA" | "TER";
}

export function resolveAccountBadgeInfo(
    role: "SOURCE" | "DESTINATION",
    accountNumber: string,
    tx: FinancialScannerTransaction
): AccountBadgeInfo {
    const formatted = formatMaskedNumber(accountNumber);
    const combinedContext = `${accountNumber} ${tx.merchant || ""} ${tx.description || ""} ${tx.summary || ""}`.toLowerCase();

    // Type detection (TCR, TDE, AHO, CTE, CTA)
    let typeAcronym: "TCR" | "TDE" | "AHO" | "CTE" | "EFE" | "INV" | "CTA" = "CTA";
    if (
        isTransactionPaidWithCredit(tx) ||
        combinedContext.includes("crédito") ||
        combinedContext.includes("credito") ||
        combinedContext.includes("mastercard") ||
        combinedContext.includes("visa") ||
        combinedContext.includes("diners") ||
        combinedContext.includes("amex") ||
        combinedContext.includes("tcr") ||
        combinedContext.includes("tc")
    ) {
        if (combinedContext.includes("débito") || combinedContext.includes("debito") || combinedContext.includes("tde") || combinedContext.includes("td")) {
            typeAcronym = "TDE";
        } else {
            typeAcronym = "TCR";
        }
    } else if (combinedContext.includes("débito") || combinedContext.includes("debito") || combinedContext.includes("tde") || combinedContext.includes("td")) {
        typeAcronym = "TDE";
    } else if (combinedContext.includes("ahorro") || combinedContext.includes("aho")) {
        typeAcronym = "AHO";
    } else if (combinedContext.includes("corriente") || combinedContext.includes("cte")) {
        typeAcronym = "CTE";
    } else if (combinedContext.includes("efectivo") || combinedContext.includes("efe")) {
        typeAcronym = "EFE";
    } else if (combinedContext.includes("inversi") || combinedContext.includes("inv")) {
        typeAcronym = "INV";
    }

    // Ownership detection:
    // If source, almost always the user's own account -> MIA
    // If destination, check if own transfer or third party -> TER
    let ownershipAcronym: "MIA" | "TER" = role === "SOURCE" ? "MIA" : "TER";
    if (role === "DESTINATION") {
        if (
            combinedContext.includes("entre mis cuentas") ||
            combinedContext.includes("propia") ||
            combinedContext.includes("mismo titular") ||
            combinedContext.includes("ahorro personal") ||
            combinedContext.includes("mía") ||
            combinedContext.includes("mia")
        ) {
            ownershipAcronym = "MIA";
        }
    }

    return {
        raw: accountNumber,
        formattedNumber: formatted,
        typeAcronym,
        ownershipAcronym,
    };
}
