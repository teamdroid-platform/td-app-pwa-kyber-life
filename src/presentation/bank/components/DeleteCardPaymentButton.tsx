"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { deleteCardPaymentAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";

/**
 * Borrar un pago registrado desde Bancos.
 *
 * Vive en la tarjeta porque es el único sitio donde ese pago existe: no es una
 * transacción, así que en Transacciones no hay nada que borrar.
 */
export function DeleteCardPaymentButton({ paymentId, amount }: { paymentId: string; amount: number }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function confirm() {
        setDeleting(true);
        const result = await deleteCardPaymentAction({ paymentId });
        setDeleting(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        setOpen(false);
        toast.success("Pago borrado");
        router.refresh();
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Borrar pago"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
                <Trash2 className="h-4 w-4" />
            </button>
            <ConfirmationModal
                open={open}
                onOpenChange={setOpen}
                title={`¿Borrar el pago de ${money(amount)}?`}
                description="La deuda de la tarjeta vuelve a subir en ese monto."
                confirmText="Borrar"
                variant="destructive"
                onConfirm={confirm}
                isLoading={deleting}
            />
        </>
    );
}
