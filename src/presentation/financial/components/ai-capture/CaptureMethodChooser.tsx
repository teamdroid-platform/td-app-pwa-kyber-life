"use client";

import type { LucideIcon } from "lucide-react";
import { ListChecks, Mic, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { CaptureShell } from "./CaptureShell";

export type CaptureMethod = "voice" | "text" | "form";

interface MethodOption {
    id: CaptureMethod;
    title: string;
    description: string;
    Icon: LucideIcon;
    /** Card border + background. */
    surface: string;
    /** The icon tile, tinted to match the card. */
    glyph: string;
}

/**
 * Each method gets its own tint instead of a "new" tag.
 *
 * A tag ages badly — it is only true for a few weeks — and it made two of the
 * three options look like an announcement rather than a choice. Colour does the
 * same job of telling them apart, and stays correct.
 */
const METHODS: MethodOption[] = [
    {
        id: "voice",
        title: "Dictar",
        description: "«Gasté 20 dólares en el súper con la tarjeta»",
        Icon: Mic,
        surface: "border-indigo-500/30 bg-indigo-500/[0.07] hover:border-indigo-500/60",
        glyph: "bg-indigo-500/15 text-indigo-300",
    },
    {
        id: "text",
        title: "Escribir una frase",
        description: "Describe el movimiento en tus palabras",
        Icon: PenLine,
        surface: "border-teal-500/30 bg-teal-500/[0.07] hover:border-teal-500/60",
        glyph: "bg-teal-500/15 text-teal-300",
    },
    {
        id: "form",
        title: "Llenar el formulario",
        description: "Los cinco pasos de siempre, campo por campo",
        Icon: ListChecks,
        surface: "border-slate-500/30 bg-slate-500/[0.07] hover:border-slate-500/60",
        glyph: "bg-slate-500/15 text-slate-300",
    },
];

interface CaptureMethodChooserProps {
    onSelect: (method: CaptureMethod) => void;
    /** Voice is hidden where the browser cannot record, rather than shown broken. */
    voiceAvailable: boolean;
}

/**
 * First screen of a new transaction: how the user wants to start it.
 *
 * All three paths converge on the same summary and the same write, so the
 * choice is only about effort — which is why the two assisted options lead and
 * the form stays available without apology.
 *
 * No footer: the options are the action, and a row of buttons under them would
 * only add a second thing to decide.
 */
export function CaptureMethodChooser({ onSelect, voiceAvailable }: CaptureMethodChooserProps) {
    const available = METHODS.filter((method) => method.id !== "voice" || voiceAvailable);

    return (
        <CaptureShell title="Nueva transacción" subtitle="¿Cómo quieres registrarla?">
            <p className="text-xs text-text-tertiary">
                Cualquiera de las opciones termina en el mismo resumen antes de guardar.
            </p>

            <div className="flex flex-col gap-2.5 pb-2">
                {available.map(({ id, title, description, Icon, surface, glyph }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onSelect(id)}
                        className={cn(
                            "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                            surface,
                        )}
                    >
                        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", glyph)}>
                            <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-text-primary">{title}</span>
                            <span className="block text-xs leading-snug text-text-tertiary">{description}</span>
                        </span>
                    </button>
                ))}
            </div>
        </CaptureShell>
    );
}
