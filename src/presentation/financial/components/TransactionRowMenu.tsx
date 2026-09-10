"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, CheckCircle2, Loader2, MoreVertical, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    archiveTransactionAction,
    reviewTransactionAction,
    softDeleteTransactionAction,
} from "@/app/actions/financial-transactions";
import type { FinancialTransaction } from "@/domain/entities/financial";
import { cn } from "@/lib/utils";

interface TransactionRowMenuProps {
    transaction: FinancialTransaction;
    /** Se llama con el nuevo estado para que la lista se actualice sin recargar. */
    onStatusChange?: (status: FinancialTransaction["status"]) => void;
    onDeleted?: () => void;
    className?: string;
}

/**
 * Revisar, archivar y eliminar un movimiento.
 *
 * Vivía dentro de `TransactionCard`. Salió aquí cuando el escritorio estrenó la
 * tabla: son las mismas tres acciones sobre la misma fila, y duplicarlas era
 * garantizar que una de las dos vistas se quedara atrás en cuanto se añadiera
 * la cuarta.
 *
 * El clic no se propaga: tanto la tarjeta como la fila de la tabla llevan su
 * propio manejador para abrir el detalle, y abrir el menú no es abrir la
 * transacción.
 */
export function TransactionRowMenu({ transaction, onStatusChange, onDeleted, className }: TransactionRowMenuProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = async (
        actionFn: (id: string) => Promise<{ success: boolean; error?: string }>,
        successMessage: string,
        statusUpdate?: FinancialTransaction["status"],
        isDelete = false,
    ) => {
        setIsLoading(true);
        try {
            const res = await actionFn(transaction.id!);
            if (res.success) {
                toast.success(successMessage, { id: `tx-action-success-${transaction.id}` });
                if (statusUpdate && onStatusChange) onStatusChange(statusUpdate);
                if (isDelete && onDeleted) onDeleted();
            } else {
                toast.error(res.error || "Ocurrió un error", { id: `tx-action-error-${transaction.id}` });
            }
        } catch {
            toast.error("Error inesperado", { id: `tx-action-unexpected-${transaction.id}` });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={cn("flex items-center gap-1.5", className)} onClick={(e) => e.stopPropagation()}>
            {isLoading && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-primary" aria-hidden="true" />
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                        <MoreVertical className="h-5 w-5" />
                        <span className="sr-only">Opciones</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                    {transaction.status === "DETECTED" && (
                        <DropdownMenuItem
                            onClick={() => handleAction(reviewTransactionAction, "Transacción marcada como revisada", "REVIEWED")}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Revisar
                        </DropdownMenuItem>
                    )}
                    {transaction.status !== "ARCHIVED" && (
                        <DropdownMenuItem
                            onClick={() => handleAction(archiveTransactionAction, "Transacción archivada", "ARCHIVED")}
                        >
                            <Archive className="h-4 w-4 mr-2" />
                            Archivar
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        onClick={() => handleAction(softDeleteTransactionAction, "Transacción eliminada", "DELETED", true)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
