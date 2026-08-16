"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBankAccountAction, updateBankAccountAction } from "@/app/actions/bank";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { formatBankNumber } from "@/lib/format-bank-number";
import {
    InstitutionCombo, EMPTY_INSTITUTION_CHOICE, ensureInstitution,
    type InstitutionChoice,
} from "./InstitutionCombo";
import type { BankInstitution, BankInstitutionKind, BankAccount, BankAccountType } from "@/domain/entities/bank";

const TYPES: { value: BankAccountType; label: string }[] = [
    { value: "SAVINGS", label: "Ahorros" },
    { value: "CHECKING", label: "Corriente" },
    { value: "INVESTMENT", label: "Inversión" },
];

interface AccountFormSheetProps {
    institutions: BankInstitution[];
    trigger: React.ReactNode;
    /**
     * Qué hacer con lo recién creado, en vez de recargar la página.
     *
     * Sin esto el formulario refresca la ruta, que es lo correcto en Bancos.
     * Dentro del wizard de transacciones un refresh tiraría lo que el usuario
     * lleva escrito, así que quien lo abre desde ahí recibe las entidades y
     * actualiza sus propias listas.
     */
    onCreated?: (created: { account: BankAccount; institution: BankInstitution | null }) => void;
    /**
     * La cuenta a corregir. Con ella el formulario edita en vez de dar de alta
     * — es el mantenimiento de lo que detectó un escaneo: ponerle nombre,
     * moverla al emisor correcto, ajustar su tipo.
     */
    account?: BankAccount;
    /** Número con el que abrir el alta, p. ej. el que leyó un escaneo. */
    defaultNumber?: string;
    /**
     * Emisor con el que abrir el alta. Lo usa quien ya sabe de qué institución
     * será la cuenta — dar de alta una para atarla a una tarjeta del Austro no
     * debería empezar preguntando el banco otra vez.
     */
    defaultInstitution?: { id: string | null; name: string; kind: BankInstitutionKind };
}

/**
 * Alta de cuenta. No ofrece el tipo `CASH`: la cuenta de efectivo la crea el
 * servicio sola y hay a lo sumo una por usuario.
 *
 * El emisor se elige o se escribe: si no existe todavía, nace junto con la
 * cuenta en un solo guardado.
 */
export function AccountFormSheet({
    institutions, trigger, onCreated, account, defaultNumber = "", defaultInstitution,
}: AccountFormSheetProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const isEdit = !!account;
    const [institution, setInstitution] = useState<InstitutionChoice>(() => {
        const own = institutions.find(i => i.id === account?.institutionId);
        if (own) return { id: own.id, name: own.name, kind: own.kind };
        if (defaultInstitution) return defaultInstitution;
        const first = institutions[0];
        return first ? { id: first.id, name: first.name, kind: first.kind } : EMPTY_INSTITUTION_CHOICE;
    });
    const [accountType, setAccountType] = useState<BankAccountType>(
        account?.accountType === "CASH" ? "SAVINGS" : account?.accountType ?? "SAVINGS",
    );
    // Un solo campo para el número: el usuario escribe lo que el banco le
    // muestra —`25XXX11`, `••••0814`— o el número entero, y de ahí salen el
    // principio y el final. Pedir «últimos 4» por separado obligaba a
    // descomponerlo a mano y perdía los dígitos del principio, que son los que
    // distinguen una cuenta de cooperativa de otra.
    const [number, setNumber] = useState(
        account ? formatBankNumber(account, "ACCOUNT") : defaultNumber,
    );
    const [saving, setSaving] = useState(false);

    async function handleSave() {
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
            accountType,
            lastFour: digits.suffixDigits || null,
            prefixDigits: digits.prefixDigits || null,
            currency: "USD",
        };

        // Guardar da por revisada una cuenta que detectó un escaneo: a partir
        // de ahí cuenta para los saldos.
        const result = account
            ? await updateBankAccountAction(account.id, { ...payload, isUnconfirmed: false })
            : await createBankAccountAction(payload);
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success(isEdit ? "Cuenta actualizada" : "Cuenta creada");
        if (!isEdit) setNumber("");
        setOpen(false);

        if (onCreated && !isEdit) onCreated({ account: result.data, institution: emisor.created });
        else router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title={isEdit ? "Editar cuenta" : "Nueva cuenta"}
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar"}
                </Button>
            }
        >
            <InstitutionCombo
                id="account-institution"
                institutions={institutions}
                value={institution}
                onChange={setInstitution}
            />

            <Field label="Tipo">
                <Select value={accountType} onValueChange={v => setAccountType(v as BankAccountType)}>
                    <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <Field label="Número de cuenta" htmlFor="account-number" optional>
                <Input
                    id="account-number"
                    value={number}
                    onChange={e => setNumber(e.target.value)}
                    placeholder="Ej. 25XXX11, ••••0814 o el número completo"
                    autoComplete="off"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Tal como lo muestra tu banco. Se guardan solo los dígitos
                    visibles, y son los que identifican esta cuenta en los escaneos.
                </p>
            </Field>
        </FormSheet>
    );
}
