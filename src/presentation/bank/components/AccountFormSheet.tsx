"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBankAccountAction } from "@/app/actions/bank";
import type { BankInstitution, BankAccountType } from "@/domain/entities/bank";

const TYPES: { value: BankAccountType; label: string }[] = [
    { value: "SAVINGS", label: "Ahorros" },
    { value: "CHECKING", label: "Corriente" },
    { value: "INVESTMENT", label: "Inversión" },
];

interface AccountFormSheetProps {
    institutions: BankInstitution[];
    trigger: React.ReactNode;
}

/**
 * Alta de cuenta. No ofrece el tipo `CASH`: la cuenta de efectivo la crea el
 * servicio sola y hay a lo sumo una por usuario.
 */
export function AccountFormSheet({ institutions, trigger }: AccountFormSheetProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [institutionId, setInstitutionId] = useState(institutions[0]?.id ?? "");
    const [name, setName] = useState("");
    const [accountType, setAccountType] = useState<BankAccountType>("SAVINGS");
    const [lastFour, setLastFour] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        if (!name.trim()) {
            toast.error("El nombre es requerido");
            return;
        }
        if (!institutionId) {
            toast.error("Crea primero la institución que emite la cuenta");
            return;
        }

        setSaving(true);
        const result = await createBankAccountAction({
            institutionId,
            name: name.trim(),
            accountType,
            lastFour: lastFour || null,
            currency: "USD",
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success("Cuenta creada");
        setName(""); setLastFour("");
        setOpen(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title="Nueva cuenta"
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                </Button>
            }
        >
            <Field label="Institución">
                <Select value={institutionId} onValueChange={setInstitutionId}>
                    <SelectTrigger aria-label="Institución">
                        <SelectValue placeholder="Elige el emisor" />
                    </SelectTrigger>
                    <SelectContent>
                        {institutions.map(i => (
                            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <Field label="Nombre" htmlFor="account-name">
                <Input
                    id="account-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Ahorros Principal"
                />
            </Field>

            <div className="grid grid-cols-2 gap-3">
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

                <Field label="Últimos 4" htmlFor="account-last-four" optional>
                    <Input
                        id="account-last-four"
                        inputMode="numeric"
                        maxLength={4}
                        value={lastFour}
                        onChange={e => setLastFour(e.target.value.replace(/\D/g, ""))}
                        placeholder="0814"
                    />
                </Field>
            </div>
        </FormSheet>
    );
}
