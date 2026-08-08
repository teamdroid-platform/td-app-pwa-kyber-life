"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CaptureMethod } from "./CaptureMethodChooser";
import { CaptureShell } from "./CaptureShell";

/**
 * Roughly how the work is ordered on the other end. The timings are a paced
 * narration, not progress reporting — the webhook answers once, at the end — so
 * the last stage never completes on its own and never claims to.
 */
const STAGE_DELAYS_MS = [0, 2500, 6000];

function stagesFor(method: CaptureMethod): string[] {
    return [
        method === "voice" ? "Transcribiendo el audio" : "Leyendo la frase",
        "Identificando monto, fecha y tipo",
        "Buscando entre tus instituciones y categorías",
    ];
}

interface ExtractingScreenProps {
    method: CaptureMethod;
    /** Give up waiting and fall back to the manual form. */
    onGiveUp: () => void;
}

/**
 * The wait between "interpretar" and the summary.
 *
 * A model runs on the other side, so this can take a few seconds — long enough
 * that a bare spinner reads as a hang. Naming the stages makes the wait legible,
 * and the way out is always one tap away.
 */
export function ExtractingScreen({ method, onGiveUp }: ExtractingScreenProps) {
    const stages = stagesFor(method);
    const [reached, setReached] = useState(0);

    useEffect(() => {
        const timers = STAGE_DELAYS_MS.map((delay, index) =>
            setTimeout(() => setReached(index), delay),
        );
        return () => timers.forEach(clearTimeout);
    }, []);

    return (
        <CaptureShell
            title="Interpretando…"
            subtitle="Esto suele tardar unos segundos"
            footer={
                <Button type="button" variant="outline" onClick={onGiveUp} className="h-11 w-full rounded-2xl">
                    Cancelar y llenar el formulario
                </Button>
            }
        >
            <div className="flex flex-col justify-center gap-8 py-8">
                <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
                </div>

                <ul className="mx-auto flex w-full max-w-xs flex-col gap-3">
                    {stages.map((stage, index) => {
                        const done = index < reached;
                        const current = index === reached;
                        return (
                            <li
                                key={stage}
                                className={cn(
                                    "flex items-center gap-2.5 text-sm transition-colors",
                                    done || current ? "text-text-secondary" : "text-text-tertiary/60",
                                )}
                            >
                                <span
                                    className={cn(
                                        "grid h-5 w-5 shrink-0 place-items-center rounded-full",
                                        done && "bg-emerald-500/15 text-emerald-400",
                                        current && "bg-accent-primary/15 text-accent-primary",
                                        !done && !current && "bg-bg-tertiary/60 text-text-tertiary",
                                    )}
                                >
                                    {done ? (
                                        <Check className="h-3 w-3" />
                                    ) : current ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <span className="h-1 w-1 rounded-full bg-current" />
                                    )}
                                </span>
                                {stage}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </CaptureShell>
    );
}
