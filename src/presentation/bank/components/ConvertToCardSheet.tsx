"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedChoice } from "./SegmentedChoice";
import { convertAccountToCardAction } from "@/app/actions/bank";
import { accountLabel } from "@/lib/bank-identity-label";
import { formatIdentityNumber } from "@/lib/format-bank-number";
import type { BankAccount, BankCardType } from "@/domain/entities/bank";

const CARD_TYPES = [
    { value: "DEBIT" as const, label: "Débito" },
    { value: "CREDIT" as const, label: "Crédito" },
];

interface ConvertToCardSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** La cuenta que en realidad era una tarjeta. */
    account: BankAccount;
    /** Las demás cuentas del usuario, para elegir de cuál gasta un débito. */
    accounts: BankAccount[];
}

/**
 * Corregir el tipo de una identidad que el escaneo clasificó mal.
 *
 * Un número enmascarado no dice si es una cuenta o una tarjeta de débito, así
 * que el escaneo funda lo que parece y a veces se equivoca. Sin esto, la única
 * salida era archivar la cuenta y crear la tarjeta a mano, dejando el historial
 * apuntando a algo archivado y el número de vuelta en la conciliación.
 */
export function ConvertToCardSheet({ open, onOpenChange, account, accounts }: ConvertToCardSheetProps) {
    const router = useRouter();
    const [cardType, setCardType] = useState<BankCardType>("DEBIT");
    const [brand, setBrand] = useState("");
    const [spendsFrom, setSpendsFrom] = useState("");
    const [converting, setConverting] = useState(false);

    const isDebit = cardType === "DEBIT";
    // Del mismo banco y que no sea ella misma: una tarjeta de débito gasta de
    // una cuenta de su propio emisor, y la de origen se archiva en este paso.
    const usable = accounts.filter(
        a => a.id !== account.id && !a.isDeleted && a.institutionId === account.institutionId,
    );

    async function handleConvert() {
        if (isDebit && !spendsFrom) {
            toast.error("Elige la cuenta de la que gasta esta tarjeta");
            return;
        }

        setConverting(true);
        const result = await convertAccountToCardAction(account.id, {
            cardType,
            accountId: isDebit ? spendsFrom : null,
            brand: brand.trim() || null,
        });
        setConverting(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        const { movedTransactions } = result.data;
        toast.success(
            movedTransactions > 0
                ? `Convertida en tarjeta. ${movedTransactions} ${movedTransactions === 1 ? "movimiento pasó" : "movimientos pasaron"} con ella.`
                : "Convertida en tarjeta.",
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={onOpenChange}
            title="Convertir en tarjeta"
            description={`${formatIdentityNumber(account) || "Esta cuenta"} dejará de ser una cuenta y pasará a ser una tarjeta, con su historial.`}
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleConvert} disabled={converting}>
                    {converting ? "Convirtiendo…" : "Convertir en tarjeta"}
                </Button>
            }
        >
            <SegmentedChoice
                aria-label="Tipo de tarjeta"
                value={cardType}
                options={CARD_TYPES}
                onChange={setCardType}
            />

            {isDebit && (
                <Field label="Gasta de la cuenta" htmlFor="convert-account">
                    {usable.length === 0 ? (
                        <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                            No tienes otra cuenta en este banco. Registra primero la cuenta de la
                            que gasta esta tarjeta.
                        </p>
                    ) : (
                        <Select value={spendsFrom} onValueChange={setSpendsFrom}>
                            <SelectTrigger id="convert-account" aria-label="Gasta de la cuenta">
                                <SelectValue placeholder="Elige la cuenta" />
                            </SelectTrigger>
                            <SelectContent>
                                {usable.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </Field>
            )}

            <Field label="Marca" htmlFor="convert-brand" optional>
                <Input
                    id="convert-brand"
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="Ej. Visa, Mastercard"
                    autoComplete="off"
                />
            </Field>

            {/* Lo que va a pasar con el historial, antes de que pase. */}
            <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>
                    Sus movimientos pasarán a la tarjeta{isDebit ? " y descontarán de la cuenta que elijas" : ""},
                    y la cuenta se archivará. El cupo y el ciclo se ponen después, editando la tarjeta.
                </span>
            </p>
        </FormSheet>
    );
}
