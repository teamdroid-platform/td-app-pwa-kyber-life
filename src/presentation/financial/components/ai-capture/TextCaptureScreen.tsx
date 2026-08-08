"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CAPTURE_TEXT } from "@/lib/validators/ai-capture-schemas";
import { CaptureShell } from "./CaptureShell";

/** Written as a user would say them, so tapping one also teaches the format. */
const EXAMPLES = [
    "Almuerzo 12,50 pagado con débito",
    "Sueldo de agosto",
    "Transferí 200 al ahorro",
    "Netflix 15,99 con la tarjeta de crédito",
];

const MIN_LENGTH = 3;

interface TextCaptureScreenProps {
    onSubmit: (text: string) => void;
    onBack: () => void;
}

/**
 * One sentence in, a pre-filled summary out. The examples exist because the
 * hardest part of a free-text field is knowing how much to write.
 */
export function TextCaptureScreen({ onSubmit, onBack }: TextCaptureScreenProps) {
    const [text, setText] = useState("");
    const trimmed = text.trim();
    const canSubmit = trimmed.length >= MIN_LENGTH;

    return (
        <CaptureShell
            title="Escribir"
            subtitle="Una frase basta"
            onBack={onBack}
            footer={
                <Button
                    type="button"
                    onClick={() => onSubmit(trimmed)}
                    disabled={!canSubmit}
                    className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                >
                    Interpretar
                </Button>
            }
        >
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold leading-tight tracking-tight text-text-primary">
                        ¿Qué movimiento fue?
                    </h3>
                    <p className="text-xs text-text-tertiary">
                        Escríbelo como se lo contarías a alguien. Menciona el monto, dónde fue y cómo lo pagaste.
                    </p>
                </div>

                <Textarea
                    id="capture-text"
                    name="capture-text"
                    rows={5}
                    autoFocus
                    maxLength={MAX_CAPTURE_TEXT}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Registra un gasto por servicios de IA a Anthropic pagado con tarjeta de crédito el 6 de agosto"
                    className="min-h-[120px] resize-none rounded-2xl text-sm leading-relaxed"
                    autoComplete="off"
                />
                <div className="-mt-2 text-right text-[11px] text-text-tertiary">
                    {text.length}/{MAX_CAPTURE_TEXT}
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-text-tertiary">Ejemplos</p>
                    <div className="flex flex-wrap gap-2">
                        {EXAMPLES.map((example) => (
                            <button
                                key={example}
                                type="button"
                                onClick={() => setText(example)}
                                className="rounded-full border border-border/40 bg-bg-secondary/60 px-3 py-1.5 text-[11px] text-text-secondary transition-colors hover:border-border hover:text-text-primary"
                            >
                                {example}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </CaptureShell>
    );
}
