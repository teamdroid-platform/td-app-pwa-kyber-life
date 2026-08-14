"use client";

import { useState, useEffect, useRef } from "react";
import { FinancialTransaction, FinancialTransactionType } from "@/domain/entities/financial";
import { getTransactionDisplayTitle } from "@/lib/financial-utils";
import type { ScannedAccountView } from "@/application/services/bank-service";
import { ScannedAccountsPanel } from "@/presentation/bank/components/ScannedAccountsPanel";
import { AuditTrail } from "./AuditTrail";
import { DuplicateResolver } from "./DuplicateResolver";
import { OriginStatsViewer } from "./OriginStatsViewer";
import { History, Calendar, Edit2, Undo2, Check, Sparkles, Building2, Tags, FileText, CreditCard, Landmark, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FieldCard } from "@/components/ui/field-card";
import { AccordionField } from "@/components/ui/accordion-field";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { DateTimeStepInput } from "@/components/ui/datetime-step-input";
import { useScrollFieldIntoView } from "@/hooks/use-scroll-field-into-view";
import { toast } from "sonner";
import { updateTransactionAction, getUniqueTagsAction } from "@/app/actions/financial-transactions";
import { updateInstitutionAction } from "@/app/actions/financial-settings";
import { useTransactionFormOptions } from "../hooks/useTransactionFormOptions";
import { InstitutionPicker, type PendingInstitutionEdit } from "./InstitutionPicker";
import { CategoryPicker } from "./CategoryPicker";
import { TransactionTypeChips, resolveTransactionTypeOption } from "./TransactionTypeChips";
import { AmountHeroInput } from "./AmountHeroInput";
import { cn } from "@/lib/utils";
import { isoToWallClockInput, wallClockInputToISO } from "@/lib/date-range";
import { TagInput } from "@/components/ui/tag-input";
import { FINANCIAL_FLAGS } from "@/lib/feature-flags";
import { TransactionEditWizard } from "./transaction-wizard/TransactionEditWizard";
import { TransactionDetailSummary } from "./TransactionDetailSummary";
import type { WizardScreen } from "../hooks/useTransactionWizard";

// ─── Helpers ──────────────────────────────────────────────────

/** Types for which "paid with credit card" is a meaningful, editable flag. */
const CREDIT_ELIGIBLE_TYPES: readonly FinancialTransactionType[] = ["EXPENSE"];

/** Accordion section ids used while editing. Only one may be expanded at a time (or none). */
type SectionId = "description" | "institution" | "account" | "category" | "date" | "notes" | "tags";

const STATUS_CONFIG: Record<string, { variant: "warning" | "success" | "danger" | "outline" | "default"; label: string }> = {
    DETECTED: { variant: "warning", label: "Nueva" },
    REVIEWED: { variant: "warning", label: "Revisada" },
    CONFIRMED: { variant: "success", label: "Confirmada" },
    REJECTED: { variant: "danger", label: "Rechazada" },
    DUPLICATE: { variant: "warning", label: "Duplicada" },
    ARCHIVED: { variant: "outline", label: "Archivada" },
    MANUAL: { variant: "outline", label: "Manual" },
    DELETED: { variant: "danger", label: "Eliminada" },
};

function formatAmount(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

function formatDate(dateStr: string): string {
    // The stored `date` is a literal wall-clock value (tagged UTC), so format it
    // in UTC to show exactly what's stored — no device-timezone shift.
    return new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(new Date(dateStr));
}

/** Format a datetime-local ("YYYY-MM-DDTHH:mm") string as "DD/MM/YYYY HH:mm", for the collapsed accordion preview. */
function formatDateTimeLocalPreview(dtLocal: string): string {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractContext(tx: FinancialTransaction): string {
    return tx.notes || "";
}

// ─── Component ────────────────────────────────────────────────
interface TransactionDetailClientProps {
    initialTransaction: FinancialTransaction;
    /** Origen y destino según el módulo Bancos, resueltos en el servidor. */
    bankAccounts?: ScannedAccountView[];
}

export function TransactionDetailClient({
    initialTransaction, bankAccounts = [],
}: TransactionDetailClientProps) {
    const router = useRouter();
    const [transaction, setTransaction] = useState<FinancialTransaction>(initialTransaction);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    /** Which field the editor should open on, when entered from a detail row. */
    const [editFocus, setEditFocus] = useState<WizardScreen | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    const formRef = useRef<HTMLDivElement>(null);
    useScrollFieldIntoView(formRef);

    // Which accordion section is open while editing (only one or none) — same
    // pattern as the create-transaction form.
    const [expandedSection, setExpandedSection] = useState<SectionId | null>(null);
    const toggleSection = (id: SectionId) => {
        // Re-entering a search section always starts with a blank query; the
        // already-selected value is preserved and shown first in the grid.
        if (id === "institution" && expandedSection !== "institution") setInstitutionQuery("");
        if (id === "category" && expandedSection !== "category") setCategoryQuery("");
        setExpandedSection((cur) => (cur === id ? null : id));
    };

    // Pickers' options come from a single resilient loader (see the hook): a
    // partial failure used to leave them silently empty.
    const {
        institutions,
        institutionTypes,
        categories,
        error: optionsError,
        setInstitutions,
        setCategories,
    } = useTransactionFormOptions((opts) => {
        // Fall back to what the server already resolved, so a transaction whose
        // category/institution isn't in the lists doesn't lose its name.
        const instName = opts.institutions.find(i => i.id === transaction.institutionId)?.name
            || transaction.institutionName || transaction.merchant || "";
        const catName = opts.categories.find(c => c.id === transaction.categoryId)?.name
            || transaction.categoryName || "";

setDisplayNames({ institution: instName, category: catName });
        setEditState(prev => ({
            ...prev,
            merchant: instName,
            institutionName: instName,
            categoryName: catName,
        }));
    });

    const [institutionQuery, setInstitutionQuery] = useState("");
    const [categoryQuery, setCategoryQuery] = useState("");

    // Institution inline-edit (staged; persisted when the edit is confirmed).
    const [pendingInstitutionEdit, setPendingInstitutionEdit] = useState<PendingInstitutionEdit | null>(null);

    // Seeded from the transaction the server already resolved: it arrives with
    // `institutionName` and `categoryName` filled in, so the screen shouldn't
    // render "Sin categoría" and then pop once the option lists land.
    const [displayNames, setDisplayNames] = useState({
        institution: transaction.institutionName || transaction.merchant || "",
        category: transaction.categoryName || "",
    });

    // Tag suggestions only feed the legacy edit form's TagInput. Behind the
    // flag the editor fetches its own, so asking for them here would spend a
    // request — and its own session round-trip — on the detail's critical path
    // for something nothing renders.
    useEffect(() => {
        if (FINANCIAL_FLAGS.WIZARD_ENABLED) return;
        const fetchTags = async () => {
            const res = await getUniqueTagsAction();
            if (res.success && Array.isArray(res.data)) {
                setSuggestions(res.data as string[]);
            }
        };
        fetchTags();
    }, [transaction]);

    // Never let a failed load look like "you have no categories/institutions".
    useEffect(() => {
        if (optionsError) toast.error("No se pudieron cargar categorías e instituciones. Reintenta.");
    }, [optionsError]);

    const [editState, setEditState] = useState({
        description: transaction.description || "",
        merchant: transaction.merchant || "",
        institutionName: "",
        categoryName: "",
        type: transaction.type || "EXPENSE",
        amount: transaction.amount ?? null,
        date: isoToWallClockInput(transaction.date) ?? "",
        notes: extractContext(transaction),
        tags: transaction.tags || [],
        paidWithCredit: transaction.paidWithCredit ?? false,
    });

    const handleDuplicateResolved = () => {
        router.refresh();
    };

    const updateEditState = (field: keyof typeof editState, value: any) => {
        setEditState((prev) => ({ ...prev, [field]: value }));
    };

    const toggleEdit = () => {
        if (!isEditing) {
            setEditState({
                description: transaction.description || getTransactionDisplayTitle(transaction),
                merchant: displayNames.institution,
                institutionName: displayNames.institution,
                categoryName: displayNames.category,
                type: transaction.type || "EXPENSE",
                amount: transaction.amount ?? null,
                date: isoToWallClockInput(transaction.date) ?? "",
                notes: extractContext(transaction),
                tags: transaction.tags || [],
                paidWithCredit: transaction.paidWithCredit ?? false,
            });
            // Entering edit mode always starts with every section collapsed and a
            // blank search in the pickers — same as opening the create form.
            setExpandedSection(null);
            setInstitutionQuery("");
            setCategoryQuery("");
        }
        setIsEditing(!isEditing);
    };

    const handleSaveEdit = async () => {
        setIsLoading(true);
        try {
            // Persist a staged institution edit first (deferred until confirm).
            if (pendingInstitutionEdit && editState.institutionName.trim().toLowerCase() === pendingInstitutionEdit.name.trim().toLowerCase()) {
                await updateInstitutionAction(pendingInstitutionEdit.id, {
                    name: pendingInstitutionEdit.name,
                    institutionTypeId: pendingInstitutionEdit.institutionTypeId,
                    description: pendingInstitutionEdit.description,
                });
            }

            const res = await updateTransactionAction(transaction.id!, {
                description: editState.description.trim() || undefined,
                merchant: editState.merchant || editState.institutionName,
                institutionId: null, // Force backend to resolve by name
                institutionName: editState.institutionName || undefined,
                categoryId: null,
                categoryName: editState.categoryName || undefined,
                type: editState.type,
                amount: editState.amount,
                date: wallClockInputToISO(editState.date),
                notes: editState.notes,
                tags: editState.tags,
                paidWithCredit: editState.type === "EXPENSE" ? editState.paidWithCredit : undefined,
            });
            if (res.success && res.data) {
                toast.success("Transacción actualizada exitosamente");
                setTransaction(res.data);
                setIsEditing(false);
                router.refresh(); // Refresh to update server components
                // Also update local suggestions if there are new tags
                const newTags = editState.tags.filter(t => !suggestions.includes(t));
                if (newTags.length > 0) {
                    setSuggestions(prev => [...prev, ...newTags]);
                }
            } else {
                toast.error(res.error || "Error al actualizar la transacción");
            }
        } catch {
            toast.error("Error inesperado al actualizar");
        } finally {
            setIsLoading(false);
        }
    };

    const isIncome = ["INCOME", "DEPOSIT", "REFUND"].includes(transaction.type);
    const statusCfg = STATUS_CONFIG[transaction.status] ?? STATUS_CONFIG.DETECTED;
    // The expected state needs no badge; anything else does.
    const showStatus = transaction.status !== "CONFIRMED";
    const typeOption = resolveTransactionTypeOption(transaction.type);
    const displayContext = extractContext(transaction);
    const creditEligible = CREDIT_ELIGIBLE_TYPES.includes(editState.type as FinancialTransactionType);
    const canEdit = transaction.status !== "ARCHIVED";

    // Collapsed accordion previews (edit mode only)
    const paidWithCreditActive = editState.paidWithCredit && creditEligible;
    // La cuenta con la que se pagó, cuando el movimiento está atado a una del
    // módulo Bancos. Sin vínculo queda el genérico, que es todo lo que se sabe.
    const paymentSource = bankAccounts.find(a => a.role === "SOURCE");
    const accountPreview = paymentSource?.match
        ? [paymentSource.match.name, paymentSource.display].filter(Boolean).join(" · ")
        : paidWithCreditActive ? "Tarjeta de crédito" : "Efectivo o débito";
    const accountHasValue = paidWithCreditActive || !!paymentSource?.match;
    const datePreview = formatDateTimeLocalPreview(editState.date) || "Selecciona fecha y hora";

    // Behind the flag, editing is the stepped wizard: it opens on the summary
    // so correcting one value doesn't mean walking the whole record again. The
    // read-only blocks (history, duplicates, origin) stay on this screen.
    if (isEditing && FINANCIAL_FLAGS.WIZARD_ENABLED) {
        return (
            <TransactionEditWizard
                transaction={transaction}
                displayNames={displayNames}
                notes={extractContext(transaction)}
                // Set when the user tapped a specific field on the detail
                // screen: the editor opens there instead of on the summary.
                initialFocus={editFocus ?? undefined}
                bankAccounts={bankAccounts}
                onSaved={(updated) => {
                    setTransaction(updated);
                    setIsEditing(false);
                    setEditFocus(null);
                    router.refresh();
                }}
                onCancel={() => {
                    setIsEditing(false);
                    setEditFocus(null);
                }}
            />
        );
    }

    /**
     * Read-only detail, behind the flag: the same hero and rows as the editor's
     * summary, so one transaction doesn't look like two different products, and
     * every row opens the editor on its own field.
     */
    if (FINANCIAL_FLAGS.WIZARD_ENABLED) {
        return (
            <div className="flex flex-col gap-4">
                <DuplicateResolver
                    transactionId={transaction.id!}
                    isPossibleDuplicate={transaction.possibleDuplicate && transaction.status !== 'DUPLICATE'}
                    onResolved={handleDuplicateResolved}
                />

                {showStatus && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusCfg.variant} className="rounded-full px-3 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                            {statusCfg.label}
                        </Badge>
                    </div>
                )}

                <TransactionDetailSummary
                    transaction={transaction}
                    displayNames={displayNames}
                    notes={displayContext}
                    date={isoToWallClockInput(transaction.date) ?? ""}
                    onEditField={(screen) => {
                        if (!canEdit) return;
                        setEditFocus(screen === "summary" ? null : screen);
                        setIsEditing(true);
                    }}
                />

                {canEdit && (
                    <StickyActionBar>
                        <Button
                            onClick={() => {
                                setEditFocus(null);
                                setIsEditing(true);
                            }}
                            className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                        >
                            <Edit2 className="h-4 w-4 mr-2" /> Editar transacción
                        </Button>
                    </StickyActionBar>
                )}

                <div className="rounded-2xl border border-border/40 bg-bg-secondary/50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                        <History className="h-4 w-4 text-accent-primary/70" />
                        Historial de auditoría
                    </div>
                    <AuditTrail transactionId={transaction.id!} />
                </div>

                <OriginStatsViewer originStats={transaction.originStats as Record<string, unknown>} />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">

                <DuplicateResolver
                    transactionId={transaction.id!}
                    isPossibleDuplicate={transaction.possibleDuplicate && transaction.status !== 'DUPLICATE'}
                    onResolved={handleDuplicateResolved}
                />

                {/* ── Main Details ──────────────────────────────── */}
                <div
                    ref={formRef}
                    className={cn(
                        "relative space-y-3 overflow-hidden rounded-3xl border border-border/50 bg-bg-secondary/30 p-4 sm:p-5",
                        isLoading && "pointer-events-none opacity-60",
                    )}
                >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent-primary/60 to-accent-primary/10" aria-hidden="true" />

                    {/* "Confirmada" is what a transaction is expected to be, so
                        saying it spends a row to tell the user nothing. Only a
                        state worth noticing earns the space. */}
                    {(showStatus || isEditing) && (
                        <div className="flex flex-wrap items-center gap-2">
                            {showStatus && (
                                <Badge variant={statusCfg.variant} className="rounded-full px-3 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                                    {statusCfg.label}
                                </Badge>
                            )}
                            {isEditing && (
                                <Badge variant="outline" className="rounded-full px-3 py-0.5 text-[10px] uppercase tracking-[0.14em] border-accent-primary/50 text-accent-primary">
                                    Modo Edición
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Tipo de operación — quick-pick chips, only while editing (same as the create form's top). */}
                    {isEditing && (
                        <TransactionTypeChips value={editState.type as FinancialTransactionType} onChange={(v) => updateEditState("type", v)} />
                    )}

                    {/* Monto */}
                    {isEditing ? (
                        <AmountHeroInput
                            amount={editState.amount != null ? String(editState.amount) : ""}
                            onChange={(v) => updateEditState("amount", v ? parseFloat(v) : null)}
                            currency={transaction.currency}
                        />
                    ) : (
                        // Amount and type read as one fact, so they sit together —
                        // same pairing the wizard's summary uses.
                        <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/40 bg-bg-secondary/50 p-4">
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-text-tertiary">Monto ({transaction.currency})</p>
                                <div className={cn("mt-1 text-3xl font-bold tracking-tighter sm:text-4xl", isIncome && "text-emerald-500")}>
                                    {isIncome ? "+" : ""}{formatAmount(transaction.amount, transaction.currency)}
                                </div>
                            </div>
                            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                <typeOption.Icon className={cn("h-3.5 w-3.5", typeOption.color)} />
                                {typeOption.label}
                            </span>
                        </div>
                    )}

                    {/* Descripción */}
                    {isEditing ? (
                        <AccordionField
                            icon={<FileText className="h-4 w-4" />}
                            iconClass="bg-accent-primary/15 text-accent-primary"
                            label="Descripción"
                            preview={editState.description || "Ej. Compra en supermercado"}
                            hasValue={!!editState.description}
                            expanded={expandedSection === "description"}
                            onToggle={() => toggleSection("description")}
                        >
                            <Input
                                value={editState.description}
                                onChange={(e) => updateEditState("description", e.target.value)}
                                placeholder="Descripción de la transacción"
                                autoFocus
                            />
                        </AccordionField>
                    ) : (
                        <FieldCard icon={<FileText className="h-4 w-4" />} iconClass="bg-accent-primary/15 text-accent-primary" label="Descripción">
                            <p className="text-base font-bold text-text-primary">{getTransactionDisplayTitle(transaction)}</p>
                        </FieldCard>
                    )}

                    {/* Institución */}
                    {isEditing ? (
                        <AccordionField
                            icon={<Building2 className="h-4 w-4" />}
                            iconClass="bg-blue-500/15 text-blue-500"
                            label="Institución"
                            preview={editState.institutionName || "Ej. Banco de Chile, Sodexo, Amazon"}
                            hasValue={!!editState.institutionName}
                            expanded={expandedSection === "institution"}
                            onToggle={() => toggleSection("institution")}
                        >
                            <InstitutionPicker
                                institutions={institutions}
                                institutionTypes={institutionTypes}
                                value={editState.institutionName}
                                onSelect={(name) => { updateEditState("institutionName", name); updateEditState("merchant", name); }}
                                onInstitutionsChange={setInstitutions}
                                query={institutionQuery}
                                onQueryChange={setInstitutionQuery}
                                pendingEdit={pendingInstitutionEdit}
                                onPendingEditChange={setPendingInstitutionEdit}
                            />
                        </AccordionField>
                    ) : (
                        <FieldCard icon={<Building2 className="h-4 w-4" />} iconClass="bg-blue-500/15 text-blue-500" label="Institución">
                            <p className="text-base font-bold text-text-primary">{displayNames.institution || transaction.merchant || "Sin institución"}</p>
                        </FieldCard>
                    )}

                    {/* Forma de pago */}
                    {isEditing ? (
                        <AccordionField
                            icon={<Landmark className="h-4 w-4" />}
                            iconClass="bg-emerald-500/15 text-emerald-500"
                            label="Forma de pago"
                            preview={accountPreview}
                            hasValue={accountHasValue}
                            expanded={expandedSection === "account"}
                            onToggle={() => toggleSection("account")}
                        >
                            {creditEligible && (
                                <div className={cn(
                                    "mt-3 flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                                    editState.paidWithCredit ? "border-accent-primary/50 bg-accent-primary/5" : "border-border/40 bg-bg-secondary/40",
                                )}>
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-primary/15 text-accent-primary">
                                            <CreditCard className="h-4 w-4" />
                                        </div>
                                        <span className="text-sm leading-tight text-text-primary">Pagado con<br />tarjeta de crédito</span>
                                    </div>
                                    <Switch checked={editState.paidWithCredit} onChange={(v) => updateEditState("paidWithCredit", v)} label="Pagado con tarjeta de crédito" />
                                </div>
                            )}
                        </AccordionField>
                    ) : (
                        <>
                            <FieldCard icon={<Landmark className="h-4 w-4" />} iconClass="bg-emerald-500/15 text-emerald-500" label="Forma de pago">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-bold text-text-primary">
                                        {accountPreview}
                                    </p>
                                    {transaction.type === "EXPENSE" && transaction.paidWithCredit && (
                                        <Badge variant="outline" className="gap-1.5 rounded-full px-2.5 text-xs">
                                            <CreditCard className="h-3.5 w-3.5" /> Tarjeta de crédito
                                        </Badge>
                                    )}
                                </div>
                            </FieldCard>

                            {/* De dónde salió y a dónde fue, según el módulo Bancos. */}
                            <ScannedAccountsPanel accounts={bankAccounts} title="Cuentas del movimiento" />
                        </>
                    )}

                    {/* Categoría */}
                    {isEditing ? (
                        <AccordionField
                            icon={<Tag className="h-4 w-4" />}
                            iconClass="bg-amber-500/15 text-amber-500"
                            label="Categoría"
                            preview={editState.categoryName || "Ej. Alimentación, Transporte, Servicios"}
                            hasValue={!!editState.categoryName}
                            expanded={expandedSection === "category"}
                            onToggle={() => toggleSection("category")}
                        >
                            <CategoryPicker
                                categories={categories}
                                value={editState.categoryName}
                                onSelect={(v) => updateEditState("categoryName", v)}
                                onCategoriesChange={setCategories}
                                query={categoryQuery}
                                onQueryChange={setCategoryQuery}
                            />
                        </AccordionField>
                    ) : (
                        <FieldCard icon={<Tag className="h-4 w-4" />} iconClass="bg-amber-500/15 text-amber-500" label="Categoría">
                            <p className="text-base font-bold text-text-primary">{displayNames.category || "Sin categoría"}</p>
                        </FieldCard>
                    )}

                    {/* Fecha y hora */}
                    {isEditing ? (
                        <AccordionField
                            icon={<Calendar className="h-4 w-4" />}
                            iconClass="bg-accent-primary/15 text-accent-primary"
                            label="Fecha y hora"
                            preview={datePreview}
                            hasValue={!!editState.date}
                            expanded={expandedSection === "date"}
                            onToggle={() => toggleSection("date")}
                        >
                            <DateTimeStepInput value={editState.date} onChange={(v) => updateEditState("date", v)} minuteStep={5} required />
                        </AccordionField>
                    ) : (
                        <FieldCard icon={<Calendar className="h-4 w-4" />} iconClass="bg-accent-primary/15 text-accent-primary" label="Fecha y hora">
                            <p className="text-base font-bold text-text-primary">{formatDate(transaction.date)}</p>
                        </FieldCard>
                    )}

                    {/* Contexto */}
                    {isEditing ? (
                        <AccordionField
                            icon={<Sparkles className="h-4 w-4" />}
                            iconClass="bg-accent-primary/15 text-accent-primary"
                            label="Contexto"
                            preview={editState.notes || "Agrega notas o contexto"}
                            hasValue={!!editState.notes}
                            expanded={expandedSection === "notes"}
                            onToggle={() => toggleSection("notes")}
                        >
                            <Textarea
                                rows={3}
                                value={editState.notes}
                                onChange={(e) => updateEditState("notes", e.target.value)}
                                placeholder="Agrega notas o contexto..."
                            />
                        </AccordionField>
                    ) : (
                        <FieldCard icon={<Sparkles className="h-4 w-4" />} iconClass="bg-accent-primary/15 text-accent-primary" label="Contexto">
                            <p className="w-full max-w-full overflow-hidden text-sm leading-relaxed text-text-secondary whitespace-pre-wrap break-words [word-break:break-word]">
                                {displayContext || "No hay notas o contexto disponible para esta transacción."}
                            </p>
                        </FieldCard>
                    )}

                    {/* Etiquetas */}
                    {isEditing ? (
                        <AccordionField
                            icon={<Tags className="h-4 w-4" />}
                            iconClass="bg-pink-500/15 text-pink-500"
                            label="Etiquetas"
                            preview={editState.tags.length ? editState.tags.join(", ") : "Sin etiquetas"}
                            hasValue={editState.tags.length > 0}
                            expanded={expandedSection === "tags"}
                            onToggle={() => toggleSection("tags")}
                        >
                            <TagInput
                                value={editState.tags}
                                onChange={(tags) => updateEditState("tags", tags)}
                                suggestions={suggestions}
                                placeholder="Escribe y presiona Enter..."
                            />
                        </AccordionField>
                    ) : (transaction.tags?.length || 0) > 0 ? (
                        <FieldCard icon={<Tags className="h-4 w-4" />} iconClass="bg-pink-500/15 text-pink-500" label="Etiquetas">
                            <div className="flex flex-wrap gap-2">
                                {transaction.tags?.map((tag) => (
                                    <Badge key={tag} variant="outline" className="rounded-full px-3 bg-bg-secondary/50 border-border/50">{tag}</Badge>
                                ))}
                            </div>
                        </FieldCard>
                    ) : null}
                </div>

                {/* ── Floating actions — always reachable, no scrolling required ── */}
                {canEdit && (
                    <StickyActionBar>
                        {isEditing ? (
                            <div className="flex gap-3">
                                <Button variant="ghost" onClick={toggleEdit} disabled={isLoading} className="h-12 flex-1 rounded-2xl border border-border/50">
                                    <Undo2 className="h-4 w-4 mr-2" /> Cancelar
                                </Button>
                                <Button onClick={handleSaveEdit} disabled={isLoading} className="h-12 flex-1 rounded-2xl bg-accent-primary text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90">
                                    <Check className="h-4 w-4 mr-2" /> {isLoading ? "Guardando..." : "Guardar Cambios"}
                                </Button>
                            </div>
                        ) : (
                            <Button
                                onClick={toggleEdit}
                                className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                            >
                                <Edit2 className="h-4 w-4 mr-2" /> Editar transacción
                            </Button>
                        )}
                    </StickyActionBar>
                )}

                {/* ── Audit Trail ──────────────────────────────── */}
                <div className="rounded-2xl border border-border/40 bg-bg-secondary/50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                        <History className="h-4 w-4 text-accent-primary/70" />
                        Historial de auditoría
                    </div>
                    <AuditTrail transactionId={transaction.id!} />
                </div>
            </div>

            {/* ── Sidebar ──────────────────────────────── */}
            <div className="space-y-6">
                <OriginStatsViewer originStats={transaction.originStats as Record<string, unknown>} />
            </div>
        </div>
    );
}
