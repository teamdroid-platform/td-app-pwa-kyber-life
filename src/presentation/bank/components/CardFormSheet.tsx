"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedChoice } from "./SegmentedChoice";
import { createBankCardAction } from "@/app/actions/bank";
import {
    InstitutionCombo, EMPTY_INSTITUTION_CHOICE, ensureInstitution,
    type InstitutionChoice,
} from "./InstitutionCombo";
import type { BankInstitution, BankAccount, BankCard, BankCardType } from "@/domain/entities/bank";

const CARD_TYPES = [
    { value: "CREDIT" as const, label: "Crédito" },
    { value: "DEBIT" as const, label: "Débito" },
];

const BRANDS = ["Visa", "Mastercard", "American Express", "Diners Club"];

interface CardFormSheetProps {
    institutions: BankInstitution[];
    accounts: BankAccount[];
    trigger: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /**
     * Qué hacer con lo recién creado, en vez de recargar la página. Ver la nota
     * en `AccountFormSheet`: dentro del wizard un refresh tiraría lo escrito.
     */
    onCreated?: (created: { card: BankCard; institution: BankInstitution | null }) => void;
}

/**
 * Alta de tarjeta. El formulario cambia de forma según el tipo, espejando los
 * CHECK de la tabla: el débito exige cuenta, el crédito la prohíbe y es el
 * único que tiene cupo y ciclo. Al cambiar de tipo se limpian los campos de la
 * otra rama para que no viajen valores que el esquema va a rechazar.
 */
export function CardFormSheet({
    institutions, accounts, trigger, open: controlledOpen, onOpenChange, onCreated,
}: CardFormSheetProps) {
    const router = useRouter();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = onOpenChange ?? setUncontrolledOpen;

    const [cardType, setCardType] = useState<BankCardType>("CREDIT");
    const [institution, setInstitution] = useState<InstitutionChoice>(() =>
        institutions[0]
            ? { id: institutions[0].id, name: institutions[0].name, kind: institutions[0].kind }
            : EMPTY_INSTITUTION_CHOICE,
    );
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [lastFour, setLastFour] = useState("");
    const [creditLimit, setCreditLimit] = useState("");
    const [statementDay, setStatementDay] = useState("");
    const [dueDay, setDueDay] = useState("");
    const [saving, setSaving] = useState(false);

    const isCredit = cardType === "CREDIT";

    function switchType(next: BankCardType) {
        setCardType(next);
        // Limpia la rama que deja de aplicar.
        if (next === "DEBIT") {
            setCreditLimit("");
            setStatementDay("");
            setDueDay("");
        }
    }

    async function handleSave() {
        if (!name.trim()) {
            toast.error("El nombre es requerido");
            return;
        }

        setSaving(true);
        const emisor = await ensureInstitution(institution, institutions);
        if (!emisor.ok) {
            setSaving(false);
            toast.error(emisor.error);
            return;
        }

        const result = await createBankCardAction({
            institutionId: emisor.id,
            accountId: isCredit ? null : (accountId || null),
            name: name.trim(),
            cardType,
            brand: brand || null,
            lastFour: lastFour || null,
            currency: "USD",
            creditLimit: isCredit && creditLimit ? Number(creditLimit) : null,
            statementDay: isCredit && statementDay ? Number(statementDay) : null,
            dueDay: isCredit && dueDay ? Number(dueDay) : null,
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success("Tarjeta creada");
        setName(""); setBrand(""); setLastFour("");
        setCreditLimit(""); setStatementDay(""); setDueDay("");
        setOpen(false);

        if (onCreated) onCreated({ card: result.data, institution: emisor.created });
        else router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title="Nueva tarjeta"
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar tarjeta"}
                </Button>
            }
        >
            <SegmentedChoice
                aria-label="Tipo de tarjeta"
                value={cardType}
                options={CARD_TYPES}
                onChange={switchType}
            />

            <InstitutionCombo
                id="card-institution"
                institutions={institutions}
                value={institution}
                onChange={setInstitution}
            />

            <Field label="Nombre" htmlFor="card-name">
                <Input
                    id="card-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Pacificard Mastercard"
                />
            </Field>

            <div className="grid grid-cols-2 gap-3">
                <Field label="Marca" optional>
                    <Select value={brand} onValueChange={setBrand}>
                        <SelectTrigger aria-label="Marca"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                            {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </Field>

                <Field label="Últimos 4" htmlFor="card-last-four" optional>
                    <Input
                        id="card-last-four"
                        inputMode="numeric"
                        maxLength={4}
                        value={lastFour}
                        onChange={e => setLastFour(e.target.value.replace(/\D/g, ""))}
                        placeholder="8361"
                    />
                </Field>
            </div>

            {isCredit ? (
                <>
                    <Field label="Cupo" htmlFor="card-limit" optional>
                        <Input
                            id="card-limit"
                            inputMode="decimal"
                            value={creditLimit}
                            onChange={e => setCreditLimit(e.target.value)}
                            placeholder="3000"
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Día de corte" htmlFor="card-statement-day" optional>
                            <Input
                                id="card-statement-day"
                                inputMode="numeric"
                                value={statementDay}
                                onChange={e => setStatementDay(e.target.value.replace(/\D/g, ""))}
                                placeholder="20"
                            />
                        </Field>
                        <Field label="Día de pago" htmlFor="card-due-day" optional>
                            <Input
                                id="card-due-day"
                                inputMode="numeric"
                                value={dueDay}
                                onChange={e => setDueDay(e.target.value.replace(/\D/g, ""))}
                                placeholder="28"
                            />
                        </Field>
                    </div>

                    <p className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                        Las tarjetas de crédito <b>no se atan a una cuenta</b>: las emite la
                        institución directo a ti. Al elegir Débito el formulario pide la cuenta
                        y esconde cupo y ciclo.
                    </p>
                </>
            ) : (
                <Field label="Atar a la cuenta">
                    <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger aria-label="Atar a la cuenta">
                            <SelectValue placeholder="Elige la cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}
        </FormSheet>
    );
}
