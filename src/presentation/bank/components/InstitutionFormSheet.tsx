"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormSheet } from "@/components/ui/form-sheet";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBankInstitutionAction } from "@/app/actions/bank";
import type { BankInstitution, BankInstitutionKind } from "@/domain/entities/bank";
import { INSTITUTION_KINDS } from "@/lib/bank-institution-kind";

interface InstitutionFormSheetProps {
    trigger: React.ReactNode;
    /** Avisa al contenedor —el selector de alta— para que también se cierre. */
    onCreated?: (created: BankInstitution) => void;
}

export function InstitutionFormSheet({ trigger, onCreated }: InstitutionFormSheetProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [kind, setKind] = useState<BankInstitutionKind>("OTHER");
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        if (!name.trim()) {
            toast.error("El nombre es requerido");
            return;
        }

        setSaving(true);
        const result = await createBankInstitutionAction({ name: name.trim(), kind });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }

        toast.success("Institución creada");
        setName("");
        setOpen(false);
        onCreated?.(result.data);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title="Nueva institución"
            bodyClassName="space-y-4 py-4"
            footer={
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                </Button>
            }
        >
            <p className="text-xs leading-relaxed text-muted-foreground">
                El emisor de tus cuentas y tarjetas. Distinto de los comercios, que
                viven en la configuración del módulo financiero.
            </p>

            <Field label="Nombre" htmlFor="institution-name">
                <Input
                    id="institution-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Banco del Austro"
                    autoFocus
                />
            </Field>

            <Field label="Tipo">
                <Select value={kind} onValueChange={v => setKind(v as BankInstitutionKind)}>
                    <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {INSTITUTION_KINDS.map(k => (
                            <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
        </FormSheet>
    );
}
