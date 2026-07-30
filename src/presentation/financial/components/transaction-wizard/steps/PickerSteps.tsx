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
            {/* With a detection hint the generic help line adds nothing, and the
                grid needs the room more than the user needs to be told to search. */}
            <StepHeading question="¿Dónde fue?" hint={hint ? undefined : "Busca el comercio o el banco, o crea uno nuevo."} />
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
