"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { financialOfflineStore } from "@/infrastructure/offline/financial-offline-store";
import { wallClockInputToISO } from "@/lib/date-range";
import { getTransactionSuggestionsAction } from "@/app/actions/financial-transactions";
import { updateInstitutionAction } from "@/app/actions/financial-settings";
import { useTransactionFormOptions, type TransactionFormOptions } from "../../hooks/useTransactionFormOptions";
import {
    WIZARD_STEPS,
    useTransactionWizard,
    type WizardMode,
    type WizardScreen,
    type WizardValues,
} from "../../hooks/useTransactionWizard";
import { buildAutoNotes } from "../../lib/transaction-notes";
import type { PendingInstitutionEdit } from "../InstitutionEditDialog";
import { WizardShell } from "./WizardShell";
import { AmountStep } from "./steps/AmountStep";
import { CategoryStep, InstitutionStep } from "./steps/PickerSteps";
import { PaymentStep } from "./steps/PaymentStep";
import { DateStep } from "./steps/DateStep";
import { SummaryStep, type FieldMarkers } from "./steps/SummaryStep";

/** Everything a decorator gets to reason about, without loading it a second time. */
export interface SummaryDecoratorContext extends TransactionFormOptions {
    values: WizardValues;
}

export interface SummaryDecoration {
    /** Small markers beside a value, e.g. "nueva" or a scan's match confidence. */
    fieldMarkers?: FieldMarkers;
    /** Read-only content appended after the rows. */
    extra?: ReactNode;
}

export interface TransactionWizardProps {
    mode: WizardMode;
    initialValues: WizardValues;
    currency?: string;
    /**
     * Where the initial notes came from. `scan` and `manual` are never
     * overwritten by the auto-generated sentence — only `auto` is.
     */
    notesOrigin?: "auto" | "scan" | "manual";
    /** Persists the values. Returning false keeps the wizard open. */
    onSubmit: (values: WizardValues) => Promise<boolean>;
    /** Called when the user leaves the wizard from the summary. */
    onClose?: () => void;
    submitLabel?: string;
    /**
     * Everything the summary shows beyond the plain values: the scan flow keeps
     * its originally extracted data consultable here, the capture flow marks
     * which records are about to be created.
     *
     * It is a function, not two static nodes, because those decorations depend
     * on the user's institutions and categories — which this component already
     * loads. Passing them down costs nothing; loading them again in the caller
     * would cost a second request and a second auth round-trip.
     */
    decorateSummary?: (context: SummaryDecoratorContext) => SummaryDecoration;
    /** Extra action rendered under the primary button on the summary (e.g. Descartar). */
    secondaryAction?: ReactNode;
    /** Shown inside the institution step, e.g. how confident the scan's match is. */
    institutionHint?: ReactNode;
    /**
     * Open straight on one field, as if its summary row had been tapped. Set
     * when the editor is entered from a specific row on the detail screen.
     */
    initialFocus?: WizardScreen;
}

/**
 * The stepped create/edit experience: one question per screen, ending in a
 * summary that every step can jump to and that can jump back into any single
 * step.
 *
 * It edits a draft in memory and calls `onSubmit` exactly once, so the server
 * contract is identical to the accordion form it replaces.
 */
export function TransactionWizard({
    mode,
    initialValues,
    currency = "USD",
    notesOrigin = mode === "create" ? "auto" : "manual",
    onSubmit,
    onClose,
    submitLabel,
    decorateSummary,
    secondaryAction,
    institutionHint,
    initialFocus,
}: TransactionWizardProps) {
    const wizard = useTransactionWizard({ mode, initialValues, initialFocus });
    const { values, setValue, screen, focus, isSummary } = wizard;

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [institutionQuery, setInstitutionQuery] = useState("");
    const [categoryQuery, setCategoryQuery] = useState("");
    const [pendingInstitutionEdit, setPendingInstitutionEdit] = useState<PendingInstitutionEdit | null>(null);
    const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
    const [descriptionsByType, setDescriptionsByType] = useState<Record<string, string[]>>({});
    const [suggestionsLoading, setSuggestionsLoading] = useState(true);

    // Only the auto-generated sentence may be overwritten. Notes seeded from a
    // scan's `summary`, or belonging to an existing transaction, are the user's.
    const [notesEdited, setNotesEdited] = useState(notesOrigin !== "auto" || !!initialValues.notes.trim());

    const {
        institutions,
        institutionTypes,
        accounts,
        categories,
        loading: optionsLoading,
        error: optionsError,
        setInstitutions,
        setCategories,
    } = useTransactionFormOptions();
    const accountsList = useMemo(() => accounts.map((a) => a.name), [accounts]);

    useEffect(() => {
        if (optionsError) toast.error("No se pudieron cargar categorías e instituciones. Reintenta.");
    }, [optionsError]);

    // Fetched once, for every type at once: what you write for an expense is
    // not what you write for an income, but re-asking on each chip tap cost a
    // request (and its auth round-trip) for data that fits in one response.
    // Suggestions are a convenience: a failure just means fewer chips.
    useEffect(() => {
        let active = true;
        void getTransactionSuggestionsAction()
            .then((res) => {
                if (!active) return;
                if (res?.success && res.data) {
                    setTagSuggestions(res.data.tags ?? []);
                    setDescriptionsByType(res.data.descriptionsByType ?? {});
                }
            })
            .catch(() => undefined)
            .finally(() => {
                if (active) setSuggestionsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    // Switching type is now a lookup, not a request.
    const descriptionSuggestions = descriptionsByType[values.type] ?? [];

    const autoNotes = useMemo(
        () => buildAutoNotes({
            type: values.type,
            description: values.description,
            institutionName: values.institutionName,
            amount: values.amount,
            date: values.date,
            accountName: values.accountName,
        }),
        [values.type, values.description, values.institutionName, values.amount, values.date, values.accountName],
    );

    useEffect(() => {
        if (!notesEdited) setValue("notes", autoNotes);
    }, [autoNotes, notesEdited, setValue]);

    // Draft persistence (create only): an interrupted capture resumes intact.
    const valuesRef = useRef(values);
    valuesRef.current = values;
    useEffect(() => {
        if (mode !== "create") return;
        const save = async () => {
            const current = valuesRef.current;
            try {
                await financialOfflineStore.drafts.clear();
                if (current.amount || current.institutionName || current.description || current.notes) {
                    await financialOfflineStore.drafts.add("draft_transaction", {
                        ...current,
                        amount: Number(current.amount) || 0,
                        currency,
                        date: wallClockInputToISO(current.date),
                        status: "MANUAL",
                    });
                }
            } catch (e) {
                console.error("Failed to save transaction draft", e);
            }
        };
        const timeoutId = setTimeout(save, 500);
        return () => clearTimeout(timeoutId);
    }, [mode, currency, values]);

    const handleNotesChange = (value: string) => {
        setValue("notes", value);
        setNotesEdited(true);
    };

    /** Persist a staged institution rename before writing the transaction. */
    const flushInstitutionEdit = async (): Promise<boolean> => {
        if (!pendingInstitutionEdit) return true;
        if (values.institutionName.trim().toLowerCase() !== pendingInstitutionEdit.name.trim().toLowerCase()) return true;
        try {
            await updateInstitutionAction(pendingInstitutionEdit.id, {
                name: pendingInstitutionEdit.name,
                institutionTypeId: pendingInstitutionEdit.institutionTypeId,
                description: pendingInstitutionEdit.description,
            });
            return true;
        } catch {
            toast.error("No se pudo actualizar la institución", { id: "inst-update-error" });
            return false;
        }
    };

    const handleSubmit = async () => {
        if (wizard.missing.length > 0) {
            wizard.goTo(wizard.missing[0].step);
            return;
        }
        setIsSubmitting(true);
        try {
            if (!(await flushInstitutionEdit())) return;
            await onSubmit(values);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Choosing from the picker makes the name authoritative again: any id a
    // pre-filled flow had resolved refers to a different record than the one
    // just selected, and keeping it would silently override the choice.
    const handleSelectInstitution = (name: string) => {
        wizard.patch({ institutionName: name, institutionId: null });
        setInstitutionQuery("");
    };

    const handleSelectCategory = (name: string) => {
        wizard.patch({ categoryName: name, categoryId: null });
        setCategoryQuery("");
    };

    const handleSelectAccount = (name: string) => {
        wizard.patch({ accountName: name, accountId: null });
    };

    const stepDefinition = WIZARD_STEPS.find((s) => s.id === screen);
    const stepNumber = WIZARD_STEPS.findIndex((s) => s.id === screen) + 1;

    const MODE_TITLES: Record<WizardMode, string> = {
        create: "Nueva transacción",
        edit: "Editar transacción",
        confirm: "Confirmar transacción",
    };

    const title = focus ? stepDefinition?.focusTitle ?? "Editar" : MODE_TITLES[mode];

    const summarySubtitle = () => {
        if (mode === "edit") {
            if (!wizard.isDirty) return "Sin cambios";
            return `${wizard.changed.length} ${wizard.changed.length === 1 ? "cambio" : "cambios"} sin guardar`;
        }
        if (mode === "confirm") return "Revisa y confirma, o edita cualquier dato";
        return "Revisa antes de guardar";
    };

    const subtitle = focus
        ? "Volverás al resumen"
        : isSummary
            ? summarySubtitle()
            : `Paso ${stepNumber} de ${WIZARD_STEPS.length} · ${stepDefinition?.label ?? ""}`;

    const renderScreen = () => {
        switch (screen) {
            case "amount":
                return (
                    <AmountStep
                        amount={values.amount}
                        onAmountChange={(v) => setValue("amount", v)}
                        currency={currency}
                        type={values.type}
                        onTypeChange={(v) => setValue("type", v)}
                        description={values.description}
                        onDescriptionChange={(v) => setValue("description", v)}
                        suggestions={descriptionSuggestions}
                        suggestionsLoading={suggestionsLoading}
                    />
                );
            case "institution":
                return (
                    <InstitutionStep
                        institutions={institutions}
                        institutionTypes={institutionTypes}
                        value={values.institutionName}
                        onSelect={handleSelectInstitution}
                        onInstitutionsChange={setInstitutions}
                        query={institutionQuery}
                        onQueryChange={setInstitutionQuery}
                        pendingEdit={pendingInstitutionEdit}
                        onPendingEditChange={setPendingInstitutionEdit}
                        hint={institutionHint}
                    />
                );
            case "category":
                return (
                    <CategoryStep
                        categories={categories}
                        value={values.categoryName}
                        onSelect={handleSelectCategory}
                        onCategoriesChange={setCategories}
                        query={categoryQuery}
                        onQueryChange={setCategoryQuery}
                        institutionName={values.institutionName}
                    />
                );
            case "payment":
                return (
                    <PaymentStep
                        accounts={accountsList}
                        value={values.accountName}
                        onSelect={handleSelectAccount}
                        creditEligible={wizard.creditEligible}
                        paidWithCredit={values.paidWithCredit}
                        onPaidWithCreditChange={(v) => setValue("paidWithCredit", v)}
                    />
                );
            case "date":
                return <DateStep value={values.date} onChange={(v) => setValue("date", v)} />;
            case "summary": {
                const decoration = decorateSummary?.({ values, institutions, institutionTypes, accounts, categories }) ?? {};
                return (
                    <SummaryStep
                        values={values}
                        initialValues={initialValues}
                        changed={wizard.changed}
                        missing={wizard.missing}
                        currency={currency}
                        mode={mode}
                        onEdit={(target: WizardScreen) => wizard.openFocus(target)}
                        onNotesChange={handleNotesChange}
                        onTagsChange={(v) => setValue("tags", v)}
                        tagSuggestions={tagSuggestions}
                        notesOrigin={notesOrigin}
                        extra={decoration.extra}
                        fieldMarkers={decoration.fieldMarkers}
                    />
                );
            }
        }
    };

    const editSaveLabel = wizard.isDirty
        ? `Guardar ${wizard.changed.length} ${wizard.changed.length === 1 ? "cambio" : "cambios"}`
        : "Guardar cambios";

    const primaryLabel = isSummary
        ? submitLabel ?? (mode === "edit" ? editSaveLabel : "Guardar transacción")
        : focus
            ? "Guardar cambio"
            : screen === "date" ? "Ver resumen" : "Siguiente";

    // Confirming needs no changes to be meaningful — approving as-is is the
    // common case — so only an edit requires something to have moved.
    const primaryDisabled = isSummary
        ? isSubmitting || wizard.missing.length > 0 || (mode === "edit" && !wizard.isDirty)
        : !wizard.canAdvance;

    const onPrimary = isSummary ? handleSubmit : focus ? wizard.commitFocus : wizard.next;

    const renderFooter = () => (
        <div className="flex flex-col gap-2 rounded-3xl border border-border/50 bg-bg-secondary/90 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-lg">
            {focus ? (
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={wizard.cancelFocus}
                        className="h-12 flex-1 rounded-2xl text-base"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={onPrimary}
                        disabled={primaryDisabled}
                        className="h-12 flex-1 rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                    >
                        {primaryLabel}
                    </Button>
                </div>
            ) : (
                <>
                    <Button
                        type="button"
                        onClick={onPrimary}
                        disabled={primaryDisabled}
                        className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                    >
                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : primaryLabel}
                    </Button>

                    {screen === "category" && !values.categoryName && (
                        <Button type="button" variant="outline" onClick={wizard.next} className="h-10 w-full rounded-2xl">
                            Sin categoría
                        </Button>
                    )}

                    {screen === "payment" && !values.accountName && !values.paidWithCredit && (
                        <Button type="button" variant="outline" onClick={wizard.next} className="h-10 w-full rounded-2xl">
                            Omitir
                        </Button>
                    )}

                    {isSummary && secondaryAction}
                </>
            )}
        </div>
    );

    return (
        <div className="flex min-h-[70vh] w-full flex-col">
            <WizardShell
                title={title}
                subtitle={subtitle}
                screen={screen}
                focus={focus}
                onBack={wizard.back}
                onClose={onClose}
                onOpenSummary={() => wizard.goTo("summary")}
                onReset={mode === "edit" && wizard.isDirty && isSummary ? wizard.reset : undefined}
                onSelectStep={(target) => wizard.goTo(target)}
                footer={renderFooter()}
            >
                {optionsLoading && screen !== "amount" && screen !== "date" && screen !== "summary" ? (
                    <div className="flex flex-1 items-center justify-center py-10 text-text-tertiary">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : (
                    renderScreen()
                )}
            </WizardShell>
        </div>
    );
}
