"use client";

import { useCallback, useMemo, useState } from "react";
import type { FinancialTransactionType } from "@/domain/entities/financial";

/** Types for which "paid with credit card" is a meaningful, editable flag. */
export const CREDIT_ELIGIBLE_TYPES: readonly FinancialTransactionType[] = ["EXPENSE"];

export type WizardStepId = "amount" | "institution" | "category" | "payment" | "date";

/** The summary is a destination you return to, not a step you walk through. */
export type WizardScreen = WizardStepId | "summary";

export interface WizardValues {
    type: FinancialTransactionType;
    amount: string;
    description: string;
    institutionName: string;
    categoryName: string;
    paidWithCredit: boolean;
    /** Cuenta de la que sale el dinero, cuando el usuario la eligió. */
    bankSourceAccountId?: string | null;
    /** Tarjeta usada. Con `paidWithCredit`, define un consumo diferido. */
    bankCardId?: string | null;
    date: string;
    notes: string;
    tags: string[];
    /**
     * Ids of records an external source already resolved, when it resolved them.
     *
     * The form is driven by names — the service creates a missing institution
     * from its name alone — but an extractor that answers with both an id and a
     * slightly different spelling would otherwise create a near-duplicate of a
     * record the user already has. Carrying the id makes that case exact.
     *
     * Only ever set by a pre-filled flow, and cleared the moment the user picks
     * something else, at which point the name is again the source of truth.
     */
    institutionId?: string | null;
    categoryId?: string | null;
}

export interface StepDefinition {
    id: WizardStepId;
    /** Shown under the wizard title, e.g. "Paso 2 de 5 · Institución". */
    label: string;
    /** Header used when the step is opened on its own from the summary. */
    focusTitle: string;
}

export const WIZARD_STEPS: StepDefinition[] = [
    { id: "amount", label: "Monto y descripción", focusTitle: "Editar monto y descripción" },
    { id: "institution", label: "Institución", focusTitle: "Editar institución" },
    { id: "category", label: "Categoría", focusTitle: "Editar categoría" },
    { id: "payment", label: "Cuenta y pago", focusTitle: "Editar cuenta y pago" },
    { id: "date", label: "Fecha y hora", focusTitle: "Editar fecha y hora" },
];

/** A required value the user still has to provide, and where to provide it. */
export interface MissingField {
    field: keyof WizardValues;
    step: WizardStepId;
    label: string;
}

/**
 * Which step owns each value. Drives "edit only this field" from the summary
 * and the jump-to-the-culprit behaviour of the missing-field rows.
 */
export const FIELD_STEP: Record<keyof WizardValues, WizardScreen> = {
    type: "amount",
    amount: "amount",
    description: "amount",
    institutionName: "institution",
    institutionId: "institution",
    categoryName: "category",
    categoryId: "category",
    paidWithCredit: "payment",
    bankSourceAccountId: "payment",
    bankCardId: "payment",
    date: "date",
    notes: "summary",
    tags: "summary",
};

export function isAmountValid(amount: string): boolean {
    const parsed = Number(amount);
    return !!amount && !Number.isNaN(parsed) && parsed > 0;
}

/**
 * Required values, in step order. Description is required by product decision:
 * it is the transaction's title everywhere (`getTransactionDisplayTitle`).
 */
export function collectMissing(values: WizardValues): MissingField[] {
    const missing: MissingField[] = [];
    if (!isAmountValid(values.amount)) missing.push({ field: "amount", step: "amount", label: "Falta el monto" });
    if (!values.description.trim()) missing.push({ field: "description", step: "amount", label: "Falta la descripción" });
    if (!values.institutionName.trim()) missing.push({ field: "institutionName", step: "institution", label: "Falta la institución" });
    if (!values.date) missing.push({ field: "date", step: "date", label: "Falta la fecha" });
    return missing;
}

/** Whether a given step has everything it needs to move forward. */
export function canLeaveStep(step: WizardStepId, values: WizardValues): boolean {
    return collectMissing(values).every((m) => m.step !== step);
}

/**
 * Resolved ids are plumbing, not values the user edits: picking an institution
 * from the list clears its id, and counting that as an unsaved change would
 * inflate "N cambios" for an edit that never happened.
 */
const DIFF_IGNORED: readonly (keyof WizardValues)[] = ["institutionId", "categoryId", "bankSourceAccountId", "bankCardId"];

/** Fields whose value differs from the one the wizard opened with. */
export function diffValues(initial: WizardValues, current: WizardValues): (keyof WizardValues)[] {
    return (Object.keys(current) as (keyof WizardValues)[]).filter((key) => {
        if (DIFF_IGNORED.includes(key)) return false;
        if (key === "tags") {
            const a = initial.tags ?? [];
            const b = current.tags ?? [];
            return a.length !== b.length || a.some((tag, i) => tag !== b[i]);
        }
        return initial[key] !== current[key];
    });
}

/**
 * What the wizard is being used for:
 *  - `create`  — capture from scratch: starts at step 1 and keeps a draft.
 *  - `edit`    — fix an existing transaction: starts at the summary, shows a diff.
 *  - `confirm` — review something already extracted (a scan): starts at the
 *                summary so approving is one tap, with the steps a tap away.
 */
export type WizardMode = "create" | "edit" | "confirm";

export interface UseTransactionWizardOptions {
    mode: WizardMode;
    initialValues: WizardValues;
    /**
     * Open directly on one step, as if its summary row had been tapped —
     * saving or cancelling returns to the summary. Used when the editor is
     * entered from a specific field on the detail screen. Ignored in `create`,
     * which always starts at step 1.
     */
    initialFocus?: WizardScreen;
}

/**
 * State machine behind the stepped transaction form.
 *
 * Two ways to reach a step:
 *   - the walk-through (`next`/`back`), where the primary action advances, and
 *   - focus mode (`openFocus`), reached from a summary row, where the primary
 *     action saves that one field and returns to the summary.
 *
 * Nothing here touches the server: the wizard edits a draft in memory and the
 * caller writes it once, at the end.
 */
export function useTransactionWizard({ mode, initialValues, initialFocus }: UseTransactionWizardOptions) {
    // Entering on a single field only makes sense when the values already exist.
    const startsFocused = mode !== "create" && !!initialFocus && initialFocus !== "summary";

    const [values, setValues] = useState<WizardValues>(initialValues);
    // Only a capture from scratch starts at step 1. When the values already
    // exist — an edit, or a scan waiting to be confirmed — the summary is the
    // right first screen: the task is to approve, not to re-enter.
    const [screen, setScreen] = useState<WizardScreen>(() => {
        if (startsFocused) return initialFocus as WizardScreen;
        return mode === "create" ? "amount" : "summary";
    });
    const [focus, setFocus] = useState(startsFocused);
    /** Value snapshot taken when a focus edit starts, so Cancel can restore it. */
    const [focusSnapshot, setFocusSnapshot] = useState<WizardValues | null>(
        startsFocused ? initialValues : null,
    );

    const setValue = useCallback(<K extends keyof WizardValues>(key: K, value: WizardValues[K]) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const patch = useCallback((partial: Partial<WizardValues>) => {
        setValues((prev) => ({ ...prev, ...partial }));
    }, []);

    const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === screen);
    const isSummary = screen === "summary";

    const missing = useMemo(() => collectMissing(values), [values]);
    const changed = useMemo(() => diffValues(initialValues, values), [initialValues, values]);

    const canAdvance = isSummary
        ? missing.length === 0
        : missing.every((m) => m.step !== (screen as WizardStepId));

    /** Walk-through: move to the next step, or to the summary after the last one. */
    const next = useCallback(() => {
        setScreen((current) => {
            const index = WIZARD_STEPS.findIndex((s) => s.id === current);
            if (index < 0 || index === WIZARD_STEPS.length - 1) return "summary";
            return WIZARD_STEPS[index + 1].id;
        });
    }, []);

    /** Back gesture: never closes the wizard, never loses what was typed. */
    const back = useCallback(() => {
        if (focus) {
            setFocus(false);
            setFocusSnapshot(null);
            setScreen("summary");
            return;
        }
        setScreen((current) => {
            if (current === "summary") return WIZARD_STEPS[WIZARD_STEPS.length - 1].id;
            const index = WIZARD_STEPS.findIndex((s) => s.id === current);
            return index <= 0 ? current : WIZARD_STEPS[index - 1].id;
        });
    }, [focus]);

    const goTo = useCallback((target: WizardScreen) => {
        setFocus(false);
        setFocusSnapshot(null);
        setScreen(target);
    }, []);

    /** Open one step on its own; saving or cancelling returns to the summary. */
    const openFocus = useCallback((target: WizardScreen) => {
        if (target === "summary") return;
        setFocusSnapshot(values);
        setFocus(true);
        setScreen(target);
    }, [values]);

    /** Keep the focused edit and go back to the summary. */
    const commitFocus = useCallback(() => {
        setFocus(false);
        setFocusSnapshot(null);
        setScreen("summary");
    }, []);

    /** Discard the focused edit and go back to the summary. */
    const cancelFocus = useCallback(() => {
        if (focusSnapshot) setValues(focusSnapshot);
        setFocus(false);
        setFocusSnapshot(null);
        setScreen("summary");
    }, [focusSnapshot]);

    /** Drop every pending change (edit mode's "Deshacer"). */
    const reset = useCallback(() => {
        setValues(initialValues);
        setFocus(false);
        setFocusSnapshot(null);
    }, [initialValues]);

    const creditEligible = CREDIT_ELIGIBLE_TYPES.includes(values.type);

    return {
        values,
        setValue,
        patch,
        screen,
        stepIndex,
        isSummary,
        focus,
        next,
        back,
        goTo,
        openFocus,
        commitFocus,
        cancelFocus,
        reset,
        missing,
        changed,
        canAdvance,
        creditEligible,
        isDirty: changed.length > 0,
    };
}

export type TransactionWizardApi = ReturnType<typeof useTransactionWizard>;
