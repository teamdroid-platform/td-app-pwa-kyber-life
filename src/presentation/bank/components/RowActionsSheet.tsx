"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FormSheet } from "@/components/ui/form-sheet";
import { cn } from "@/lib/utils";

export interface RowAction {
    label: string;
    hint?: string;
    icon: React.ReactNode;
    /** Navega en vez de ejecutar; excluyente con `onSelect`. */
    href?: string;
    onSelect?: () => void;
    tone?: "default" | "danger";
}

interface RowActionsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: React.ReactNode;
    description?: React.ReactNode;
    actions: RowAction[];
}

/**
 * Las acciones de una fila, en una hoja.
 *
 * El lápiz vivía suelto a la derecha de cada tarjeta: era el único elemento
 * fuera del marco, así que ninguna fila medía igual, y solo cabía una acción.
 * Aquí caben las que hagan falta, cada una con su nombre escrito.
 */
export function RowActionsSheet({
    open, onOpenChange, title, description, actions,
}: RowActionsSheetProps) {
    return (
        <FormSheet
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            description={description}
            bodyClassName="py-1"
        >
            <div className="flex flex-col">
                {actions.map(action => {
                    const danger = action.tone === "danger";
                    const content = (
                        <>
                            <span className={cn(
                                "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                                danger ? "bg-rose-500/12 text-rose-500" : "bg-muted text-muted-foreground",
                            )}>
                                {action.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={cn(
                                    "block truncate text-sm font-medium",
                                    danger && "text-rose-500",
                                )}>
                                    {action.label}
                                </span>
                                {action.hint && (
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                        {action.hint}
                                    </span>
                                )}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </>
                    );

                    const className = "flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-muted/50";

                    return action.href ? (
                        <Link key={action.label} href={action.href} className={className}>
                            {content}
                        </Link>
                    ) : (
                        <button
                            key={action.label}
                            type="button"
                            onClick={action.onSelect}
                            className={className}
                        >
                            {content}
                        </button>
                    );
                })}
            </div>
        </FormSheet>
    );
}

/** El disparador: tres puntos al final de una fila o de una cabecera. */
export function KebabButton({
    label, onClick, className,
}: { label: string; onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={event => {
                // La fila entera es un enlace: sin esto, abrir el menú navegaría.
                event.preventDefault();
                event.stopPropagation();
                onClick();
            }}
            className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                className,
            )}
        >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
            </svg>
        </button>
    );
}
