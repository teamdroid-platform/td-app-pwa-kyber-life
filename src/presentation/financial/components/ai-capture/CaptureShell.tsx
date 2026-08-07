"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface CaptureShellProps {
    title: string;
    subtitle?: string;
    onBack: () => void;
    children: ReactNode;
    footer: ReactNode;
}

/**
 * Chrome for the two capture screens, matching the wizard's header and sticky
 * footer so moving from "cuéntamelo" to "confírmalo" doesn't feel like leaving
 * the flow. Deliberately simpler than `WizardShell`: there are no steps to
 * measure here, only one question.
 */
export function CaptureShell({ title, subtitle, onBack, children, footer }: CaptureShellProps) {
    return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
            <header className="flex items-center gap-2.5">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Volver"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/40 bg-bg-secondary/60 text-text-secondary transition-colors hover:text-text-primary"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>
                    {subtitle && <p className="truncate text-xs text-text-tertiary">{subtitle}</p>}
                </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 pb-4 pt-4">{children}</div>

            <div className="sticky bottom-3 z-10 -mx-1 flex flex-col gap-2 px-1">
                <div className="flex flex-col gap-2 rounded-3xl border border-border/50 bg-bg-secondary/90 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-lg">
                    {footer}
                </div>
            </div>
        </div>
    );
}
