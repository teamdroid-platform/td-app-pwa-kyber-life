"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { registerBalanceSnapshotAction } from "@/app/actions/bank";
import { toDateInputValue } from "@/lib/date-range";
import type { UUID } from "@/domain/core";

interface BalanceSnapshotSheetProps {
    accountId: UUID;
    /** Opcional: quien lo abre desde un menú controla `open` y no monta disparador. */
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

/**
 * Fecha de hoy en el formato que espera `<input type="date">`, **en la zona
 * del usuario**.
 *
 * `toISOString()` da la fecha UTC, que en Ecuador es la de mañana a partir de
 * las 19:00. El corte se guardaba entonces con fecha futura y el saldo de la
 * cuenta lo ignoraba —solo cuenta el último corte hasta hoy—, así que la app
 * decía «saldo registrado» y la pantalla no se movía.
 */
function todayInput(): string {
    return toDateInputValue(new Date());
}

/**
 * Registra el saldo que declara el banco a una fecha. A partir de ese corte, el
 * saldo se recalcula sumando solo los movimientos posteriores — corregirlo no
 * exige reescribir historia.
 */
export function BalanceSnapshotSheet({
    accountId, trigger, open: controlledOpen, onOpenChange,
}: BalanceSnapshotSheetProps) {
    const router = useRouter();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = onOpenChange ?? setUncontrolledOpen;
    const [balance, setBalance] = useState("");
    const [asOf, setAsOf] = useState(todayInput);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        const parsed = Number(balance.replace(",", "."));
        if (!balance.trim() || Number.isNaN(parsed)) {
            toast.error("Escribe el saldo que dice tu banco");
            return;
        }

        setSaving(true);
        const result = await registerBalanceSnapshotAction({
            accountId,
            balance: parsed,
            asOf: new Date(`${asOf}T00:00:00`).toISOString(),
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success("Saldo registrado");
        setBalance("");
        setOpen(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title="Registrar saldo"
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                </Button>
            }
        >
            <p className="text-xs leading-relaxed text-muted-foreground">
                Escribe el saldo que muestra tu banco hoy. Desde esta fecha, la app
                solo suma los movimientos posteriores.
            </p>

            <Field label="Saldo" htmlFor="snapshot-balance">
                <Input
                    id="snapshot-balance"
                    inputMode="decimal"
                    value={balance}
                    onChange={e => setBalance(e.target.value)}
                    placeholder="2310.00"
                    autoFocus
                />
            </Field>

            <Field label="A la fecha" htmlFor="snapshot-date">
                {/* Sin `max` se puede elegir mañana, y un corte futuro no entra
                    al saldo hasta que llegue esa fecha. */}
                <Input
                    id="snapshot-date"
                    type="date"
                    max={todayInput()}
                    value={asOf}
                    onChange={e => setAsOf(e.target.value)}
                />
            </Field>
        </FormSheet>
    );
}
