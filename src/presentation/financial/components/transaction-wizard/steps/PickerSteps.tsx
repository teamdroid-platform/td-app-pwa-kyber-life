"use client";

import type { ReactNode } from "react";
import type { FinancialCategory, FinancialInstitution, FinancialInstitutionType } from "@/domain/entities/financial";
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
}

/** Step 2 — where the money moved. Required. */
export function InstitutionStep({ hint, ...picker }: InstitutionStepProps) {
    return (
        <>
            <StepHeading question="¿Dónde fue?" hint="Busca el comercio o el banco, o crea uno nuevo." />
            {hint}
            <InstitutionPicker {...picker} />
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
