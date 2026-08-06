"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FinancialScannerTransaction } from "@/domain/entities/financial";
import { mapInboxTransactionAction, dismissInboxTransactionAction } from "@/app/actions/financial-inbox";
import { updateInstitutionAction } from "@/app/actions/financial-settings";
import { useTransactionFormOptions } from "../hooks/useTransactionFormOptions";
import { getUniqueTagsAction } from "@/app/actions/financial-transactions";
import { useScrollFieldIntoView } from "@/hooks/use-scroll-field-into-view";
import { createClient } from "@/infrastructure/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccordionField } from "@/components/ui/accordion-field";
import { FieldCard } from "@/components/ui/field-card";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { DateTimeStepInput } from "@/components/ui/datetime-step-input";
import { TagInput } from "@/components/ui/tag-input";
import { Switch } from "@/components/ui/switch";
import { TransactionTypeChips } from "./TransactionTypeChips";
import { AmountHeroInput } from "./AmountHeroInput";
import { AccountSelect } from "./AccountSelect";
import { InstitutionPicker, type PendingInstitutionEdit } from "./InstitutionPicker";
import { CategoryPicker } from "./CategoryPicker";
import { InstitutionMatchBadge } from "./InstitutionMatchBadge";
import { FINANCIAL_FLAGS } from "@/lib/feature-flags";
import { TransactionScanWizard, extractSummary } from "./transaction-wizard/TransactionScanWizard";
import type { InstitutionMatchInfo } from "@/lib/institution-match";
import { isoToWallClockInput, wallClockInputToISO } from "@/lib/date-range";
import type { FinancialTransactionType } from "@/domain/entities/financial";
import {
    FileText, Building2, Tag, CreditCard, DollarSign, Landmark, Calendar, Sparkles, Tags,
    FileJson, Hash, Mail, Check, X, Database, Zap
} from "lucide-react";

const CREDIT_ELIGIBLE_TYPES: readonly FinancialTransactionType[] = ["EXPENSE"];

const TYPE_OPTIONS = ["EXPENSE", "INCOME", "TRANSFER", "WITHDRAWAL"] as const;

/** Accordion section ids. Only one may be expanded at a time (or none). */
type SectionId = "description" | "institution" | "account" | "category" | "date" | "notes" | "tags" | "original";

interface ScanDetailsFormProps {
    initialData: FinancialScannerTransaction;
    /** Institution name already resolved on the server (avoids a client-side flash). */
    resolvedInstitutionName?: string;
    /** Confidence of the scanned merchant → existing institution identification. */
    institutionMatch?: InstitutionMatchInfo;
}

function normalizeType(type?: string | null): FinancialTransactionType {
    const normalized = type?.toUpperCase();
    return (TYPE_OPTIONS as readonly string[]).includes(normalized || "") ? (normalized as FinancialTransactionType) : "EXPENSE";
}

/** Format a datetime-local string as "DD/MM/YYYY HH:mm". */
function formatDateTimePreview(dtLocal: string): string {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Entry point for confirming a scanned movement.
 *
 * Behind the wizard flag this is the same stepped flow as manual capture, so
 * there is one standard instead of a third variant of the form; with the flag
 * off it is the single-screen version below.
 */
export function ScanDetailsForm(props: ScanDetailsFormProps) {
    return FINANCIAL_FLAGS.WIZARD_ENABLED ? <TransactionScanWizard {...props} /> : <LegacyScanDetailsForm {...props} />;
}

/** The original single-screen confirmation form. Superseded by the wizard. */
export function LegacyScanDetailsForm({ initialData, resolvedInstitutionName, institutionMatch }: ScanDetailsFormProps) {
    const router = useRouter();
    const [isProcessing, setIsProcessing] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);
    useScrollFieldIntoView(formRef);

    const [triggerSource, setTriggerSource] = useState<string>("Cargando...");
    
    useEffect(() => {
        if (!initialData.executionId) {
            setTriggerSource("N/A");
            return;
        }

        async function fetchExecution() {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("financial_scanner_executions")
                .select("*")
                .eq("execution_id", initialData.executionId)
                .single();

            if (data) {
                const src = data.trigger_source || data.source || data.request_payload?.trigger_source || "N/A";
                setTriggerSource(src);
            } else {
                setTriggerSource("N/A");
                if (error) console.error("Error fetching execution:", error);
            }
        }

        fetchExecution();
    }, [initialData.executionId]);

    // Which accordion section is open (only one or none).
    const [expanded, setExpanded] = useState<SectionId | null>(null);
    const toggle = (id: SectionId) => {
        // Re-entering a search section always starts with a blank query; the
        // already-selected value is preserved and shown first in the grid.
        if (id === "institution" && expanded !== "institution") setInstitutionQuery("");
        if (id === "category" && expanded !== "category") setCategoryQuery("");
        setExpanded((cur) => (cur === id ? null : id));
    };

    const [formData, setFormData] = useState(() => ({
        description: initialData.description || "",
        type: normalizeType(initialData.type),
        amount: initialData.amount !== null && initialData.amount !== undefined ? String(initialData.amount) : "",
        date: isoToWallClockInput(initialData.date) ?? "",
        notes: extractSummary(initialData) || "",
        institutionName: resolvedInstitutionName || initialData.merchant || "",
        accountName: "",
        categoryName: initialData.category || "",
        tags: [] as string[],
        paidWithCredit: false,
    }));

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
    const accountsList = accounts.map((a) => a.name);
    const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

    const [institutionQuery, setInstitutionQuery] = useState("");
    const [categoryQuery, setCategoryQuery] = useState("");

    // Institution inline-edit (staged; persisted on confirm).
    const [pendingInstitutionEdit, setPendingInstitutionEdit] = useState<PendingInstitutionEdit | null>(null);

    const creditEligible = CREDIT_ELIGIBLE_TYPES.includes(formData.type);

    useEffect(() => {
        let mounted = true;
        async function loadTags() {
            try {
                const tagsRes = await getUniqueTagsAction();
                if (mounted && tagsRes.success && Array.isArray(tagsRes.data)) {
                    setTagSuggestions(tagsRes.data as string[]);
                }
            } catch (error) {
                console.error("Error loading tags:", error);
            }
        }
        loadTags();
        return () => { mounted = false; };
    }, []);

    // Never let a failed load look like "you have no categories/institutions".
    useEffect(() => {
        if (optionsError) toast.error("No se pudieron cargar categorías e instituciones. Reintenta.");
    }, [optionsError]);

    const handleChange = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleConfirm = async (e: React.MouseEvent) => {
        e.preventDefault();

        if (!formData.description || formData.description.trim() === "") {
            toast.error("La descripción es requerida para confirmar");
            setExpanded("description");
            return;
        }

        if (!formData.institutionName || formData.institutionName.trim() === "") {
            toast.error("La institución es requerida");
            setExpanded("institution");
            return;
        }

        const parsedAmount = parseFloat(formData.amount);
        if (isNaN(parsedAmount)) {
            toast.error("El monto es requerido y debe ser un número válido");
            return;
        }

        try {
            setIsProcessing(true);

            if (pendingInstitutionEdit && formData.institutionName.trim().toLowerCase() === pendingInstitutionEdit.name.trim().toLowerCase()) {
                try {
                    await updateInstitutionAction(pendingInstitutionEdit.id, {
                        name: pendingInstitutionEdit.name,
                        institutionTypeId: pendingInstitutionEdit.institutionTypeId,
                        description: pendingInstitutionEdit.description,
                    });
                } catch {
                    toast.error("No se pudo actualizar la institución", { id: "inst-update-error" });
                    setIsProcessing(false);
                    return;
                }
            }

            const result = await mapInboxTransactionAction({
                scannerTransactionId: initialData.id,
                description: formData.description.trim(),
                type: formData.type,
                merchant: formData.institutionName || null,
                amount: isNaN(parsedAmount) ? null : parsedAmount,
                // The datetime-local value is a literal wall-clock; persist those
                // exact digits (as UTC) so saving never shifts the stored time.
                date: wallClockInputToISO(formData.date) ?? null,
                notes: formData.notes || null,
                institutionName: formData.institutionName || null,
                accountName: formData.accountName || null,
                categoryName: formData.categoryName || null,
                tags: formData.tags,
                paidWithCredit: formData.type === "EXPENSE" ? formData.paidWithCredit : null,
            });

            if (!result.success) {
                toast.error("Error al confirmar la transacción", { description: result.error, id: `scan-confirm-error-${initialData.id}` });
                return;
            }

            toast.success("Transacción guardada exitosamente", { id: `scan-confirm-success-${initialData.id}` });
            router.replace("/financial/scans");
        } catch {
            toast.error("Ocurrió un error inesperado", { id: `scan-confirm-unexpected-${initialData.id}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDismiss = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!window.confirm("¿Estás seguro de que deseas descartar este registro?")) return;

        try {
            setIsProcessing(true);
            const result = await dismissInboxTransactionAction(initialData.id!);
            if (!result.success) {
                toast.error("Error al descartar la transacción", { description: result.error, id: `scan-dismiss-error-${initialData.id}` });
                return;
            }

            toast.success("Transacción descartada", { id: `scan-dismiss-success-${initialData.id}` });
            router.replace("/financial/scans");
        } catch {
            toast.error("Ocurrió un error inesperado", { id: `scan-dismiss-unexpected-${initialData.id}` });
        } finally {
            setIsProcessing(false);
        }
    };

    // Collapsed accordion previews
    const paidWithCreditActive = formData.paidWithCredit && creditEligible;
    const accountPreview = formData.accountName
        ? (paidWithCreditActive ? `${formData.accountName} · Tarjeta de crédito` : formData.accountName)
        : (paidWithCreditActive ? "Tarjeta de crédito" : "Ej. Ahorros Múltiple, Tarjeta Visa");
    const accountHasValue = !!formData.accountName || paidWithCreditActive;
    const datePreview = formatDateTimePreview(formData.date) || "Selecciona fecha y hora";

    const originStats = initialData.originStats as Record<string, unknown> | null | undefined;
    const isEmailOrigin = originStats?.origin === "email";

    return (
        <div ref={formRef} className="relative mx-auto w-full max-w-lg">
            <div className="space-y-3 pb-24">
                <TransactionTypeChips value={formData.type} onChange={(v) => handleChange("type", v)} />

                <AmountHeroInput amount={formData.amount} onChange={(v) => handleChange("amount", v)} currency={initialData.currency || "USD"} />

                {/* Description */}
                <AccordionField
                    icon={<FileText className="h-4 w-4" />}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Descripción"
                    preview={formData.description || "Ej. Compra en supermercado"}
                    hasValue={!!formData.description}
                    expanded={expanded === "description"}
                    onToggle={() => toggle("description")}
                >
                    <Input
                        value={formData.description}
                        onChange={(e) => handleChange("description", e.target.value)}
                        placeholder="Ej. Compra en supermercado"
                        autoComplete="off"
                        autoFocus
                    />
                </AccordionField>

                {/* Institution */}
                <AccordionField
                    icon={<Building2 className="h-4 w-4" />}
                    iconClass="bg-blue-500/15 text-blue-500"
                    label="Institución"
                    badge={institutionMatch && <InstitutionMatchBadge info={institutionMatch} size={14} />}
                    preview={formData.institutionName || "Ej. Banco de Chile, Sodexo, Amazon"}
                    hasValue={!!formData.institutionName}
                    expanded={expanded === "institution"}
                    onToggle={() => toggle("institution")}
                >
                    <InstitutionPicker
                        institutions={institutions}
                        institutionTypes={institutionTypes}
                        value={formData.institutionName}
                        onSelect={(v) => handleChange("institutionName", v)}
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
                    <AccountSelect accounts={accountsList} value={formData.accountName} onChange={(v) => handleChange("accountName", v)} />

                    {creditEligible && (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-bg-secondary/40 p-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-primary/15 text-accent-primary">
                                    <CreditCard className="h-4 w-4" />
                                </div>
                                <span className="text-sm leading-tight text-text-primary">Pagado con<br />tarjeta de crédito</span>
                            </div>
                            <Switch checked={formData.paidWithCredit} onChange={(v) => handleChange("paidWithCredit", v)} label="Pagado con tarjeta de crédito" />
                        </div>
                    )}
                </AccordionField>

                {/* Category */}
                <AccordionField
                    icon={<Tag className="h-4 w-4" />}
                    iconClass="bg-amber-500/15 text-amber-500"
                    label="Categoría"
                    preview={formData.categoryName || "Ej. Alimentación, Transporte, Servicios"}
                    hasValue={!!formData.categoryName}
                    expanded={expanded === "category"}
                    onToggle={() => toggle("category")}
                >
                    <CategoryPicker
                        categories={categories}
                        value={formData.categoryName}
                        onSelect={(v) => handleChange("categoryName", v)}
                        onCategoriesChange={setCategories}
                        query={categoryQuery}
                        onQueryChange={setCategoryQuery}
                    />
                </AccordionField>

                {/* Date & time */}
                <AccordionField
                    icon={<Calendar className="h-4 w-4" />}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Fecha y hora"
                    preview={datePreview}
                    hasValue={!!formData.date}
                    expanded={expanded === "date"}
                    onToggle={() => toggle("date")}
                >
                    <DateTimeStepInput value={formData.date} onChange={(v) => handleChange("date", v)} minuteStep={5} required />
                </AccordionField>

                {/* Extracted context */}
                <AccordionField
                    icon={<Sparkles className="h-4 w-4" />}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Contexto extraído"
                    preview={formData.notes || "Sin contexto extraído"}
                    hasValue={!!formData.notes}
                    expanded={expanded === "notes"}
                    onToggle={() => toggle("notes")}
                >
                    <Textarea
                        rows={3}
                        value={formData.notes}
                        onChange={(e) => handleChange("notes", e.target.value)}
                        placeholder="Descripción o contexto de la transacción..."
                    />
                </AccordionField>

                {/* Tags */}
                <AccordionField
                    icon={<Tags className="h-4 w-4" />}
                    iconClass="bg-pink-500/15 text-pink-500"
                    label="Etiquetas"
                    preview={formData.tags.length ? formData.tags.join(", ") : "Sin etiquetas"}
                    hasValue={formData.tags.length > 0}
                    expanded={expanded === "tags"}
                    onToggle={() => toggle("tags")}
                >
                    <TagInput
                        value={formData.tags}
                        onChange={(tags) => handleChange("tags", tags)}
                        suggestions={tagSuggestions}
                        placeholder="Escribe y presiona Enter, o elige una existente..."
                    />
                </AccordionField>

                {/* Original scanned data — read-only, collapsed by default */}
                <AccordionField
                    icon={<FileJson className="h-4 w-4" />}
                    iconClass="bg-slate-500/15 text-slate-400"
                    label="Datos originales extraídos"
                    preview="Monto, categoría, correo y payload del escaneo"
                    hasValue={false}
                    expanded={expanded === "original"}
                    onToggle={() => toggle("original")}
                >
                    <div className="grid grid-cols-2 gap-2">
                        <FieldCard icon={<Database className="h-3.5 w-3.5" />} iconClass="bg-blue-500/15 text-blue-500" label="Origin (Payload)">
                            <p className="break-all font-mono text-xs text-text-secondary">
                                {String(originStats?.origin || "N/A")}
                            </p>
                        </FieldCard>
                        <FieldCard icon={<Zap className="h-3.5 w-3.5" />} iconClass="bg-purple-500/15 text-purple-500" label="Trigger Source">
                            <p className="break-all font-mono text-xs text-text-secondary">{triggerSource}</p>
                        </FieldCard>
                        <FieldCard icon={<Hash className="h-3.5 w-3.5" />} iconClass="bg-slate-500/15 text-slate-400" label="Hash / Ref">
                            <p className="break-all font-mono text-xs text-text-secondary">{initialData.hash || "N/A"}</p>
                        </FieldCard>
                        <FieldCard icon={<FileJson className="h-3.5 w-3.5" />} iconClass="bg-slate-500/15 text-slate-400" label="ID Ejecución">
                            <p className="break-all font-mono text-xs text-text-secondary">{initialData.executionId || "N/A"}</p>
                        </FieldCard>
                    </div>

                    {isEmailOrigin && (
                        <div className="mt-3 space-y-2 rounded-xl border border-border/40 bg-bg-primary/40 p-3">
                            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                                <Mail className="h-3.5 w-3.5" /> Detalles del correo
                            </p>
                            {typeof originStats?.from === "string" && (
                                <p className="break-all font-mono text-xs text-text-secondary"><span className="text-text-tertiary">De: </span>{originStats.from}</p>
                            )}
                            {typeof originStats?.to === "string" && (
                                <p className="break-all font-mono text-xs text-text-secondary"><span className="text-text-tertiary">Para: </span>{originStats.to}</p>
                            )}
                            {typeof originStats?.subject === "string" && (
                                <p className="text-xs text-text-secondary"><span className="text-text-tertiary">Asunto: </span>{originStats.subject}</p>
                            )}
                        </div>
                    )}

                    <div className="mt-3">
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">Payload (origin stats)</p>
                        <pre className="max-h-[240px] overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border/40 bg-bg-primary/40 p-3 font-mono text-[11px] text-text-secondary">
                            {originStats ? JSON.stringify(originStats, null, 2) : "Sin datos adicionales"}
                        </pre>
                    </div>
                </AccordionField>
            </div>

            {/* Floating actions — always reachable, no scrolling required */}
            <StickyActionBar>
                <div className="flex gap-3">
                    <Button variant="ghost" onClick={handleDismiss} disabled={isProcessing} className="h-12 flex-1 rounded-2xl border border-border/50">
                        <X className="h-4 w-4 mr-2" /> Descartar
                    </Button>
                    <Button onClick={handleConfirm} disabled={isProcessing} className="h-12 flex-1 rounded-2xl bg-accent-primary text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90">
                        <Check className="h-4 w-4 mr-2" /> {isProcessing ? "Procesando..." : "Confirmar"}
                    </Button>
                </div>
            </StickyActionBar>
        </div>
    );
}
