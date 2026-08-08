"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RobotLoader } from "@/components/ui/RobotLoader";
import { TransactionAiWizard } from "../transaction-wizard/TransactionAiWizard";
import { TransactionCreateWizard } from "../transaction-wizard/TransactionCreateWizard";
import { takeCapture, type CaptureHandoff } from "../../lib/ai-capture-handoff";

/** One value, so mounting settles the screen in a single render. */
interface ReviewState {
    ready: boolean;
    handoff: CaptureHandoff | null;
}

/**
 * The summary half of an assisted capture, opened full-screen after the dialog
 * hands over what it extracted.
 *
 * The extraction is read exactly once, on mount. When there is nothing to read
 * — a reload, a bookmarked URL, an extraction older than the handoff window —
 * this falls back to the manual form and says why, rather than showing an empty
 * summary or bouncing the user back to a screen they already left.
 */
export function AiCaptureReview() {
    const [state, setState] = useState<ReviewState>({ ready: false, handoff: null });

    /**
     * What the first read produced, so a second one cannot come up empty.
     *
     * `takeCapture` is destructive by design — it clears the value it returns —
     * and React runs mount effects twice in development's Strict Mode. Without
     * this, the second pass read `null` and dropped the user on the manual form
     * with the extraction already gone. Refs survive that double mount, so the
     * read happens once no matter how many times the effect does.
     */
    const consumedRef = useRef<CaptureHandoff | null | undefined>(undefined);

    // Consuming the handoff is the legitimate "read from an external system on
    // mount" case for an effect: it cannot happen during render because it also
    // clears the value, and it cannot happen on the server, where there is no
    // session storage. It runs once and settles.
    useEffect(() => {
        if (consumedRef.current === undefined) consumedRef.current = takeCapture();
        const handoff = consumedRef.current;

        if (!handoff) {
            toast.info("La captura ya no está disponible. Puedes llenar el formulario.", {
                id: "ai-capture-handoff-missing",
            });
        }
        setState({ ready: true, handoff });
    }, []);

    if (!state.ready) {
        return (
            <div className="flex min-h-[50vh] flex-1 items-center justify-center">
                <RobotLoader size={72} text="Preparando el resumen" />
            </div>
        );
    }

    if (!state.handoff) return <TransactionCreateWizard />;

    return (
        <TransactionAiWizard
            extraction={state.handoff.extraction}
            method={state.handoff.method}
            sourceText={state.handoff.sourceText}
            // Discarding drops the extraction entirely and leaves the user on
            // the manual form, with everything still fillable by hand.
            onDiscard={() => setState({ ready: true, handoff: null })}
        />
    );
}
