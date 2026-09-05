"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { accountLabel } from "@/lib/bank-identity-label";
import { payCardAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";
import type { BankAccountWithBalance, BankCardWithDebt } from "@/application/services/bank-service";

/** `YYYY-MM-DD` de hoy, para el input de fecha. */
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

interface PayCardSheetProps {
    card: BankCardWithDebt;
    accounts: BankAccountWithBalance[];
}

/**
 * Registrar un pago a la tarjeta.
 *
 * El monto llega precargado con la deuda entera: «marcar como pagada» es este
 * mismo sheet sin tocar el campo, no una contabilidad aparte. Editarlo permite
 * el pago parcial.
 */
export function PayCardSheet({ card, accounts }: PayCardSheetProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const preferred = accounts.find(a => a.accountType !== "CASH") ?? accounts[0];
    const [accountId, setAccountId] = useState(preferred?.id ?? "");
    const [amount, setAmount] = useState(String(card.debt));
    const [date, setDate] = useState(today());

    async function submit() {
        const parsed = Number(amount.replace(",", "."));
        if (Number.isNaN(parsed) || parsed <= 0) {
            toast.error("Escribe cuánto pagaste");
            return;
        }
        if (!accountId) {
            toast.error("Elige la cuenta de la que salió el dinero");
            return;
        }

        setSaving(true);
        const result = await payCardAction({
            cardId: card.id,
            sourceAccountId: accountId,
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
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button size="sm" variant="secondary" className="shrink-0">Pagar</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="flex flex-col gap-4 rounded-t-3xl p-5">
                <SheetHeader className="p-0">
                    <SheetTitle>Pagar {money(card.debt)}</SheetTitle>
                </SheetHeader>

                {accounts.length === 0 ? (
                    <p className="text-sm text-amber-500">
                        Registra una cuenta para poder pagar esta tarjeta.
                    </p>
                ) : (
                    <>
                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Desde</span>
                            <Select value={accountId} onValueChange={setAccountId}>
                                <SelectTrigger aria-label="Cuenta de origen">
                                    <SelectValue placeholder="Elige una cuenta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {accountLabel(a)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

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
                )}
            </SheetContent>
        </Sheet>
    );
}
