"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
    ResponsiveDialog,
    ResponsiveDialogTrigger,
    ResponsiveDialogContent,
    ResponsiveDialogHeader,
    ResponsiveDialogTitle,
    ResponsiveDialogDescription,
    ResponsiveDialogBody,
    ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";

interface FormSheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Optional trigger element (wrapped in asChild). Omit for controlled usage. */
    trigger?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Element rendered at the right of the header (e.g. a step badge). */
    headerAccessory?: React.ReactNode;
    /**
     * Sticky footer actions. When provided, `children` is treated as the body and
     * this becomes the pinned footer. Omit it when the submit button must live
     * inside a `<form>` — then compose `FormSheetForm` + `FormSheetBody` +
     * `FormSheetFooter` as children instead.
     */
    footer?: React.ReactNode;
    /** className for the dialog/drawer content (e.g. max-width). */
    contentClassName?: string;
    /** className for the scrollable body (only used with the `footer` prop). */
    bodyClassName?: string;
    /**
     * Whether opening the sheet focuses its first field (Radix's default).
     *
     * Turn it off for sheets whose job is to pick from a list: their first
     * field is a search box, and on a phone focusing it raises the keyboard
     * over the very options the user came to see. Focus then goes to the sheet
     * itself, so keyboard and screen-reader users still land inside it.
     */
    autoFocusFirstField?: boolean;
    children: React.ReactNode;
}

/**
 * Atomic, responsive form container. Desktop → centered dialog; mobile →
 * full-screen sheet with a fixed header, a single scrollable body, and a sticky
 * footer that stays above the soft keyboard. Standardizes every data-entry modal
 * in the app so the keyboard never covers the primary action or distorts focus.
 */
export function FormSheet({
    open,
    onOpenChange,
    trigger,
    title,
    description,
    headerAccessory,
    footer,
    contentClassName,
    bodyClassName,
    autoFocusFirstField = true,
    children,
}: FormSheetProps) {
    return (
        <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
            {trigger && <ResponsiveDialogTrigger asChild>{trigger}</ResponsiveDialogTrigger>}
            <ResponsiveDialogContent
                className={cn("sm:max-w-[480px]", contentClassName)}
                onOpenAutoFocus={autoFocusFirstField ? undefined : (event) => {
                    event.preventDefault();
                    (event.currentTarget as HTMLElement | null)?.focus();
                }}
            >
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
                    {description && (
                        <ResponsiveDialogDescription className="mt-1">
                            {description}
                        </ResponsiveDialogDescription>
                    )}
                    {headerAccessory ? <div className="mt-2">{headerAccessory}</div> : null}
                </ResponsiveDialogHeader>

                {footer !== undefined ? (
                    <>
                        <ResponsiveDialogBody className={bodyClassName}>{children}</ResponsiveDialogBody>
                        <ResponsiveDialogFooter>{footer}</ResponsiveDialogFooter>
                    </>
                ) : (
                    children
                )}
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    );
}

/**
 * A `<form>` shaped as the sheet's flex column so its `FormSheetBody` grows
 * (single scroll region) and its `FormSheetFooter` stays pinned — while keeping
 * the submit button inside the form. Use when the footer contains a submit.
 */
export function FormSheetForm({ className, ...props }: React.ComponentProps<"form">) {
    return <form className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />;
}

export {
    ResponsiveDialogBody as FormSheetBody,
    ResponsiveDialogFooter as FormSheetFooter,
} from "@/components/ui/responsive-dialog";
