"use client";

import { Mic, PenLine } from "lucide-react";
import type { EntityStatus, PendingCreation } from "../../lib/ai-extraction";
import type { CaptureMethod } from "./CaptureMethodChooser";

/**
 * Marks only the values that are about to create a record.
 *
 * Reusing something you already have is the expected outcome, so it needs no
 * badge — confirming a normal row would just add noise to every summary. The
 * exception is what the badge exists for: this one will add a record to your
 * catalogs.
 */
export function EntityStatusBadge({ status }: { status: EntityStatus }) {
    if (status !== "new") return null;

    return (
        <span
            className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em] text-blue-400"
            title="Se creará al confirmar"
        >
            Nueva
        </span>
    );
}

/**
 * The promise the badges make, spelled out once before the user commits.
 *
 * Confirming writes more than a transaction: it can add an institution, a
 * category and an account to catalogs the user will see everywhere afterwards.
 * That is worth saying in words, not only in a badge colour.
 */
export function PendingCreationsNotice({ pending }: { pending: PendingCreation[] }) {
    if (pending.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-blue-500/45 bg-blue-500/[0.07] p-3">
            <p className="text-xs font-semibold text-blue-400">
                Si no lo cambias, al confirmar se crearán
            </p>
            <ul className="flex flex-col gap-1 pl-1">
                {pending.map(({ label, name }) => (
                    <li key={`${label}-${name}`} className="text-xs text-text-secondary">
                        <span className="text-text-tertiary">{label}</span>{" "}
                        <span className="font-medium text-text-primary">{name}</span>
                    </li>
                ))}
            </ul>
            <p className="text-[11px] text-text-tertiary">
                Toca la fila correspondiente para elegir uno que ya tengas.
            </p>
        </div>
    );
}

interface CaptureSourceNoteProps {
    method: CaptureMethod;
    /** The sentence that was typed. Absent for a recording, which has no transcript here. */
    text?: string;
}

/**
 * What the extraction was built from, kept consultable at the point of
 * decision — the same reason the scan flow keeps the original email around.
 */
export function CaptureSourceNote({ method, text }: CaptureSourceNoteProps) {
    const isVoice = method === "voice";
    const Icon = isVoice ? Mic : PenLine;

    return (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border/40 bg-bg-secondary/40 p-3">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
                <Icon className="h-3 w-3" />
                {isVoice ? "De tu grabación" : "Lo que escribiste"}
            </p>
            <p className="text-xs italic leading-relaxed text-text-secondary">
                {text?.trim() || "Los datos se interpretaron a partir de lo que dictaste."}
            </p>
        </div>
    );
}
