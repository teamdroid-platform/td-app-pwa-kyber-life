"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { payCardAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";
import { toDateInputValue } from "@/lib/date-range";
import type { BankCardWithDebt } from "@/application/services/bank-service";

/**
 * `YYYY-MM-DD` de hoy en la zona del usuario. `toISOString` daría la fecha
 * UTC, que en Ecuador adelanta un día a partir de las 19:00.
 *
 * Delega en el helper compartido: esta misma cuenta se hacía a mano en tres
 * pantallas y dos de ellas la tenían mal, con el corte de saldo fechado en el
 * futuro como consecuencia.
 */
function today(): string {
    return toDateInputValue(new Date());
}

interface PayCardSheetProps {
    card: BankCardWithDebt;
}

/**
 * Registrar un pago a la tarjeta.
 *
 * El monto llega precargado con la deuda entera: «marcar como pagada» es este
 * mismo sheet sin tocar el campo, no una contabilidad aparte. Editarlo permite
 * el pago parcial.
 *
 * No pregunta desde qué cuenta: el pago no es una transacción. La salida de
 * dinero el usuario ya la tiene registrada —la trae el escaneo del banco o la
 * anota él—, y aquí solo se dice que la deuda está pagada.
 */
export function PayCardSheet({ card }: PayCardSheetProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [amount, setAmount] = useState(String(card.debt));
    const [date, setDate] = useState(today());

    function handleOpenChange(next: boolean) {
        if (next) {
            // El sheet no se desmonta al cerrarse -Radix solo le oculta el
            // contenido-, así que sin este reseteo el formulario arrastraría
            // el importe de antes de un pago parcial ya reflejado en
            // `card.debt`, o algo que el usuario haya escrito y no enviado.
            setAmount(String(card.debt));
            setDate(today());
        }
        setOpen(next);
    }

    async function submit() {
        if (saving) return; // evita el doble envío de un doble toque rápido
        const parsed = Number(amount.replace(",", "."));
        if (Number.isNaN(parsed) || parsed <= 0) {
            toast.error("Escribe cuánto pagaste");
            return;
        }
        setSaving(true);
        const result = await payCardAction({
            cardId: card.id,
            amount: parsed,
            date: new Date(`${date}T12:00:00`).toISOString(),
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success(`Pago de ${money(parsed)} registrado`);
        setOpen(false);
        router.refresh();
    }

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetTrigger asChild>
                <Button size="sm" variant="secondary" className="shrink-0">Pagar</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="flex flex-col gap-4 rounded-t-3xl p-5">
                <SheetHeader className="p-0">
                    <SheetTitle>Pagar {money(card.debt)}</SheetTitle>
                </SheetHeader>

                <>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Baja la deuda de la tarjeta. No crea una transacción ni mueve el
                            saldo de tus cuentas.
                        </p>

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Monto</span>
                            <Input
                                inputMode="decimal"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                aria-label="Monto del pago"
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Fecha</span>
                            <Input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                aria-label="Fecha del pago"
                            />
                        </label>

                        <Button onClick={submit} disabled={saving} className="w-full">
                            {saving ? "Registrando…" : "Registrar pago"}
                        </Button>
                </>
            </SheetContent>
        </Sheet>
    );
}
