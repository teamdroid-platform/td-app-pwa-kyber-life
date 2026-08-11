"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Receipt, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardScreen } from "../../hooks/useTransactionWizard";

interface WizardShellProps {
    title: string;
    subtitle?: string;
    screen: WizardScreen;
    /** Focus mode drops the multi-segment progress: there is no walk to measure. */
    focus: boolean;
    onBack: () => void;
    onClose?: () => void;
    /** Jump straight to the summary. Hidden on the summary itself and in focus mode. */
    onOpenSummary?: () => void;
    /** Edit mode's "Deshacer": only rendered when there is something to undo. */
    onReset?: () => void;
    /** Tapping an already-visited segment jumps back to that step. */
    onSelectStep?: (screen: WizardScreen) => void;
    children: ReactNode;
    footer: ReactNode;
}

/**
 * Chrome shared by every wizard screen: header, progress and a footer that
 * stays reachable above the keyboard.
 *
 * One component covers both layouts — full-screen on a phone, a centred card
 * from `sm` up — so the steps never need to know where they are mounted.
 */
export function WizardShell({
    title,
    subtitle,
    screen,
    focus,
    onBack,
    onClose,
    onOpenSummary,
    onReset,
    onSelectStep,
    children,
    footer,
}: WizardShellProps) {
    const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === screen);
    const isSummary = screen === "summary";
    const canGoBack = focus || isSummary || stepIndex > 0;

    return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
            <header className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                    {canGoBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label="Volver"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/40 bg-bg-secondary/60 text-text-secondary transition-colors hover:text-text-primary"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    )}

                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>
                        {subtitle && <p className="truncate text-xs text-text-tertiary">{subtitle}</p>}
                    </div>

                    {onReset && (
                        <button
                            type="button"
                            onClick={onReset}
                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Deshacer
                        </button>
                    )}

                    {onOpenSummary && !isSummary && !focus && (
                        <button
                            type="button"
                            onClick={onOpenSummary}
                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent-primary/35 bg-accent-primary/15 px-3 py-1.5 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/25"
                        >
                            <Receipt className="h-3.5 w-3.5" />
                            Resumen
                        </button>
                    )}

                    {onClose && isSummary && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/40 bg-bg-secondary/60 text-text-secondary transition-colors hover:text-text-primary"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {!focus && (
                    <div className="flex gap-1" role="group" aria-label="Progreso del formulario">
                        {WIZARD_STEPS.map((step, index) => {
                            const done = isSummary || index < stepIndex;
                            const current = !isSummary && index === stepIndex;
                            return (
                                <button
                                    key={step.id}
                                    type="button"
                                    // Only steps already reached are navigable.
                                    disabled={!done && !current}
                                    onClick={() => onSelectStep?.(step.id)}
                                    aria-label={`Paso ${index + 1}: ${step.label}`}
                                    aria-current={current ? "step" : undefined}
                                    className={cn(
                                        "h-1 flex-1 rounded-full transition-colors",
                                        current && "bg-accent-primary",
                                        done && !current && "bg-accent-primary/50",
                                        !done && !current && "bg-bg-tertiary",
                                    )}
                                />
                            );
                        })}
                    </div>
                )}
            </header>

            <div className="flex flex-1 flex-col gap-4 pb-4 pt-4">{children}</div>

            <div className="sticky bottom-3 z-10 -mx-1 flex flex-col gap-2 px-1">{footer}</div>
        </div>
    );
}

interface StepHeadingProps {
    question: string;
    hint?: string;
}

/** The one question a step asks, plus an optional line of context under it. */
export function StepHeading({ question, hint }: StepHeadingProps) {
    return (
        <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold leading-tight tracking-tight text-text-primary">{question}</h3>
            {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
        </div>
    );
}
