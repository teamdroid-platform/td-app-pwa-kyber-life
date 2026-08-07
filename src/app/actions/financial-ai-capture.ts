"use server";

import { z } from "zod";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import {
    ACCEPTED_AUDIO_TYPES,
    aiExtractionSchema,
    extractFromTextSchema,
    MAX_AUDIO_BYTES,
    type AiExtraction,
} from "@/lib/validators/ai-capture-schemas";

/**
 * Extraction runs a model on the other end, so the ceiling is generous — but it
 * is a ceiling: without one a hung workflow would hold the capture screen open
 * until the user gave up. Audio gets more room because it transcribes first.
 */
const TEXT_TIMEOUT_MS = 30_000;
const AUDIO_TIMEOUT_MS = 60_000;

export type ExtractionResult =
    | { success: true; data: AiExtraction }
    | { success: false; error: string };

function formatZodError(error: z.ZodError): string {
    return error.issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ");
}

/**
 * One place to turn a transport failure into something a user can act on.
 *
 * The distinction that matters here is "the service is not reachable" (their
 * n8n is down or the tunnel is closed — retrying now won't help) versus "it
 * answered badly", because only the first one has an obvious next step.
 */
function describeFailure(error: unknown): string {
    if (error instanceof DOMException && error.name === "TimeoutError") {
        return "La interpretación tardó demasiado. Intenta de nuevo o llena el formulario a mano.";
    }
    const cause = (error as { cause?: { code?: string } } | null)?.cause?.code;
    if (cause === "ECONNREFUSED" || cause === "ENOTFOUND" || (error as Error)?.message === "fetch failed") {
        return "No se pudo conectar con el servicio de interpretación. Verifica que esté en línea.";
    }
    return (error as Error)?.message || "No se pudo interpretar el movimiento.";
}

/** Read the webhook URL for one mode, failing loudly rather than calling undefined. */
function requireWebhookUrl(variable: "N8N_EXTRACT_TEXT_WEBHOOK_URL" | "N8N_EXTRACT_AUDIO_WEBHOOK_URL"): string {
    const url = process.env[variable];
    if (!url) {
        console.error(`Missing ${variable} environment variable.`);
        throw new Error("Configuración de sistema incompleta. Contacte soporte.");
    }
    return url;
}

/** Shared tail of both calls: check the status, parse, validate the shape. */
async function readExtraction(response: Response): Promise<ExtractionResult> {
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const truncated = detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
        console.error(`AI extraction webhook failed: ${response.status} ${response.statusText}. ${truncated}`);
        return { success: false, error: `El servicio de interpretación respondió con un error (${response.status}).` };
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        return { success: false, error: "El servicio de interpretación devolvió una respuesta ilegible." };
    }

    const parsed = aiExtractionSchema.safeParse(payload);
    if (!parsed.success) {
        console.error("AI extraction payload rejected:", formatZodError(parsed.error));
        return { success: false, error: "No se entendió la respuesta del servicio de interpretación." };
    }

    return { success: true, data: parsed.data };
}

/**
 * Turn a written sentence into the fields of a transaction.
 *
 * Nothing is written here: the answer only pre-fills the wizard, which still
 * requires an explicit confirmation before anything reaches the database.
 */
export async function extractTransactionFromTextAction(input: { text: string }): Promise<ExtractionResult> {
    try {
        const { text } = extractFromTextSchema.parse(input);
        // The extractor scopes its catalog lookups to one user, and that user is
        // whoever holds the session — never a value the browser chose to send.
        const userId = await requireUserId();
        const url = requireWebhookUrl("N8N_EXTRACT_TEXT_WEBHOOK_URL");

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, userId }),
            signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
        });

        return await readExtraction(response);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: formatZodError(error) };
        }
        console.error("Error in extractTransactionFromTextAction:", error);
        return { success: false, error: describeFailure(error) };
    }
}

/**
 * Same contract, from a recording. The audio is forwarded straight through —
 * the app never stores it, so a capture the user abandons leaves nothing behind.
 */
export async function extractTransactionFromAudioAction(formData: FormData): Promise<ExtractionResult> {
    try {
        const audio = formData.get("audio");
        if (!(audio instanceof File) || audio.size === 0) {
            return { success: false, error: "No se recibió ninguna grabación." };
        }
        if (audio.size > MAX_AUDIO_BYTES) {
            return { success: false, error: "La grabación es demasiado larga. Graba un audio más corto." };
        }
        // Browsers append codec parameters ("audio/webm;codecs=opus"); compare the base type.
        const baseType = audio.type.split(";")[0].trim().toLowerCase();
        if (baseType && !(ACCEPTED_AUDIO_TYPES as readonly string[]).includes(baseType)) {
            return { success: false, error: `Formato de audio no soportado (${baseType}).` };
        }

        const userId = await requireUserId();
        const url = requireWebhookUrl("N8N_EXTRACT_AUDIO_WEBHOOK_URL");

        const outgoing = new FormData();
        outgoing.append("userId", userId);
        outgoing.append("audio", audio, audio.name || "captura.webm");

        const response = await fetch(url, {
            method: "POST",
            body: outgoing,
            signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS),
        });

        return await readExtraction(response);
    } catch (error) {
        console.error("Error in extractTransactionFromAudioAction:", error);
        return { success: false, error: describeFailure(error) };
    }
}
