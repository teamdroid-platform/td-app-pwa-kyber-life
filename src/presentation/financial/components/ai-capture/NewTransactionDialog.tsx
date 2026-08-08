"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Slot } from "@radix-ui/react-slot";
import { toast } from "sonner";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { FINANCIAL_FLAGS } from "@/lib/feature-flags";
import {
    extractTransactionFromAudioAction,
    extractTransactionFromTextAction,
    type ExtractionResult,
} from "@/app/actions/financial-ai-capture";
import { isRecordingSupported, type AudioRecording } from "../../hooks/useAudioRecorder";
import { stashCapture } from "../../lib/ai-capture-handoff";
import { CaptureMethodChooser, type CaptureMethod } from "./CaptureMethodChooser";
import { ExtractingScreen } from "./ExtractingScreen";
import { TextCaptureScreen } from "./TextCaptureScreen";
import { VoiceCaptureScreen } from "./VoiceCaptureScreen";

const NEW_TRANSACTION_URL = "/financial/transactions/new";
const REVIEW_URL = `${NEW_TRANSACTION_URL}?mode=review`;

type DialogScreen = "chooser" | "voice" | "text";

/** Microphone support is fixed for the session, so there is nothing to watch. */
const subscribeToNothing = () => () => undefined;

export interface NewTransactionDialogProps {
    /**
     * The button that opens it, kept where it already lives so each entry point
     * keeps its own styling. Cloned via `Slot`, so it must be a single element
     * that accepts an `onClick`.
     */
    children: ReactNode;
}

/**
 * Starting a transaction, without leaving the screen you were on.
 *
 * Only the light half of the flow lives here — choosing a method and saying or
 * writing the movement. The moment there is something to review, the dialog
 * closes and the summary opens full-screen: seven editable rows, notes, tags
 * and the list of records about to be created need the room, and reviewing is
 * where the actual decision happens.
 *
 * With the feature flag off this is a plain link to the manual form, so the
 * entry points do not need to know which mode the app is in.
 */
export function NewTransactionDialog({ children }: NewTransactionDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [screen, setScreen] = useState<DialogScreen>("chooser");
    // Kept beside the screen rather than folded into it: while the extraction
    // runs, the progress copy still has to name what is being interpreted, and
    // a failure has to return to the screen it came from.
    const [extracting, setExtracting] = useState(false);

    // Recording is only offered where the browser can do it. Read through
    // `useSyncExternalStore` rather than an effect: the capability never
    // changes during a session, and the server snapshot (`false`) keeps the
    // first client render identical to the one React hydrates.
    const voiceAvailable = useSyncExternalStore(subscribeToNothing, isRecordingSupported, () => false);

    /** Every exit resets the dialog, so reopening never resumes a stale take. */
    const close = useCallback(() => {
        setOpen(false);
        setScreen("chooser");
        setExtracting(false);
    }, []);

    const handleOpenChange = useCallback((next: boolean) => {
        if (!next) {
            close();
            return;
        }
        setOpen(true);
    }, [close]);

    const goToManualForm = useCallback(() => {
        close();
        router.push(NEW_TRANSACTION_URL);
    }, [close, router]);

    const runExtraction = useCallback(async (
        call: () => Promise<ExtractionResult>,
        source: { method: "voice" | "text"; sourceText?: string },
    ) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            toast.error("Necesitas conexión para interpretar. Llena el formulario y se guardará localmente.", {
                id: "ai-capture-offline",
            });
            return;
        }

        setExtracting(true);
        let result: ExtractionResult;
        try {
            result = await call();
        } catch {
            toast.error("No se pudo interpretar el movimiento. Intenta de nuevo.", {
                id: "ai-capture-extract-unexpected",
            });
            setExtracting(false);
            return;
        }

        if (!result.success) {
            toast.error(result.error, { id: "ai-capture-extract-error" });
            // Back to the capture screen to retry: the failure was on the way
            // out, not in what was said.
            setExtracting(false);
            return;
        }

        if (!stashCapture({ extraction: result.data, method: source.method, sourceText: source.sourceText })) {
            toast.error("No se pudo abrir el resumen. Llena el formulario a mano.", { id: "ai-capture-handoff-failed" });
            goToManualForm();
            return;
        }

        // Navigate without closing first. Closing here uncovered the list for
        // the frames the navigation took, so the user saw their transactions
        // flash between "interpretando" and the summary. Leaving the dialog up
        // means the last thing on screen stays the progress it replaces; the
        // route change unmounts it along with the page underneath.
        router.push(REVIEW_URL);
    }, [goToManualForm, router]);

    const handleText = useCallback((text: string) => {
        void runExtraction(() => extractTransactionFromTextAction({ text }), { method: "text", sourceText: text });
    }, [runExtraction]);

    const handleAudio = useCallback((recording: AudioRecording) => {
        void runExtraction(() => {
            const formData = new FormData();
            formData.append("audio", recording.file, recording.file.name);
            return extractTransactionFromAudioAction(formData);
        }, { method: "voice" });
    }, [runExtraction]);

    const handleSelect = useCallback((method: CaptureMethod) => {
        if (method === "form") {
            goToManualForm();
            return;
        }
        // Warm the summary route while the user is still talking or typing, so
        // the hand-off after the extraction is a render rather than a fetch.
        router.prefetch(REVIEW_URL);
        setScreen(method);
    }, [goToManualForm, router]);

    if (!FINANCIAL_FLAGS.AI_CAPTURE_ENABLED) {
        return <Slot onClick={() => router.push(NEW_TRANSACTION_URL)}>{children}</Slot>;
    }

    const renderScreen = () => {
        if (extracting && screen !== "chooser") {
            return <ExtractingScreen method={screen} onGiveUp={goToManualForm} />;
        }
        switch (screen) {
            case "voice":
                return <VoiceCaptureScreen onSubmit={handleAudio} onBack={() => setScreen("chooser")} />;
            case "text":
                return <TextCaptureScreen onSubmit={handleText} onBack={() => setScreen("chooser")} />;
            default:
                return <CaptureMethodChooser onSelect={handleSelect} voiceAvailable={voiceAvailable} />;
        }
    };

    return (
        <>
            <Slot onClick={() => setOpen(true)}>{children}</Slot>
            <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
                <ResponsiveDialogContent>{renderScreen()}</ResponsiveDialogContent>
            </ResponsiveDialog>
        </>
    );
}
