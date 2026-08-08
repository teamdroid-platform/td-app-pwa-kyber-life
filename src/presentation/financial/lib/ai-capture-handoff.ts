import type { AiExtraction } from "@/lib/validators/ai-capture-schemas";

const KEY = "kyber:ai-capture-handoff";

/** How long a stashed extraction stays valid. Past this it is stale, not lost. */
const MAX_AGE_MS = 10 * 60 * 1000;

export interface CaptureHandoff {
    extraction: AiExtraction;
    method: "voice" | "text";
    /** The sentence the user typed, when there was one. */
    sourceText?: string;
}

interface StoredHandoff extends CaptureHandoff {
    at: number;
}

/**
 * Carries one extraction from the capture dialog to the full-screen summary.
 *
 * The dialog and the summary live on different routes, so the values have to
 * survive one navigation. `sessionStorage` does that without a provider above
 * both — and, unlike `localStorage`, it dies with the tab, so an extraction
 * never outlives the session that produced it.
 *
 * Written on the way out, read exactly once on the way in.
 */
export function stashCapture(handoff: CaptureHandoff): boolean {
    if (typeof window === "undefined") return false;
    try {
        const stored: StoredHandoff = { ...handoff, at: Date.now() };
        window.sessionStorage.setItem(KEY, JSON.stringify(stored));
        return true;
    } catch {
        // Private mode, or a full quota. The caller falls back to the form.
        return false;
    }
}

/**
 * Read the pending extraction and drop it in the same breath.
 *
 * Consuming on read is what keeps a reload from resurrecting a capture the user
 * already confirmed or abandoned.
 */
export function takeCapture(): CaptureHandoff | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(KEY);
        window.sessionStorage.removeItem(KEY);
        if (!raw) return null;

        const stored = JSON.parse(raw) as StoredHandoff;
        if (!stored?.extraction || typeof stored.at !== "number") return null;
        if (Date.now() - stored.at > MAX_AGE_MS) return null;

        return { extraction: stored.extraction, method: stored.method, sourceText: stored.sourceText };
    } catch {
        return null;
    }
}

export function clearCapture(): void {
    if (typeof window === "undefined") return;
    try {
        window.sessionStorage.removeItem(KEY);
    } catch {
        // Nothing to do: the value expires with the tab anyway.
    }
}
