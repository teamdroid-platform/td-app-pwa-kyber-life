"use client";

import type { ReactNode } from "react";
import type { BankInstitutionKind } from "@/domain/entities/bank";
import type { FinancialCategory, FinancialInstitution, FinancialInstitutionType } from "@/domain/entities/financial";
import { INSTITUTION_KINDS, inferInstitutionKind, looksLikeIssuer } from "@/lib/bank-institution-kind";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryPicker } from "../../CategoryPicker";
import { InstitutionPicker } from "../../InstitutionPicker";
import type { PendingInstitutionEdit } from "../../InstitutionEditDialog";
import { StepHeading } from "../WizardShell";

interface InstitutionStepProps {
    institutions: FinancialInstitution[];
    institutionTypes: FinancialInstitutionType[];
    value: string;
    onSelect: (name: string) => void;
    onInstitutionsChange: (institutions: FinancialInstitution[]) => void;
    query: string;
    onQueryChange: (query: string) => void;
    pendingEdit: PendingInstitutionEdit | null;
    onPendingEditChange: (edit: PendingInstitutionEdit) => void;
    /** Extra context about the current value, e.g. a scan's match confidence. */
    hint?: ReactNode;
    /** Tipo declarado por el usuario para el emisor. `null` = no lo ha dicho. */
    bankInstitutionKind?: BankInstitutionKind | null;
    onBankInstitutionKindChange?: (kind: BankInstitutionKind) => void;
}

/**
 * El tipo de emisor, y solo cuando el nombre elegido puede fundar uno.
 *
 * Para un comercio no aparece: el módulo Bancos no crea una institución
 * bancaria a partir de FARMASHOP, así que preguntar su tipo sería preguntar
 * por algo que no va a existir. El valor mostrado arranca en lo que el nombre
 * sugiere, pero no se guarda hasta que el usuario lo toca — así una edición en
 * la que nadie tocó este campo no cuenta como un cambio.
 */
function InstitutionKindField({
    name, value, onChange,
}: {
    name: string;
    value: BankInstitutionKind | null | undefined;
    onChange: (kind: BankInstitutionKind) => void;
}) {
    if (!looksLikeIssuer(name)) return null;

    return (
        <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/30 p-3">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="wizard-institution-kind">
                Tipo de institución
            </label>
            <Select value={value ?? inferInstitutionKind(name)} onValueChange={v => onChange(v as BankInstitutionKind)}>
                <SelectTrigger id="wizard-institution-kind" aria-label="Tipo de institución" className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {INSTITUTION_KINDS.map(k => (
                        <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
                Se usa solo si <span className="font-medium">{name}</span> aún no está en Bancos. Si ya existe, conserva el tipo que tenga.
            </p>
        </div>
    );
}

/** Step 2 — where the money moved. Required. */
export function InstitutionStep({
    hint, bankInstitutionKind, onBankInstitutionKindChange, ...picker
}: InstitutionStepProps) {
    return (
        <>
            {/* With a detection hint the generic help line adds nothing, and the
                grid needs the room more than the user needs to be told to search. */}
            <StepHeading question="¿Dónde fue?" hint={hint ? undefined : "Busca el comercio o el banco, o crea uno nuevo."} />
            {hint}
            <InstitutionPicker {...picker} />
            {onBankInstitutionKindChange && (
                <InstitutionKindField
                    name={picker.value}
                    value={bankInstitutionKind}
                    onChange={onBankInstitutionKindChange}
                />
            )}
        </>
    );
}

interface CategoryStepProps {
    categories: FinancialCategory[];
    value: string;
    onSelect: (name: string) => void;
    onCategoriesChange: (categories: FinancialCategory[]) => void;
    query: string;
    onQueryChange: (query: string) => void;
    /** Institution the transaction belongs to, used only to word the hint. */
    institutionName: string;
}

/** Step 3 — what kind of movement it is. Optional, with an explicit way out. */
export function CategoryStep({ institutionName, ...picker }: CategoryStepProps) {
    return (
        <>
            <StepHeading
                question="¿De qué es?"
                hint={institutionName ? `Elige una categoría para tus movimientos en ${institutionName}.` : undefined}
            />
            <CategoryPicker {...picker} />
        </>
    );
}
