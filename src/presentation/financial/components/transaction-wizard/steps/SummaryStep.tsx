"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
    Building2, Calendar, CreditCard, DollarSign, FileText, Landmark, MessageSquare, Pencil, Tag, Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/ui/tag-input";
import { resolveTransactionTypeOption } from "../../TransactionTypeChips";
import { describePaymentSource, isGenericPaymentLabel } from "../../../lib/payment-summary";
import type { MissingField, WizardMode, WizardScreen, WizardValues } from "../../../hooks/useTransactionWizard";
import type { BankAccount, BankCard } from "@/domain/entities/bank";
import type { ScannedAccountView } from "@/application/services/bank-service";
import { AccountsTrail } from "@/presentation/bank/components/ScannedAccountsPanel";

const MAX_NOTES = 200;

function formatAmount(amount: string, currency: string): string {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed)) return "—";
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(parsed);
}

/** Format a wall-clock `YYYY-MM-DDTHH:mm` as "DD/MM/YYYY HH:mm". */
function formatDate(value: string): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Short form for the hero line: "28 jul 2026". */
function formatShortDate(value: string): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

interface RowProps {
    icon: LucideIcon;
    iconClass: string;
    label: string;
    /** Rendered value; a string is styled as text, a node is rendered as-is. */
    children: React.ReactNode;
    onEdit: () => void;
    missing?: boolean;
    changed?: boolean;
    /** Previous value, shown struck through when the row changed. */
    previous?: string;
    /** Small non-interactive marker shown after the value (e.g. a match level). */
    marker?: React.ReactNode;
}

export function SummaryRow({ icon: Icon, iconClass, label, children, onEdit, missing, changed, previous, marker }: RowProps) {
    return (
        <button
            type="button"
            onClick={onEdit}
            className={cn(
                "flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
                missing && "border-amber-500/55 bg-amber-500/10",
                changed && !missing && "border-emerald-500/50 bg-emerald-500/[0.07]",
                !missing && !changed && "border-border/40 bg-bg-secondary/50 hover:border-border",
            )}
        >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", iconClass)}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-[0.1em] text-text-tertiary">{label}</span>
                <span className={cn("flex items-center gap-1.5 text-sm", missing ? "text-amber-400" : "text-text-primary")}>
                    <span className="truncate">
                        {previous && <span className="mr-1.5 text-text-tertiary line-through">{previous}</span>}
                        {children}
                    </span>
                    {marker}
                </span>
            </span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        </button>
    );
}

export interface SummaryHeroProps {
    type: string;
    description: string;
    amount: string;
    currency: string;
    institutionName: string;
    /** Wall-clock `YYYY-MM-DDTHH:mm`. */
    date: string;
}

/**
 * What the transaction *is*, before the detail of how it got there.
 *
 * One element per row, each with the card's full width — the type used to sit
 * beside the description and force it to truncate, and pairing it with the
 * amount instead let a long figure push it out.
 *
 * Shared with the read-only detail screen so both show the same thing the same
 * way; a correction should not look like a different transaction.
 */
export function SummaryHero({ type, description, amount, currency, institutionName, date }: SummaryHeroProps) {
    const typeOption = resolveTransactionTypeOption(type);
    const sub = [institutionName, formatShortDate(date)].filter(Boolean).join(" · ");

    return (
        <div className="flex flex-col gap-1 rounded-2xl border border-accent-primary/35 bg-gradient-to-br from-accent-primary/20 to-accent-primary/5 p-4">
            <div className="flex">
                <span className="flex items-center gap-1.5 rounded-full border border-border/50 bg-bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                    <typeOption.Icon className={cn("h-3.5 w-3.5", typeOption.color)} />
                    {typeOption.label}
                </span>
            </div>
            <p className="text-sm font-semibold text-text-primary">{description.trim() || "Sin descripción"}</p>
            <p className="text-2xl font-bold tracking-tight text-text-primary">{formatAmount(amount, currency)}</p>
            {sub && <p className="text-xs text-text-tertiary">{sub}</p>}
        </div>
    );
}

/** Rows that can carry a small non-interactive marker after their value. */
export type MarkableField = "institutionName" | "categoryName";

export type FieldMarkers = Partial<Record<MarkableField, ReactNode>>;

interface SummaryStepProps {
    values: WizardValues;
    initialValues: WizardValues;
    changed: (keyof WizardValues)[];
    missing: MissingField[];
    currency: string;
    mode: WizardMode;
    onEdit: (screen: WizardScreen) => void;
    onNotesChange: (value: string) => void;
    onTagsChange: (value: string[]) => void;
    tagSuggestions: string[];
    /** Where the notes came from, so a pre-filled box doesn't look like a mistake. */
    notesOrigin: "auto" | "scan" | "manual";
    /** Read-only content appended after the rows (e.g. the scan's original data). */
    extra?: ReactNode;
    /** Cuentas y tarjetas del usuario, para nombrar con qué se pagó. */
    accounts?: readonly BankAccount[];
    cards?: readonly BankCard[];
    /** Origen y destino, mostrados como valor de la fila de pago. */
    bankAccounts?: ScannedAccountView[];
    /**
     * Markers shown beside a value — a scan's match confidence, or whether
     * confirming will reuse a record or create one.
     */
    fieldMarkers?: FieldMarkers;
}

const NOTES_ORIGIN_LABEL: Record<SummaryStepProps["notesOrigin"], string> = {
    auto: "Notas · automáticas",
    scan: "Notas · del correo",
    manual: "Notas",
};

/**
 * The wizard's centre of gravity: everything that will be written, with each
 * row a shortcut into the step that owns it.
 *
 * Notes and tags are edited in place — they are optional and the notes are
 * already auto-generated, so sending the user to a step for them would be
 * ceremony without payoff.
 */
export function SummaryStep({
    values,
    initialValues,
    changed,
    missing,
    currency,
    mode,
    onEdit,
    onNotesChange,
    onTagsChange,
    tagSuggestions,
    notesOrigin,
    extra,
    fieldMarkers,
    accounts = [],
    cards = [],
    bankAccounts = [],
}: SummaryStepProps) {
    const [openEditor, setOpenEditor] = useState<"notes" | "tags" | null>(null);

    const missingFor = (field: keyof WizardValues) => missing.some((m) => m.field === field);
    const missingLabel = (field: keyof WizardValues) => missing.find((m) => m.field === field)?.label ?? "";
    const didChange = (field: keyof WizardValues) => mode === "edit" && changed.includes(field);
    const previousOf = (field: keyof WizardValues): string | undefined => {
        if (!didChange(field)) return undefined;
        const value = initialValues[field];
        if (field === "amount") return formatAmount(String(value ?? ""), currency);
        if (field === "date") return formatDate(String(value ?? ""));
        const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
        return text.trim() || "Sin valor";
    };

    const paymentLabel = describePaymentSource(
        {
            accountId: values.bankSourceAccountId,
            cardId: values.bankCardId,
            paidWithCredit: values.paidWithCredit,
        },
        accounts,
        cards,
    );

    return (
        <>
            <SummaryHero
                type={values.type}
                description={values.description}
                amount={values.amount}
                currency={currency}
                institutionName={values.institutionName}
                date={values.date}
            />

            <div className="flex flex-col gap-1.5">
                <SummaryRow
                    icon={FileText}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Descripción · título"
                    onEdit={() => onEdit("amount")}
                    missing={missingFor("description")}
                    changed={didChange("description")}
                    previous={previousOf("description")}
                >
                    {values.description.trim() || missingLabel("description")}
                </SummaryRow>

                <SummaryRow
                    icon={DollarSign}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Monto"
                    onEdit={() => onEdit("amount")}
                    missing={missingFor("amount")}
                    changed={didChange("amount")}
                    previous={previousOf("amount")}
                >
                    {missingFor("amount") ? missingLabel("amount") : formatAmount(values.amount, currency)}
                </SummaryRow>

                <SummaryRow
                    icon={Building2}
                    iconClass="bg-blue-500/15 text-blue-500"
                    label="Institución"
                    onEdit={() => onEdit("institution")}
                    missing={missingFor("institutionName")}
                    changed={didChange("institutionName")}
                    previous={previousOf("institutionName")}
                    marker={fieldMarkers?.institutionName}
                >
                    {values.institutionName || missingLabel("institutionName")}
                </SummaryRow>

                <SummaryRow
                    icon={Tag}
                    iconClass="bg-amber-500/15 text-amber-500"
                    label="Categoría"
                    onEdit={() => onEdit("category")}
                    changed={didChange("categoryName")}
                    previous={previousOf("categoryName")}
                    marker={fieldMarkers?.categoryName}
                >
                    {values.categoryName || <span className="text-text-tertiary">Sin categoría</span>}
                </SummaryRow>

                <SummaryRow
                    icon={Landmark}
                    iconClass="bg-emerald-500/15 text-emerald-500"
                    label="Forma de pago"
                    onEdit={() => onEdit("payment")}
                    changed={didChange("paidWithCredit")}
                    // El crédito cambia cuándo pesa el gasto, así que se ve en
                    // el resumen y no solo dentro del paso.
                    marker={values.paidWithCredit ? (
                        <Badge variant="outline" className="shrink-0 gap-1 rounded-full px-2 py-0 text-[10px]">
                            <CreditCard className="h-3 w-3" /> Crédito
                        </Badge>
                    ) : undefined}
                >
                    {/* El recorrido del dinero manda cuando el escaneo lo trae:
                        responde a la misma pregunta con más detalle. Si no, la
                        cuenta elegida; y el texto genérico atenuado, porque
                        significa que no hay nada atado. */}
                    {bankAccounts.length > 0
                        ? <AccountsTrail accounts={bankAccounts} />
                        : isGenericPaymentLabel(paymentLabel)
                            ? <span className="text-text-tertiary">{paymentLabel}</span>
                            : paymentLabel}
                </SummaryRow>

                <SummaryRow
                    icon={Calendar}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Fecha"
                    onEdit={() => onEdit("date")}
                    missing={missingFor("date")}
                    changed={didChange("date")}
                    previous={previousOf("date")}
                >
                    {formatDate(values.date) || missingLabel("date")}
                </SummaryRow>

                {/* Optional fields live here, edited in place. */}
                <SummaryRow
                    icon={Tags}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Etiquetas"
                    onEdit={() => setOpenEditor((cur) => (cur === "tags" ? null : "tags"))}
                    changed={didChange("tags")}
                >
                    {values.tags.length > 0
                        ? values.tags.join(" · ")
                        : <span className="text-text-tertiary">Añadir etiquetas</span>}
                </SummaryRow>

                {openEditor === "tags" && (
                    <div className="rounded-xl border border-border/40 bg-bg-secondary/40 p-3">
                        <TagInput
                            value={values.tags}
                            onChange={onTagsChange}
                            suggestions={tagSuggestions}
                            placeholder="Escribe y presiona Enter, o elige una existente..."
                        />
                    </div>
                )}

                <SummaryRow
                    icon={MessageSquare}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label={NOTES_ORIGIN_LABEL[notesOrigin]}
                    onEdit={() => setOpenEditor((cur) => (cur === "notes" ? null : "notes"))}
                    changed={didChange("notes")}
                >
                    {values.notes.trim() || <span className="text-text-tertiary">Sin notas</span>}
                </SummaryRow>

                {openEditor === "notes" && (
                    <div className="rounded-xl border border-border/40 bg-bg-secondary/40 p-3">
                        <Textarea
                            id="notes"
                            name="notes"
                            rows={3}
                            maxLength={MAX_NOTES}
                            value={values.notes}
                            onChange={(e) => onNotesChange(e.target.value)}
                            autoComplete="off"
                        />
                        <div className="mt-1 text-right text-[11px] text-text-tertiary">
                            {values.notes.length}/{MAX_NOTES}
                        </div>
                    </div>
                )}
            </div>

            {extra}
        </>
    );
}
