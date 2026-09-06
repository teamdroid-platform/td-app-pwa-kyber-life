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
import { AlertTriangle } from "lucide-react";
import { accountLabel } from "@/lib/bank-identity-label";
import { payCardAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";
import type { BankAccountWithBalance, BankCardWithDebt } from "@/application/services/bank-service";

/**
 * `YYYY-MM-DD` de hoy en la zona del usuario. `toISOString` daría la fecha
 * UTC, que en Ecuador adelanta un día a partir de las 19:00.
 */
function today(): string {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
}

/**
 * El valor del selector cuando el usuario no declara la cuenta.
 *
 * Radix no admite `SelectItem` con valor vacío, así que el «no lo sé» viaja
 * como una cadena propia y se traduce a null justo antes de enviar.
 */
const SIN_ORIGEN = "__sin_origen__";

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
    // El origen no se presupone: cada pago dice de qué cuenta salió, o declara
    // que no se sabe. Adivinar la cuenta más probable ahorraba un toque a costa
    // de firmar por el usuario de dónde salió su dinero.
    const [accountId, setAccountId] = useState<string>(SIN_ORIGEN);
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
            setAccountId(SIN_ORIGEN);
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
            sourceAccountId: accountId === SIN_ORIGEN ? null : accountId,
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
                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Desde</span>
                            <Select value={accountId} onValueChange={setAccountId}>
                                <SelectTrigger
                                    aria-label="Cuenta de origen"
                                    className="h-auto py-2 [&>span]:block [&>span]:min-w-0 [&>span]:text-left"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={SIN_ORIGEN}>
                                        <TwoLine
                                            title="Sin definir"
                                            subtitle="De dónde salió, sin registrar"
                                        />
                                    </SelectItem>
                                    {accounts.map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            <TwoLine
                                                title={accountLabel(a)}
                                                subtitle={a.institutionName ?? "Sin banco"}
                                            />
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        {accountId === SIN_ORIGEN && (
                            <p
                                data-testid="sin-origen-aviso"
                                className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200"
                            >
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                    La deuda bajará, pero ninguna cuenta reflejará la salida.
                                </span>
                            </p>
                        )}

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

/**
 * Una opción del selector en dos líneas: qué cuenta arriba, de qué banco
 * debajo. El banco es lo que distingue entre dos cuentas del mismo tipo, y sin
 * él dos «Ahorros» del mismo largo son indistinguibles.
 */
function TwoLine({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{title}</span>
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
    );
}
