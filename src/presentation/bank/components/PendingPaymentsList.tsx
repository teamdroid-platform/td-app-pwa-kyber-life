"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cardLabel } from "@/lib/bank-identity-label";
import { confirmCardPaymentAction, dismissCardPaymentAction } from "@/app/actions/bank";
import { money, shortDate } from "../lib/format-money";
import type { PaymentGroup } from "@/domain/services/card-payment-detection";
import type { BankCard } from "@/domain/entities/bank";

interface PendingPaymentsListProps {
    groups: PaymentGroup[];
    cards: BankCard[];
}

/**
 * Los pagos que la app detectó y todavía no tocan ninguna deuda.
 *
 * Nada de lo que se ve aquí ha movido un saldo: la deuda solo baja cuando el
 * usuario confirma. Un grupo con más de un registro es el mismo pago capturado
 * dos veces, y se confirma una sola vez.
 */
export function PendingPaymentsList({ groups, cards }: PendingPaymentsListProps) {
    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-10 text-center">
                <Inbox className="h-8 w-8 opacity-20" />
                <p className="text-sm text-muted-foreground">No hay pagos por confirmar.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {groups.map(group => (
                <PendingPaymentCard key={group.primary.id} group={group} cards={cards} />
            ))}
        </div>
    );
}

function PendingPaymentCard({ group, cards }: { group: PaymentGroup; cards: BankCard[] }) {
    const router = useRouter();
    const [cardId, setCardId] = useState(group.cardId);
    const [busy, setBusy] = useState(false);
    const count = group.twins.length + 1;
    // Cinturón además del filtro de la raíz (`BankService.listPendingCardPayments`
    // ya descarta candidatas de tarjetas que no son de crédito): si de todas
    // formas llega un `cardId` que no está entre las opciones —o no hay
    // ninguna tarjeta de crédito registrada—, Confirmar no debe poder atar el
    // pago a algo que el usuario ni siquiera ve en el selector.
    const canConfirm = cards.some(card => card.id === cardId);

    async function confirm() {
        if (!canConfirm) return;
        setBusy(true);
        const result = await confirmCardPaymentAction({
            transactionId: group.primary.id, cardId,
        });
        setBusy(false);
        if (!result.success) return toast.error(result.error);
        toast.success(`Pago de ${money(group.amount)} atado a la tarjeta`);
        router.refresh();
    }

    async function dismiss() {
        setBusy(true);
        const result = await dismissCardPaymentAction({ transactionId: group.primary.id });
        setBusy(false);
        if (!result.success) return toast.error(result.error);
        toast.success("Descartado");
        router.refresh();
    }

    return (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums">{money(group.amount)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {shortDate(group.date)}
                    {count > 1 && ` · ${count} registros`}
                </span>
            </div>

            <p className="truncate text-sm text-muted-foreground">{group.primary.description}</p>
            <p className="text-xs text-muted-foreground">
                Número leído: <span className="font-mono">{group.readNumber}</span>
            </p>

            <Select value={cardId} onValueChange={setCardId} disabled={cards.length === 0}>
                <SelectTrigger aria-label="Tarjeta a la que se pagó">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {cards.map(card => (
                        <SelectItem key={card.id} value={card.id}>{cardLabel(card)}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {!canConfirm && (
                <p className="text-xs text-amber-500">
                    Hace falta registrar una tarjeta de crédito para poder atar este pago.
                </p>
            )}

            <div className="flex gap-2">
                <Button onClick={confirm} disabled={busy || !canConfirm} className="flex-1">
                    Confirmar
                </Button>
                <Button onClick={dismiss} disabled={busy} variant="outline" className="flex-1">
                    Descartar
                </Button>
            </div>
        </section>
    );
}
