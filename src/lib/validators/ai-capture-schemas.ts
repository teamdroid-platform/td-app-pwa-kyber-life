import { z } from "zod";

// ─── Client input ────────────────────────────────────────────

/** Long enough to hold a rambling sentence, short enough to stay one transaction. */
export const MAX_CAPTURE_TEXT = 1000;

export const extractFromTextSchema = z.object({
    text: z.string().trim().min(3, "Escribe al menos unas palabras").max(MAX_CAPTURE_TEXT),
});

export type ExtractFromTextInput = z.infer<typeof extractFromTextSchema>;

/** Recording cap enforced on both ends: the UI stops here, the action rejects past it. */
export const MAX_AUDIO_SECONDS = 60;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_AUDIO_TYPES = [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-m4a",
] as const;

// ─── Extractor response ──────────────────────────────────────

/**
 * Every field is optional and nullable on purpose: the extractor returns only
 * what it could infer from the sentence, and a missing institution must degrade
 * to an empty row in the summary — never to a failed capture.
 *
 * `.catch()` extends that tolerance one step further. A field the model filled
 * with something unusable (`"unknown"` where a UUID belongs, `"veinte"` where a
 * number belongs) collapses to null instead of rejecting the whole payload, so
 * one bad field costs one row rather than the entire extraction.
 */
const looseString = z.string().nullish().catch(null);
const looseUuid = z.string().uuid().nullish().catch(null);
const looseNumber = z.union([z.number(), z.string()]).nullish().catch(null);
const looseBoolean = z.union([z.boolean(), z.string()]).nullish().catch(null);
const looseTags = z.array(z.string()).nullish().catch(null);

/** The fields alone, without the unwrapping — exported for focused testing. */
export const extractionFieldsSchema = z.object({
    type: looseString,
    title: looseString,
    amount: looseNumber,
    currency: looseString,
    institution_id: looseUuid,
    institution_name: looseString,
    category_id: looseUuid,
    category_name: looseString,
    account_id: looseUuid,
    account_name: looseString,
    account_number: looseString,
    is_credit_card: looseBoolean,
    date: looseString,
    tags: looseTags,
    notes: looseString,
});

const EXTRACTION_KEYS = [
    "type", "title", "amount", "currency",
    "institution_id", "institution_name", "category_id", "category_name",
    "account_id", "account_name", "account_number",
    "is_credit_card", "date", "tags", "notes",
] as const;

const WRAPPER_KEYS = ["data", "json", "output", "result", "body"] as const;

/** True once we are looking at the extraction itself rather than a container. */
function looksLikeExtraction(value: Record<string, unknown>): boolean {
    return EXTRACTION_KEYS.some((key) => key in value);
}

/**
 * n8n webhooks answer in more than one shape depending on how the workflow's
 * "Respond to Webhook" node is configured: the bare object, the object wrapped
 * in the single-item array n8n passes between nodes, or nested under `data` /
 * `json` / `output` — often alongside a `success` flag. Unwrapping here keeps
 * that a deployment detail instead of a client-visible failure.
 *
 * The stop condition is what the object *contains*, not how many keys it has:
 * a container is anything without extraction fields, so `{ success, data }`
 * unwraps while a payload that merely happens to carry an extra key does not.
 */
export function unwrapExtractionPayload(raw: unknown): unknown {
    let current = raw;
    for (let depth = 0; depth < 5; depth++) {
        if (Array.isArray(current)) {
            current = current[0];
            continue;
        }
        if (current && typeof current === "object") {
            const obj = current as Record<string, unknown>;
            if (looksLikeExtraction(obj)) break;
            const wrapper = WRAPPER_KEYS.find((key) => key in obj);
            if (wrapper) {
                current = obj[wrapper];
                continue;
            }
        }
        break;
    }
    return current;
}

/**
 * Whether anything usable was actually inferred.
 *
 * A payload the schema accepts can still be empty — every field is optional, so
 * a wrapper we failed to unwrap parses cleanly into nothing. Without this check
 * that lands as a blank summary with no explanation, which is the worst of both
 * outcomes: it looks like the app lost the answer.
 */
export function isEmptyExtraction(extraction: AiExtraction): boolean {
    return !EXTRACTION_KEYS.some((key) => {
        const value = extraction[key];
        if (value === null || value === undefined || value === "") return false;
        if (Array.isArray(value)) return value.length > 0;
        return true;
    });
}

export const aiExtractionSchema = z.preprocess(unwrapExtractionPayload, extractionFieldsSchema);

/** The extractor's answer, validated but not yet translated to form values. */
export type AiExtraction = z.infer<typeof extractionFieldsSchema>;

/**
 * The failure some workflows report in the body while still answering 200.
 * Read before the extraction schema, which would parse it into nothing.
 */
export function readReportedFailure(raw: unknown): string | null {
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (!candidate || typeof candidate !== "object") return null;

    const obj = candidate as Record<string, unknown>;
    if (obj.success !== false && !obj.error) return null;

    const message = typeof obj.error === "string" ? obj.error
        : typeof obj.message === "string" ? obj.message
            : null;
    return message || "El servicio de interpretación no pudo procesar el movimiento.";
}
