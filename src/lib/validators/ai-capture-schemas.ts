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

const extractionFieldsSchema = z.object({
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

/**
 * n8n webhooks answer in more than one shape depending on how the workflow's
 * "Respond to Webhook" node is configured: the bare object, the object wrapped
 * in the single-item array n8n passes between nodes, or nested under `data` /
 * `json` / `output`. Unwrapping here keeps that a deployment detail instead of
 * a client-visible failure.
 */
function unwrapExtractionPayload(raw: unknown): unknown {
    let current = raw;
    for (let depth = 0; depth < 4; depth++) {
        if (Array.isArray(current)) {
            current = current[0];
            continue;
        }
        if (current && typeof current === "object") {
            const obj = current as Record<string, unknown>;
            // Only unwrap when the wrapper key is the *only* thing there; an
            // object that already carries extraction fields is the payload.
            const keys = Object.keys(obj);
            const wrapper = ["data", "json", "output", "result"].find((k) => keys.length === 1 && k in obj);
            if (wrapper) {
                current = obj[wrapper];
                continue;
            }
        }
        break;
    }
    return current;
}

export const aiExtractionSchema = z.preprocess(unwrapExtractionPayload, extractionFieldsSchema);

/** The extractor's answer, validated but not yet translated to form values. */
export type AiExtraction = z.infer<typeof extractionFieldsSchema>;
