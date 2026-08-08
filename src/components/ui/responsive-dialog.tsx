"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

/**
 * App-standard modal shell. A single, centered dialog on EVERY breakpoint
 * (no bottom-sheet variant) so data-entry modals look and behave identically
 * everywhere. The content is a flex column with a capped dynamic height
 * (`max-h-[85dvh]`): the body is the only scroll region and the footer stays
 * pinned. Combined with the global `interactive-widget=resizes-content` viewport,
 * the modal re-centers and shrinks above the soft keyboard, keeping the primary
 * action visible without distorting focus.
 */
export function ResponsiveDialog({ children, ...props }: React.ComponentProps<typeof Dialog>) {
    return <Dialog {...props}>{children}</Dialog>;
}

export function ResponsiveDialogTrigger(props: React.ComponentProps<typeof DialogTrigger>) {
    return <DialogTrigger {...props} />;
}

export function ResponsiveDialogContent({ children, className, ...props }: React.ComponentProps<typeof DialogContent>) {
    return (
        <DialogContent
            className={cn(
                "flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
                className,
            )}
            {...props}
        >
            {children}
        </DialogContent>
    );
}

export function ResponsiveDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <DialogHeader className={cn("shrink-0 px-6 pt-6 pb-3", className)} {...props} />;
}

export function ResponsiveDialogTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
    return <DialogTitle className={cn("text-lg", className)} {...props} />;
}

export function ResponsiveDialogDescription({ className, ...props }: React.ComponentProps<typeof DialogDescription>) {
    return <DialogDescription className={className} {...props} />;
}

/**
 * The single scrollable region between the sticky header and footer.
 */
export function ResponsiveDialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1", className)}
            {...props}
        />
    );
}

export function ResponsiveDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <DialogFooter
            className={cn("shrink-0 flex-col gap-2 border-t border-border/60 px-6 pt-4 pb-6 sm:flex-col sm:justify-center", className)}
            {...props}
        />
    );
}
