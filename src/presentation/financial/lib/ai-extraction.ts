import { isoToWallClockInput } from "@/lib/date-range";
import type { AiExtraction } from "@/lib/validators/ai-capture-schemas";
import type { WizardValues } from "../hooks/useTransactionWizard";
import { normalizeTransactionType } from "./transaction-type";

// ─── Field coercion ──────────────────────────────────────────

/**
 * A usable amount, or "" when there isn't one.
 *
 * Zero is treated as absent rather than as a value: the extractor returns 0 for
 * "I could not hear the number", and `createTransactionSchema` requires a
 * positive amount anyway — so keeping the 0 would produce a summary that looks
 * complete and a save that fails.
 */
export function toAmountValue(raw: number | string | null | undefined): string {
    if (raw === null || raw === undefined || raw === "") return "";
    // Accept both "1.234,56" and "1234.56": the model echoes whatever the user said.
    const parsed = typeof raw === "number"
        ? raw
        : Number(raw.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return String(parsed);
}

/** An ISO 4217 code, or USD — the only currency the manual form ever writes. */
export function toCurrency(raw: string | null | undefined, fallback = "USD"): string {
    const code = raw?.trim().toUpperCase();
    return code && /^[A-Z]{3}$/.test(code) ? code : fallback;
}

/** `true` only for an explicit affirmative; anything ambiguous stays false. */
function toBoolean(raw: boolean | string | null | undefined): boolean {
    if (typeof raw === "boolean") return raw;
    const normalized = raw?.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "si" || normalized === "sí";
}

function toText(raw: string | null | undefined): string {
    return raw?.trim() ?? "";
}

/** Same cap the transaction schema enforces, applied before the user sees them. */
const MAX_TAGS = 20;

function toTags(raw: string[] | null | undefined): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const tag of raw) {
        const clean = tag.trim().slice(0, 50);
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        tags.push(clean);
        if (tags.length === MAX_TAGS) break;
    }
    return tags;
}

// ─── Extraction → form values ────────────────────────────────

export interface ToWizardValuesOptions {
    /**
     * Wall-clock value used when the extractor gave no usable date. Passed in
     * rather than computed so this module stays pure and the caller keeps the
     * same "now" the manual form uses.
     */
    fallbackDate: string;
}

export interface MappedExtraction {
    values: WizardValues;
    /** Resolved separately: the wizard takes the currency as its own prop. */
    currency: string;
    /** True when the date shown is the fallback, not something that was said. */
    dateWasInferred: boolean;
}

/**
 * Translate the extractor's answer into the values the wizard edits.
 *
 * The single rule behind every branch: a field the model could not fill must
 * arrive empty, so the wizard's own "falta …" marking picks it up. Nothing here
 * invents a value to make the summary look complete.
 */
export function toWizardValues(extraction: AiExtraction, { fallbackDate }: ToWizardValuesOptions): MappedExtraction {
    const type = normalizeTransactionType(extraction.type);
    const date = isoToWallClockInput(extraction.date);

    const institutionName = toText(extraction.institution_name);
    const categoryName = toText(extraction.category_name);
    const accountName = toText(extraction.account_name);

    return {
        currency: toCurrency(extraction.currency),
        dateWasInferred: !date,
        values: {
            type,
            amount: toAmountValue(extraction.amount),
            description: toText(extraction.title),
            institutionName,
            categoryName,
            accountName,
            // An id without a name is unusable: the row would render blank while
            // silently pointing at a record. Keep them together or not at all.
            institutionId: institutionName ? extraction.institution_id ?? null : null,
            categoryId: categoryName ? extraction.category_id ?? null : null,
            accountId: accountName ? extraction.account_id ?? null : null,
            paidWithCredit: type === "EXPENSE" && toBoolean(extraction.is_credit_card),
            date: date ?? fallbackDate,
            notes: toText(extraction.notes),
            tags: toTags(extraction.tags),
        },
    };
}

// ─── What the values mean against the user's own catalogs ────

export type EntityStatus = "existing" | "new" | "empty";

/**
 * Whether confirming will reuse a record or create one.
 *
 * The comparison mirrors `FinancialTransactionService.createTransaction`
 * exactly — case-insensitive equality on the whole name — because this badge is
 * a promise about what that service is about to do. A looser match here (fuzzy,
 * accent-insensitive) would show "ya la tienes" and then create a duplicate.
 */
export function resolveEntityStatus(
    name: string,
    id: string | null | undefined,
    existingNames: string[],
): EntityStatus {
    if (!name.trim()) return "empty";
    if (id) return "existing";
    const target = name.toLowerCase();
    return existingNames.some((existing) => existing.toLowerCase() === target) ? "existing" : "new";
}

export interface PendingCreation {
    /** Row label, e.g. "Institución". */
    label: string;
    name: string;
}

export interface EntityStatuses {
    institution: EntityStatus;
    category: EntityStatus;
    account: EntityStatus;
}

/** The records the user is about to add to their catalogs, in summary order. */
export function collectPendingCreations(values: WizardValues, statuses: EntityStatuses): PendingCreation[] {
    const pending: PendingCreation[] = [];
    if (statuses.institution === "new") pending.push({ label: "Institución", name: values.institutionName });
    if (statuses.category === "new") pending.push({ label: "Categoría", name: values.categoryName });
    if (statuses.account === "new") pending.push({ label: "Cuenta", name: values.accountName });
    return pending;
}
