"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ListChecks, Mic, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

export type CaptureMethod = "voice" | "text" | "form";

interface MethodOption {
    id: CaptureMethod;
    title: string;
    description: string;
    Icon: LucideIcon;
    /** Assisted methods are highlighted; the manual form stays the quiet default. */
    assisted: boolean;
}

const METHODS: MethodOption[] = [
    {
        id: "voice",
        title: "Dictar",
        description: "«Gasté 20 dólares en el súper con la tarjeta»",
        Icon: Mic,
        assisted: true,
    },
    {
        id: "text",
        title: "Escribir una frase",
        description: "Describe el movimiento en tus palabras",
        Icon: PenLine,
        assisted: true,
    },
    {
        id: "form",
        title: "Llenar el formulario",
        description: "Los cinco pasos de siempre, campo por campo",
        Icon: ListChecks,
        assisted: false,
    },
];

interface CaptureMethodChooserProps {
    onSelect: (method: CaptureMethod) => void;
    onCancel: () => void;
    /** Voice is hidden where the browser cannot record, rather than shown broken. */
    voiceAvailable: boolean;
}

/**
 * First screen of a new transaction: how the user wants to start it.
 *
 * All three paths converge on the same summary and the same write, so the
 * choice is only about effort — which is why the two assisted options lead and
 * the form stays available without apology.
 */
export function CaptureMethodChooser({ onSelect, onCancel, voiceAvailable }: CaptureMethodChooserProps) {
    const available = METHODS.filter((method) => method.id !== "voice" || voiceAvailable);

    return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
            <header className="flex items-center gap-2.5">
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Volver a transacciones"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/40 bg-bg-secondary/60 text-text-secondary transition-colors hover:text-text-primary"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-text-primary">Nueva transacción</h2>
                    <p className="truncate text-xs text-text-tertiary">¿Cómo quieres registrarla?</p>
                </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 pt-6">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold leading-tight tracking-tight text-text-primary">
                        Cuéntamelo como quieras
                    </h3>
                    <p className="text-xs text-text-tertiary">
                        Cualquiera de las opciones termina en el mismo resumen antes de guardar.
                    </p>
                </div>

                <div className="flex flex-col gap-2.5">
                    {available.map(({ id, title, description, Icon, assisted }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onSelect(id)}
                            className={cn(
                                "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                                assisted
                                    ? "border-accent-primary/40 bg-gradient-to-br from-accent-primary/15 to-accent-primary/5 hover:border-accent-primary/70"
                                    : "border-border/40 bg-bg-secondary/50 hover:border-border",
                            )}
                        >
                            <span
                                className={cn(
                                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                                    assisted ? "bg-accent-primary/20 text-accent-primary" : "bg-bg-tertiary/70 text-text-secondary",
                                )}
                            >
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                                    {title}
                                    {assisted && (
                                        <span className="rounded-full bg-accent-primary/20 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-accent-primary">
                                            Nuevo
                                        </span>
                                    )}
                                </span>
                                <span className="block text-xs leading-snug text-text-tertiary">{description}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
