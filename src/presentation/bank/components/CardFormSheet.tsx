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
import { createBankCardAction, updateBankCardAction } from "@/app/actions/bank";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { accountLabel } from "@/lib/bank-identity-label";
import { formatBankNumber } from "@/lib/format-bank-number";
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
    /**
     * La tarjeta a corregir. Con ella el formulario edita en vez de dar de alta
     * — es el mantenimiento de lo que detectó un escaneo: atarla a su cuenta,
     * moverla al emisor correcto, ponerle nombre.
     */
    card?: BankCard;
    /** Número con el que abrir el alta, p. ej. el que leyó un escaneo. */
    defaultNumber?: string;
}

/**
 * Alta y mantenimiento de tarjeta. El formulario cambia de forma según el tipo,
 * espejando los CHECK de la tabla: el débito exige cuenta, el crédito la
 * prohíbe y es el único que tiene cupo y ciclo. Al cambiar de tipo se limpian
 * los campos de la otra rama para que no viajen valores que el esquema va a
 * rechazar.
 *
 * Guardar una tarjeta detectada por un escaneo la da por revisada: entra a los
 * saldos, y por eso a partir de ahí un débito sí tiene que decir de qué cuenta
 * gasta.
 */
export function CardFormSheet({
    institutions, accounts, trigger, open: controlledOpen, onOpenChange, onCreated, card,
    defaultNumber = "",
}: CardFormSheetProps) {
    const router = useRouter();
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const setOpen = onOpenChange ?? setUncontrolledOpen;

    const isEdit = !!card;
    const [cardType, setCardType] = useState<BankCardType>(card?.cardType ?? "CREDIT");
    const [institution, setInstitution] = useState<InstitutionChoice>(() => {
        const current = institutions.find(i => i.id === card?.institutionId) ?? institutions[0];
        return current
            ? { id: current.id, name: current.name, kind: current.kind }
            : EMPTY_INSTITUTION_CHOICE;
    });
    const [accountId, setAccountId] = useState(card?.accountId ?? accounts[0]?.id ?? "");
    const [brand, setBrand] = useState(card?.brand ?? "");
    // Un solo campo para el número, como en el alta de cuenta: lo que el banco
    // muestra —`493176XXXXXX2780`— trae principio y final a la vez.
    const [number, setNumber] = useState(card ? formatBankNumber(card, "CARD") : defaultNumber);
    const [creditLimit, setCreditLimit] = useState(card?.creditLimit != null ? String(card.creditLimit) : "");
    const [statementDay, setStatementDay] = useState(card?.statementDay != null ? String(card.statementDay) : "");
    const [dueDay, setDueDay] = useState(card?.dueDay != null ? String(card.dueDay) : "");
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
        // Guardar da la tarjeta por revisada, y una de débito que entra a los
        // saldos tiene que decir de dónde sale el dinero.
        if (!isCredit && !accountId) {
            toast.error("Elige la cuenta de la que gasta esta tarjeta");
            return;
        }

        setSaving(true);
        const emisor = await ensureInstitution(institution, institutions);
        if (!emisor.ok) {
            setSaving(false);
            toast.error(emisor.error);
            return;
        }

        const digits = parseBankNumber(number);
        const payload = {
            institutionId: emisor.id,
            accountId: isCredit ? null : (accountId || null),
            cardType,
            brand: brand || null,
            lastFour: digits.suffixDigits || null,
            prefixDigits: digits.prefixDigits || null,
            bin: digits.bin ?? card?.bin ?? null,
            currency: "USD",
            creditLimit: isCredit && creditLimit ? Number(creditLimit) : null,
            statementDay: isCredit && statementDay ? Number(statementDay) : null,
            dueDay: isCredit && dueDay ? Number(dueDay) : null,
        };

        const result = card
            ? await updateBankCardAction(card.id, { ...payload, isUnconfirmed: false })
            : await createBankCardAction(payload);
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success(isEdit ? "Tarjeta actualizada" : "Tarjeta creada");
        if (!isEdit) {
            setBrand(""); setNumber("");
            setCreditLimit(""); setStatementDay(""); setDueDay("");
        }
        setOpen(false);

        if (onCreated && !isEdit) onCreated({ card: result.data, institution: emisor.created });
        else router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title={isEdit ? "Editar tarjeta" : "Nueva tarjeta"}
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar tarjeta"}
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

            <div className="grid grid-cols-2 gap-3">
                <Field label="Marca" optional>
                    <Select value={brand} onValueChange={setBrand}>
                        <SelectTrigger aria-label="Marca"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                            {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </Field>

                <Field label="Número" htmlFor="card-number" optional>
                    <Input
                        id="card-number"
                        value={number}
                        onChange={e => setNumber(e.target.value)}
                        placeholder="Ej. 493176XXXXXX2780"
                        autoComplete="off"
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
                                <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}
        </FormSheet>
    );
}
