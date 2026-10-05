"use client";

import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
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
    /** Focus mode's X: discards the edit, same as the footer's "Cancelar". */
    onCancelFocus?: () => void;
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
    onCancelFocus,
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
    const { typing, onFocusCapture, onBlurCapture } = useTyping();

    return (
        <div
            className="mx-auto flex w-full max-w-lg flex-1 flex-col"
            data-wizard-focus={focus}
            onFocusCapture={onFocusCapture}
            onBlurCapture={onBlurCapture}
        >
            <header className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                    {canGoBack && !focus && (
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

                    {/* Editando un solo dato la salida es cerrar la edición,
                        no ir atrás: una X a la derecha, la única de la
                        pantalla, porque la cabecera de la página se oculta. */}
                    {focus && (
                        <button
                            type="button"
                            onClick={onCancelFocus ?? onBack}
                            aria-label="Cerrar edición"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/40 bg-bg-secondary/60 text-text-secondary transition-colors hover:text-text-primary"
                        >
                            <X className="h-4 w-4" />
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

            {/* Floating, the footer lands right where the keyboard pushes the
                field being typed in — over the search box and the filtered
                list. While typing it drops back into the flow, after the
                content, and floats again once the keyboard closes. */}
            <div
                data-testid="wizard-footer"
                data-floating={!typing}
                className={cn(
                    "z-10 -mx-1 flex flex-col gap-2 px-1",
                    !typing && "sticky bottom-3",
                )}
            >
                {footer}
            </div>
        </div>
    );
}

interface StepHeadingProps {
    question: string;
    hint?: string;
}

/** Inputs that open the soft keyboard; checkboxes, radios and buttons don't. */
const NON_TEXT_INPUTS = new Set([
    "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

function opensKeyboard(el: EventTarget | null): boolean {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
    return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Whether the user is typing in a field inside the wizard.
 *
 * Losing focus is resolved a beat later: tapping a footer button blurs the
 * field first, and un-floating the footer in that same instant would move the
 * button out from under the finger before the click lands.
 */
function useTyping() {
    const [typing, setTyping] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const onFocusCapture = (e: FocusEvent) => {
        if (!opensKeyboard(e.target)) return;
        if (timer.current) clearTimeout(timer.current);
        setTyping(true);
    };
    const onBlurCapture = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setTyping(opensKeyboard(document.activeElement)), 200);
    };

    return { typing, onFocusCapture, onBlurCapture };
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
