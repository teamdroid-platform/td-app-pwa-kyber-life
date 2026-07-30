"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { withSelectedFirst } from "@/lib/utils";
import { resolveFinancialIcon } from "@/presentation/financial/lib/financial-icons";
import { getInstitutionsAction, createInstitutionAction } from "@/app/actions/financial-settings";
import type { FinancialInstitution, FinancialInstitutionType } from "@/domain/entities/financial";
import { InstitutionEditDialog, type PendingInstitutionEdit } from "./InstitutionEditDialog";
import { PickerGridTile, PickerMoreTile, PickerCreateButton, PickerEmptyHint } from "./picker-tiles";

const PREVIEW_COUNT = 5;

export interface InstitutionPickerProps {
    /** All of the owner's institutions (not yet filtered by deleted/query). */
    institutions: FinancialInstitution[];
    institutionTypes: FinancialInstitutionType[];
    /** Selected institution name (the actual form value). */
    value: string;
    onSelect: (name: string) => void;
    /** Called after create/edit so the parent's copy of the list stays in sync. */
    onInstitutionsChange: (institutions: FinancialInstitution[]) => void;
    /** Search text, controlled by the parent so it can reset it on re-entry into this field. */
    query: string;
    onQueryChange: (query: string) => void;
    /** Staged institution edit (persistence is deferred to the parent's save flow). */
    pendingEdit: PendingInstitutionEdit | null;
    onPendingEditChange: (edit: PendingInstitutionEdit) => void;
}

/**
 * Search + grid picker for a "which institution is this transaction with"
 * field: shows the most relevant institutions as tappable tiles (selected one
 * first), lets the user search, create a brand-new institution on the fly, or
 * edit an existing one (staged — the parent decides when to persist it).
 */
export function InstitutionPicker({
    institutions,
    institutionTypes,
    value,
    onSelect,
    onInstitutionsChange,
    query,
    onQueryChange,
    pendingEdit,
    onPendingEditChange,
}: InstitutionPickerProps) {
    const [showAll, setShowAll] = useState(false);
    const [creating, setCreating] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    const active = useMemo(() => institutions.filter((i) => !i.isDeleted), [institutions]);
    const ordered = useMemo(() => withSelectedFirst(active, value), [active, value]);

    const q = query.trim().toLowerCase();
    const matched = useMemo(
        () => (q ? ordered.filter((i) => i.name.toLowerCase().includes(q)) : ordered),
        [ordered, q],
    );
    const visible = showAll ? matched : matched.slice(0, PREVIEW_COUNT);
    const hiddenCount = Math.max(0, matched.length - PREVIEW_COUNT);
    const exactExists = active.some((i) => i.name.trim().toLowerCase() === q);

    const matchedInstitution = useMemo(
        () => institutions.find((i) => !i.isDeleted && i.name.trim().toLowerCase() === value.trim().toLowerCase()) ?? null,
        [institutions, value],
    );

    const institutionForDialog = useMemo(() => {
        if (!matchedInstitution) return null;
        if (pendingEdit && pendingEdit.id === matchedInstitution.id) {
            return { ...matchedInstitution, name: pendingEdit.name, institutionTypeId: pendingEdit.institutionTypeId, description: pendingEdit.description };
        }
        return matchedInstitution;
    }, [matchedInstitution, pendingEdit]);

    const handleSelect = (name: string) => {
        onSelect(name);
        onQueryChange("");
    };

    const handleCreate = async () => {
        const name = query.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            await createInstitutionAction({ name });
            const fresh = await getInstitutionsAction();
            onInstitutionsChange(fresh);
            onSelect(name);
            onQueryChange("");
            toast.success(`Institución "${name}" creada`);
        } catch {
            toast.error("No se pudo crear la institución");
        } finally {
            setCreating(false);
        }
    };

    const handleEditApply = (edit: PendingInstitutionEdit) => {
        onPendingEditChange(edit);
        onSelect(edit.name);
        onInstitutionsChange(institutions.map((i) => (i.id === edit.id
            ? { ...i, name: edit.name, institutionTypeId: edit.institutionTypeId, description: edit.description }
            : i)));
    };

    return (
        <>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Buscar institución"
                    className="pl-9"
                    autoComplete="off"
                />
            </div>

            {visible.length > 0 && (
                <>
                    <p className="mt-3 text-xs text-text-tertiary">Sugerencias</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        {visible.map((inst) => (
                            <PickerGridTile
                                key={inst.id}
                                label={inst.name}
                                Icon={resolveFinancialIcon(inst.institutionTypeObj?.iconName, Building2)}
                                iconClassName="bg-blue-500/10 text-blue-500"
                                selected={inst.name.trim().toLowerCase() === value.trim().toLowerCase()}
                                onClick={() => handleSelect(inst.name)}
                            />
                        ))}
                        {hiddenCount > 0 && <PickerMoreTile expanded={showAll} onClick={() => setShowAll((v) => !v)} />}
                    </div>
                    {matchedInstitution && (
                        <div className="mt-2">
                            {/* Names what it changes: right under a grid used for
                                choosing, a bare "Editar" reads as "pick another". */}
                            <button
                                type="button"
                                onClick={() => setDialogOpen(true)}
                                aria-label={`Editar los datos de ${matchedInstitution.name}`}
                                className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
                            >
                                <Pencil className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">Editar «{matchedInstitution.name}»</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            {visible.length === 0 && !q && (
                <PickerEmptyHint text="Aún no tienes instituciones guardadas. Escribe un nombre arriba para crear la primera." />
            )}

            {q && !exactExists && <PickerCreateButton name={query.trim()} creating={creating} onClick={handleCreate} />}

            <InstitutionEditDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                institution={institutionForDialog}
                types={institutionTypes}
                onApply={handleEditApply}
            />
        </>
    );
}

export { type PendingInstitutionEdit } from "./InstitutionEditDialog";
