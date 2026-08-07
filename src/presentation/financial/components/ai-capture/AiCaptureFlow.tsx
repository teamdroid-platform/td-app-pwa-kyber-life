"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
    extractTransactionFromAudioAction,
    extractTransactionFromTextAction,
    type ExtractionResult,
} from "@/app/actions/financial-ai-capture";
import type { AiExtraction } from "@/lib/validators/ai-capture-schemas";
import type { AudioRecording } from "../../hooks/useAudioRecorder";
import { TransactionAiWizard } from "../transaction-wizard/TransactionAiWizard";
import { TransactionCreateWizard } from "../transaction-wizard/TransactionCreateWizard";
import { CaptureMethodChooser, type CaptureMethod } from "./CaptureMethodChooser";
import { ExtractingScreen } from "./ExtractingScreen";
import { TextCaptureScreen } from "./TextCaptureScreen";
import { VoiceCaptureScreen } from "./VoiceCaptureScreen";
import { isRecordingSupported } from "../../hooks/useAudioRecorder";

function parseMethod(raw: string | null): CaptureMethod | null {
    return raw === "voice" || raw === "text" || raw === "form" ? raw : null;
}

/**
 * Entry point for a new transaction: pick how to capture it, capture it, and
 * hand the result to the wizard.
 *
 * The chosen method lives in the URL rather than in state so the phone's back
 * gesture returns to the chooser instead of leaving the flow — the one place
 * where a capture in progress could otherwise be lost without warning.
 */
export function AiCaptureFlow() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const method = parseMethod(searchParams.get("mode"));

    const [extracting, setExtracting] = useState(false);
    const [extraction, setExtraction] = useState<AiExtraction | null>(null);
    const [sourceText, setSourceText] = useState<string>("");

    // Recording is only offered where the browser can actually do it, and that
    // can only be known on the client — hence after mount, not during render.
    const [voiceAvailable, setVoiceAvailable] = useState(false);
    useEffect(() => {
        setVoiceAvailable(isRecordingSupported());
    }, []);

    /** Set when the user walks away mid-extraction, so a late answer is ignored. */
    const abandonedRef = useRef(false);

    const goToMethod = useCallback((next: CaptureMethod) => {
        abandonedRef.current = false;
        setExtraction(null);
        setSourceText("");
        router.push(`${pathname}?mode=${next}`);
    }, [pathname, router]);

    /** Back to the chooser, replacing rather than stacking another history entry. */
    const backToChooser = useCallback(() => {
        abandonedRef.current = true;
        setExtracting(false);
        setExtraction(null);
        setSourceText("");
        router.replace(pathname);
    }, [pathname, router]);

    /** Shared around both actions: they differ only in what they send. */
    const runExtraction = useCallback(async (call: () => Promise<ExtractionResult>) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            toast.error("Necesitas conexión para interpretar. Llena el formulario y se guardará localmente.", {
                id: "ai-capture-offline",
            });
            return;
        }

        abandonedRef.current = false;
        setExtracting(true);
        try {
            const result = await call();
            if (abandonedRef.current) return;

            if (!result.success) {
                toast.error(result.error, { id: "ai-capture-extract-error" });
                return;
            }
            setExtraction(result.data);
        } catch {
            if (!abandonedRef.current) {
                toast.error("No se pudo interpretar el movimiento. Intenta de nuevo.", {
                    id: "ai-capture-extract-unexpected",
                });
            }
        } finally {
            if (!abandonedRef.current) setExtracting(false);
        }
    }, []);

    const handleText = useCallback((text: string) => {
        setSourceText(text);
        void runExtraction(() => extractTransactionFromTextAction({ text }));
    }, [runExtraction]);

    const handleAudio = useCallback((recording: AudioRecording) => {
        setSourceText("");
        void runExtraction(() => {
            const formData = new FormData();
            formData.append("audio", recording.file, recording.file.name);
            return extractTransactionFromAudioAction(formData);
        });
    }, [runExtraction]);

    /** Give up on the extraction and fall back to filling the form by hand. */
    const giveUp = useCallback(() => {
        abandonedRef.current = true;
        setExtracting(false);
        router.replace(`${pathname}?mode=form`);
    }, [pathname, router]);

    if (method === "form") return <TransactionCreateWizard />;

    if (!method) {
        return (
            <CaptureMethodChooser
                voiceAvailable={voiceAvailable}
                onSelect={goToMethod}
                onCancel={() => router.push("/financial/transactions")}
            />
        );
    }

    if (extraction) {
        return (
            <TransactionAiWizard
                extraction={extraction}
                method={method}
                sourceText={method === "text" ? sourceText : undefined}
                onDiscard={() => goToMethod(method)}
            />
        );
    }

    if (extracting) return <ExtractingScreen method={method} onGiveUp={giveUp} />;

    return method === "voice" ? (
        <VoiceCaptureScreen onSubmit={handleAudio} onBack={backToChooser} />
    ) : (
        <TextCaptureScreen onSubmit={handleText} onBack={backToChooser} />
    );
}
