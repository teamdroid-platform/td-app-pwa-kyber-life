"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useScrollFieldIntoView } from "@/hooks/use-scroll-field-into-view";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccordionField } from "@/components/ui/accordion-field";
import { Switch } from "@/components/ui/switch";
import { DateTimeStepInput } from "@/components/ui/datetime-step-input";
import { createTransactionAction } from "@/app/actions/financial-transactions";
import { updateInstitutionAction } from "@/app/actions/financial-settings";
import { FINANCIAL_FLAGS } from "@/lib/feature-flags";
import { TransactionCreateWizard } from "./transaction-wizard/TransactionCreateWizard";
import { useTransactionFormOptions } from "../hooks/useTransactionFormOptions";
import { FinancialTransactionType } from "@/domain/entities/financial";
import { financialOfflineStore } from "@/infrastructure/offline/financial-offline-store";
import { InstitutionPicker, type PendingInstitutionEdit } from "./InstitutionPicker";
import { CategoryPicker } from "./CategoryPicker";
import { TransactionTypeChips } from "./TransactionTypeChips";
import { AmountHeroInput } from "./AmountHeroInput";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { toDateTimeLocalValue, isoToWallClockInput, wallClockInputToISO, roundToNearestFiveMinutes } from "@/lib/date-range";
import { buildAutoNotes, formatNotesDateTime } from "../lib/transaction-notes";
import { Building2, Landmark, FileText, CreditCard, Calendar, MessageSquare, Tag } from "lucide-react";

/** Types for which "paid with credit card" is a meaningful, editable flag. */
const CREDIT_ELIGIBLE_TYPES: readonly FinancialTransactionType[] = ["EXPENSE"];

const MAX_DESCRIPTION = 120;
const MAX_NOTES = 200;

/** Accordion section ids. Only one may be expanded at a time (or none). */
type SectionId = "description" | "institution" | "account" | "category" | "date" | "notes";

export function TransactionForm() {
    return FINANCIAL_FLAGS.WIZARD_ENABLED ? <TransactionCreateWizard /> : <LegacyTransactionForm />;
}

/** The original single-screen form. Superseded by the wizard; kept as fallback. */
export function LegacyTransactionForm() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    useScrollFieldIntoView(formRef);

    // Which accordion section is open (only one or none).
    const [expanded, setExpanded] = useState<SectionId | null>(null);
    const toggle = (id: SectionId) => {
        // Re-entering a search section always starts with a blank query; the
        // already-selected value is preserved and shown first in the grid.
        if (id === "institution" && expanded !== "institution") setInstitutionQuery("");
        if (id === "category" && expanded !== "category") setCategoryQuery("");
        setExpanded((cur) => (cur === id ? null : id));
    };

    // Form State
    const [type, setType] = useState<FinancialTransactionType>("EXPENSE");
    const [amount, setAmount] = useState("");
    // Only USD is supported for now; the currency is locked.
    const currency = "USD";
    const [description, setDescription] = useState("");
    const [date, setDate] = useState(toDateTimeLocalValue(roundToNearestFiveMinutes(new Date())));
    const [notes, setNotes] = useState("");
    const [notesEdited, setNotesEdited] = useState(false);
    const [institutionName, setInstitutionName] = useState("");
    const [categoryName, setCategoryName] = useState("");
    const [paidWithCredit, setPaidWithCredit] = useState(false);

    // Pickers' options come from a single resilient loader (see the hook): a
    // partial failure used to leave them silently empty.
    const {
        institutions,
        institutionTypes,
        categories,
        error: optionsError,
        setInstitutions,
        setCategories,
    } = useTransactionFormOptions();

    const [institutionQuery, setInstitutionQuery] = useState("");
    const [categoryQuery, setCategoryQuery] = useState("");

    // Institution inline-edit (staged; persisted on submit).
    const [pendingInstitutionEdit, setPendingInstitutionEdit] = useState<PendingInstitutionEdit | null>(null);

    const creditEligible = CREDIT_ELIGIBLE_TYPES.includes(type);

    // Load the saved draft on mount (the pickers' options load on their own, so
    // a settings failure can no longer take the draft down with it).
    useEffect(() => {
        const loadDraftAndData = async () => {
            try {
                const drafts = await financialOfflineStore.drafts.getAll();
                const latestDraft = drafts.length > 0 ? drafts[drafts.length - 1] : null;

                if (latestDraft) {
                    const data = latestDraft.data as any;
                    const draftType = data.type || "EXPENSE";
                    const draftAmount = data.amount ? data.amount.toString() : "";
                    const draftDescription = data.description || "";
                    const draftInstitution = data.institutionName || "";
                    const draftDate = isoToWallClockInput(data.date) ?? "";

                    if (data.type) setType(data.type);
                    if (data.amount) setAmount(draftAmount);
                    if (data.description) setDescription(draftDescription);
                    if (draftDate) setDate(draftDate);
                    if (data.institutionName) setInstitutionName(draftInstitution);
                    if (data.categoryName) setCategoryName(data.categoryName);
                    if (data.paidWithCredit) setPaidWithCredit(Boolean(data.paidWithCredit));

                    if (data.notes) {
                        const draftAuto = buildAutoNotes({
                            type: draftType,
                            description: draftDescription,
                            institutionName: draftInstitution,
                            amount: draftAmount,
                            date: draftDate,
                        });
                        setNotes(data.notes);
                        setNotesEdited(data.notes.trim() !== draftAuto.trim());
                    }
                }
            } catch (e) {
                console.error("Failed to load transaction draft", e);
            }
        };
        loadDraftAndData();
    }, []);

    // Never let a failed load look like "you have no categories/institutions".
    useEffect(() => {
        if (optionsError) toast.error("No se pudieron cargar categorías e instituciones. Reintenta.");
    }, [optionsError]);

    // Save draft when values change (debounced).
    useEffect(() => {
        const saveDraft = async () => {
            try {
                await financialOfflineStore.drafts.clear();
                if (amount || institutionName || notes || description) {
                    await financialOfflineStore.drafts.add("draft_transaction", {
                        type,
                        amount: Number(amount) || 0,
                        currency,
                        description,
                        date: wallClockInputToISO(date),
                        notes,
                        institutionName,
                        categoryName,
                        paidWithCredit,
                        status: "MANUAL",
                    });
                }
            } catch (e) {
                console.error("Failed to save draft to offline store", e);
            }
        };

        const timeoutId = setTimeout(saveDraft, 500);
        return () => clearTimeout(timeoutId);
    }, [type, amount, currency, description, date, notes, institutionName, categoryName, paidWithCredit]);

    // Auto-generate the notes until the user customises them.
    const autoNotes = useMemo(
        () => buildAutoNotes({ type, description, institutionName, amount, date }),
        [type, description, institutionName, amount, date],
    );

    useEffect(() => {
        if (!notesEdited) setNotes(autoNotes);
    }, [autoNotes, notesEdited]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!institutionName || institutionName.trim() === "") {
            toast.error("La institución es requerida");
            setExpanded("institution");
            return;
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            toast.error("Ingresa un monto válido mayor a 0");
            return;
        }
        // Required server-side too: it is the title the transaction is listed under.
        if (!description.trim()) {
            toast.error("La descripción es requerida");
            setExpanded("description");
            return;
        }
        if (!date) {
            toast.error("La fecha es requerida");
            setExpanded("date");
            return;
        }
        if (!type) {
            toast.error("El tipo de transacción es requerido");
            return;
        }

        setIsSubmitting(true);

        const transactionData = {
            type,
            status: "MANUAL" as const,
            amount: Number(amount),
            currency,
            description: description.trim(),
            date: wallClockInputToISO(date)!,
            notes: notes || undefined,
            institutionName: institutionName || undefined,
            categoryName: categoryName || undefined,
            paidWithCredit: creditEligible ? paidWithCredit : undefined,
        };

        if (!navigator.onLine) {
            try {
                await financialOfflineStore.drafts.add(`draft_${Date.now()}`, transactionData);
                toast.success("Guardado localmente. Se sincronizará cuando tengas conexión.", { id: "tx-offline-success" });
                router.push("/financial/transactions");
                router.refresh();
            } catch (error) {
                toast.error("Error al guardar localmente", { id: "tx-offline-error" });
                setIsSubmitting(false);
            }
            return;
        }

        try {
            if (pendingInstitutionEdit && institutionName.trim().toLowerCase() === pendingInstitutionEdit.name.trim().toLowerCase()) {
                try {
                    await updateInstitutionAction(pendingInstitutionEdit.id, {
                        name: pendingInstitutionEdit.name,
                        institutionTypeId: pendingInstitutionEdit.institutionTypeId,
                        description: pendingInstitutionEdit.description,
                    });
                } catch {
                    toast.error("No se pudo actualizar la institución", { id: "inst-update-error" });
                    setIsSubmitting(false);
                    return;
                }
            }

            const result = await createTransactionAction(transactionData);

            if (result.success) {
                toast.success("Transacción creada correctamente", { id: "tx-create-success" });
                await financialOfflineStore.drafts.clear();
                router.push("/financial/transactions");
                router.refresh();
            } else {
                toast.error(result.error || "No se pudo crear la transacción", { id: "tx-create-error" });
                setIsSubmitting(false);
            }
        } catch (error) {
            try {
                await financialOfflineStore.drafts.add(`draft_${Date.now()}`, transactionData);
                toast.success("Error de red. Guardado localmente para sincronización futura.", { id: "tx-network-fallback-success" });
                router.push("/financial/transactions");
                router.refresh();
            } catch (e) {
                toast.error("Ocurrió un error inesperado y no se pudo guardar localmente.", { id: "tx-network-fallback-error" });
                setIsSubmitting(false);
            }
        }
    };

    // Collapsed previews
    const paidWithCreditActive = paidWithCredit && creditEligible;
    // El selector de cuenta o tarjeta llega con el módulo Bancos; por ahora
    // este campo solo declara si el gasto se difirió a una tarjeta de crédito.
    const accountPreview = paidWithCreditActive ? "Tarjeta de crédito" : "Efectivo o débito";
    const accountHasValue = paidWithCreditActive;
    const datePreview = formatNotesDateTime(date) || "Selecciona fecha y hora";

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="relative mx-auto w-full max-w-lg">
            <div className="space-y-3 pb-24">
                <TransactionTypeChips value={type} onChange={setType} />

                <AmountHeroInput amount={amount} onChange={setAmount} currency={currency} />

                {/* Description */}
                <AccordionField
                    icon={<FileText className="h-4 w-4" />}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Descripción"
                    preview={description || "Ej. Compra en supermercado"}
                    hasValue={!!description}
                    expanded={expanded === "description"}
                    onToggle={() => toggle("description")}
                >
                    <Input
                        id="description"
                        name="description"
                        type="text"
                        maxLength={MAX_DESCRIPTION}
                        placeholder="Ej. Compra en supermercado"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        autoComplete="off"
                        autoFocus
                    />
                    <div className="mt-1 text-right text-[11px] text-text-tertiary">{description.length}/{MAX_DESCRIPTION}</div>
                </AccordionField>

                {/* Institution */}
                <AccordionField
                    icon={<Building2 className="h-4 w-4" />}
                    iconClass="bg-blue-500/15 text-blue-500"
                    label="Institución"
                    preview={institutionName || "Ej. Banco de Chile, Sodexo, Amazon"}
                    hasValue={!!institutionName}
                    expanded={expanded === "institution"}
                    onToggle={() => toggle("institution")}
                >
                    <InstitutionPicker
                        institutions={institutions}
                        institutionTypes={institutionTypes}
                        value={institutionName}
                        onSelect={setInstitutionName}
                        onInstitutionsChange={setInstitutions}
                        query={institutionQuery}
                        onQueryChange={setInstitutionQuery}
                        pendingEdit={pendingInstitutionEdit}
                        onPendingEditChange={setPendingInstitutionEdit}
                    />
                </AccordionField>

                {/* Forma de pago */}
                <AccordionField
                    icon={<Landmark className="h-4 w-4" />}
                    iconClass="bg-emerald-500/15 text-emerald-500"
                    label="Forma de pago"
                    preview={accountPreview}
                    hasValue={accountHasValue}
                    expanded={expanded === "account"}
                    onToggle={() => toggle("account")}
                >
                    {creditEligible && (
                        <div className={cn(
                            "mt-3 flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                            paidWithCredit ? "border-accent-primary/50 bg-accent-primary/5" : "border-border/40 bg-bg-secondary/40",
                        )}>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-primary/15 text-accent-primary">
                                    <CreditCard className="h-4 w-4" />
                                </div>
                                <span className="text-sm leading-tight text-text-primary">Pagado con<br />tarjeta de crédito</span>
                            </div>
                            <Switch checked={paidWithCredit} onChange={setPaidWithCredit} label="Pagado con tarjeta de crédito" />
                        </div>
                    )}
                </AccordionField>

                {/* Category */}
                <AccordionField
                    icon={<Tag className="h-4 w-4" />}
                    iconClass="bg-amber-500/15 text-amber-500"
                    label="Categoría"
                    preview={categoryName || "Ej. Alimentación, Transporte, Servicios"}
                    hasValue={!!categoryName}
                    expanded={expanded === "category"}
                    onToggle={() => toggle("category")}
                >
                    <CategoryPicker
                        categories={categories}
                        value={categoryName}
                        onSelect={setCategoryName}
                        onCategoriesChange={setCategories}
                        query={categoryQuery}
                        onQueryChange={setCategoryQuery}
                    />
                </AccordionField>

                {/* Date & time (single field) */}
                <AccordionField
                    icon={<Calendar className="h-4 w-4" />}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Fecha y hora"
                    preview={datePreview}
                    hasValue={!!date}
                    expanded={expanded === "date"}
                    onToggle={() => toggle("date")}
                >
                    <DateTimeStepInput id="date" value={date} onChange={setDate} minuteStep={5} required />
                </AccordionField>

                {/* Notes */}
                <AccordionField
                    icon={<MessageSquare className="h-4 w-4" />}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Notas (opcional)"
                    preview={notes || "Ej. Registro de gasto"}
                    hasValue={!!notes}
                    expanded={expanded === "notes"}
                    onToggle={() => toggle("notes")}
                >
                    <Textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        maxLength={MAX_NOTES}
                        placeholder="Se completa automáticamente con los datos del formulario. Puedes editarlo libremente."
                        value={notes}
                        onChange={(e) => {
                            const val = e.target.value;
                            setNotes(val);
                            setNotesEdited(val.trim().length > 0);
                        }}
                        autoComplete="off"
                    />
                    <div className="mt-1 text-right text-[11px] text-text-tertiary">{notes.length}/{MAX_NOTES}</div>
                </AccordionField>
            </div>

            {/* Floating save button — always visible */}
            <StickyActionBar>
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                >
                    {isSubmitting ? "Guardando..." : "Guardar transacción"}
                </Button>
            </StickyActionBar>
        </form>
    );
}
