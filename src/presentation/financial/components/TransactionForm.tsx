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
import { useTransactionFormOptions } from "../hooks/useTransactionFormOptions";
import { FinancialTransactionType } from "@/domain/entities/financial";
import { financialOfflineStore } from "@/infrastructure/offline/financial-offline-store";
import { InstitutionPicker, type PendingInstitutionEdit } from "./InstitutionPicker";
import { CategoryPicker } from "./CategoryPicker";
import { TransactionTypeChips } from "./TransactionTypeChips";
import { AmountHeroInput } from "./AmountHeroInput";
import { AccountSelect } from "./AccountSelect";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { toDateTimeLocalValue, isoToWallClockInput, wallClockInputToISO, roundToNearestFiveMinutes } from "@/lib/date-range";
import { Building2, Landmark, FileText, CreditCard, Calendar, MessageSquare, Tag } from "lucide-react";

/** Types for which "paid with credit card" is a meaningful, editable flag. */
const CREDIT_ELIGIBLE_TYPES: readonly FinancialTransactionType[] = ["EXPENSE"];

// Lowercase type labels for natural-reading auto notes.
const NOTE_TYPE_LABELS: Record<string, string> = {
    EXPENSE: "gasto",
    INCOME: "ingreso",
    TRANSFER: "transferencia",
    WITHDRAWAL: "retiro",
};

const MAX_DESCRIPTION = 120;
const MAX_NOTES = 200;

/** Accordion section ids. Only one may be expanded at a time (or none). */
type SectionId = "description" | "institution" | "account" | "category" | "date" | "notes";

/** Format a datetime-local string as "DD/MM/YYYY HH:mm". */
function formatNotesDateTime(dtLocal: string): string {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface AutoNotesInput {
    type: string;
    description: string;
    institutionName: string;
    amount: string;
    date: string;
    accountName: string;
}

/** Build the auto-generated notes sentence from the current form fields. */
function buildAutoNotes(p: AutoNotesInput): string {
    const typeLabel = NOTE_TYPE_LABELS[p.type] ?? p.type.toLowerCase();
    let s = `Registro de ${typeLabel}`;
    if (p.description.trim()) s += ` por ${p.description.trim()}`;
    if (p.institutionName.trim()) s += ` en ${p.institutionName.trim()}`;
    if (p.amount && Number(p.amount) > 0) s += ` por un monto de $${p.amount}`;
    const dateStr = formatNotesDateTime(p.date);
    if (dateStr) s += ` el ${dateStr}`;
    if (p.accountName.trim()) s += ` desde la cuenta ${p.accountName.trim()}`;
    return s;
}

export function TransactionForm() {
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
    const [accountName, setAccountName] = useState("");
    const [categoryName, setCategoryName] = useState("");
    const [paidWithCredit, setPaidWithCredit] = useState(false);

    // Pickers' options come from a single resilient loader (see the hook): a
    // partial failure used to leave them silently empty.
    const {
        institutions,
        institutionTypes,
        accounts,
        categories,
        error: optionsError,
        setInstitutions,
        setCategories,
    } = useTransactionFormOptions();
    const accountsList = accounts.map(a => a.name);

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
                    const draftAccount = data.accountName || "";
                    const draftDate = isoToWallClockInput(data.date) ?? "";

                    if (data.type) setType(data.type);
                    if (data.amount) setAmount(draftAmount);
                    if (data.description) setDescription(draftDescription);
                    if (draftDate) setDate(draftDate);
                    if (data.institutionName) setInstitutionName(draftInstitution);
                    if (data.accountName) setAccountName(draftAccount);
                    if (data.categoryName) setCategoryName(data.categoryName);
                    if (data.paidWithCredit) setPaidWithCredit(Boolean(data.paidWithCredit));

                    if (data.notes) {
                        const draftAuto = buildAutoNotes({
                            type: draftType,
                            description: draftDescription,
                            institutionName: draftInstitution,
                            amount: draftAmount,
                            date: draftDate,
                            accountName: draftAccount,
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
                        accountName,
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
    }, [type, amount, currency, description, date, notes, institutionName, accountName, categoryName, paidWithCredit]);

    // Auto-generate the notes until the user customises them.
    const autoNotes = useMemo(
        () => buildAutoNotes({ type, description, institutionName, amount, date, accountName }),
        [type, description, institutionName, amount, date, accountName],
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
            description: description.trim() || undefined,
            date: wallClockInputToISO(date)!,
            notes: notes || undefined,
            institutionName: institutionName || undefined,
            accountName: accountName || undefined,
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
            } finally {
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
            }
        } catch (error) {
            try {
                await financialOfflineStore.drafts.add(`draft_${Date.now()}`, transactionData);
                toast.success("Error de red. Guardado localmente para sincronización futura.", { id: "tx-network-fallback-success" });
                router.push("/financial/transactions");
                router.refresh();
            } catch (e) {
                toast.error("Ocurrió un error inesperado y no se pudo guardar localmente.", { id: "tx-network-fallback-error" });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Collapsed previews
    const paidWithCreditActive = paidWithCredit && creditEligible;
    const accountPreview = accountName
        ? (paidWithCreditActive ? `${accountName} · Tarjeta de crédito` : accountName)
        : (paidWithCreditActive ? "Tarjeta de crédito" : "Ej. Ahorros Múltiple, Tarjeta Visa");
    const accountHasValue = !!accountName || paidWithCreditActive;
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

                {/* Account (with paid-with-credit inside) */}
                <AccordionField
                    icon={<Landmark className="h-4 w-4" />}
                    iconClass="bg-emerald-500/15 text-emerald-500"
                    label="Cuenta"
                    preview={accountPreview}
                    hasValue={accountHasValue}
                    expanded={expanded === "account"}
                    onToggle={() => toggle("account")}
                >
                    <AccountSelect id="accountName" accounts={accountsList} value={accountName} onChange={setAccountName} />

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
