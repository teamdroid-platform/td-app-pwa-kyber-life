"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
    ResponsiveDialogBody,
    ResponsiveDialogDescription,
    ResponsiveDialogFooter,
    ResponsiveDialogHeader,
    ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

interface CaptureShellProps {
    title: string;
    subtitle?: string;
    /** Rendered as a back arrow beside the title. Omitted on the first screen. */
    onBack?: () => void;
    children: ReactNode;
    /** Omitted where the content itself is the action, as on the method chooser. */
    footer?: ReactNode;
}

/**
 * Chrome shared by every screen inside the capture dialog.
 *
 * The title always goes through `ResponsiveDialogTitle`: Radix requires one for
 * the dialog to be announced, and routing it through here means no screen can
 * forget it. The body is the only scroll region, so a long screen never pushes
 * the primary action out of reach.
 */
export function CaptureShell({ title, subtitle, onBack, children, footer }: CaptureShellProps) {
    return (
        <>
            <ResponsiveDialogHeader>
                <div className="flex items-center gap-2.5">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label="Volver"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border/40 bg-bg-secondary/60 text-text-secondary transition-colors hover:text-text-primary"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    )}
                    <div className="min-w-0 flex-1 text-left">
                        <ResponsiveDialogTitle className="truncate text-base">{title}</ResponsiveDialogTitle>
                        {subtitle && (
                            <ResponsiveDialogDescription className="truncate text-xs">
                                {subtitle}
                            </ResponsiveDialogDescription>
                        )}
                    </div>
                </div>
            </ResponsiveDialogHeader>

            <ResponsiveDialogBody className="flex flex-col gap-4 py-3">{children}</ResponsiveDialogBody>

            {footer && <ResponsiveDialogFooter>{footer}</ResponsiveDialogFooter>}
        </>
    );
}
