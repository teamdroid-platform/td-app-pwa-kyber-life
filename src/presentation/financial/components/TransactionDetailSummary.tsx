"use client";

import {
    Building2, Calendar, CreditCard, DollarSign, FileText, Landmark, MessageSquare, Tag, Tags,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FinancialTransaction } from "@/domain/entities/financial";
import type { WizardScreen } from "../hooks/useTransactionWizard";
import type { ScannedAccountView } from "@/application/services/bank-service";
import { AccountsTrail } from "@/presentation/bank/components/ScannedAccountsPanel";
import { SummaryHero, SummaryRow } from "./transaction-wizard/steps/SummaryStep";

/** Format a wall-clock `YYYY-MM-DDTHH:mm` as "DD/MM/YYYY HH:mm". */
function formatDateTime(value: string): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface TransactionDetailSummaryProps {
    transaction: FinancialTransaction;
    /** Names already resolved on the server, so nothing shows a raw id. */
    displayNames: { institution?: string; account?: string; category?: string };
    /** The transaction's context/notes, already resolved from notes or the scan. */
    notes: string;
    /** Wall-clock date shown and handed to the wizard. */
    date: string;
    /** Open the editor on the step that owns the tapped field. */
    onEditField: (screen: WizardScreen) => void;
    /** Origen y destino según el módulo Bancos, resueltos en el servidor. */
    bankAccounts?: ScannedAccountView[];
}

/**
 * The detail screen's body, built from the very same hero and rows as the
 * editor's summary.
 *
 * Two screens describing one transaction used to look like two different
 * products — a stack of three-line cards here, compact rows there. Sharing the
 * pieces means a correction never looks like a different record.
 *
 * Every row leads into the editor **on its own field**: the detail screen's
 * only job used to be "read, then press Editar and find the field again".
 */
export function TransactionDetailSummary({
    transaction,
    displayNames,
    notes,
    date,
    onEditField,
    bankAccounts = [],
}: TransactionDetailSummaryProps) {
    const institution = displayNames.institution || transaction.merchant || "";
    const showsCredit = transaction.type === "EXPENSE" && transaction.paidWithCredit;

    return (
        <>
            <SummaryHero
                type={transaction.type}
                description={transaction.description ?? ""}
                amount={String(transaction.amount ?? "")}
                currency={transaction.currency || "USD"}
                institutionName={institution}
                date={date}
            />

            <div className="flex flex-col gap-1.5">
                <SummaryRow
                    icon={FileText}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Descripción · título"
                    onEdit={() => onEditField("amount")}
                >
                    {transaction.description?.trim() || <span className="text-text-tertiary">Sin descripción</span>}
                </SummaryRow>

                <SummaryRow
                    icon={DollarSign}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Monto"
                    onEdit={() => onEditField("amount")}
                >
                    {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: transaction.currency || "USD",
                        minimumFractionDigits: 2,
                    }).format(transaction.amount ?? 0)}
                </SummaryRow>

                <SummaryRow
                    icon={Building2}
                    iconClass="bg-blue-500/15 text-blue-500"
                    label="Institución"
                    onEdit={() => onEditField("institution")}
                >
                    {institution || <span className="text-text-tertiary">Sin institución</span>}
                </SummaryRow>

                <SummaryRow
                    icon={Tag}
                    iconClass="bg-amber-500/15 text-amber-500"
                    label="Categoría"
                    onEdit={() => onEditField("category")}
                >
                    {displayNames.category || <span className="text-text-tertiary">Sin categoría</span>}
                </SummaryRow>

                <SummaryRow
                    icon={Landmark}
                    iconClass="bg-emerald-500/15 text-emerald-500"
                    label="Cuenta"
                    onEdit={() => onEditField("payment")}
                    // Paying on credit is a property of how the account was
                    // used, so it belongs on this row rather than in a section
                    // of its own.
                    marker={showsCredit ? (
                        <Badge variant="outline" className="shrink-0 gap-1 rounded-full px-2 py-0 text-[10px]">
                            <CreditCard className="h-3 w-3" /> Crédito
                        </Badge>
                    ) : undefined}
                >
                    {/* El recorrido del dinero es el valor de la fila, no un
                        bloque aparte: la pregunta «¿qué cuenta?» se responde
                        aquí o no se responde. */}
                    {bankAccounts.length > 0
                        ? <AccountsTrail accounts={bankAccounts} />
                        : displayNames.account || <span className="text-text-tertiary">Sin cuenta</span>}
                </SummaryRow>

                <SummaryRow
                    icon={Calendar}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Fecha"
                    onEdit={() => onEditField("date")}
                >
                    {formatDateTime(date) || <span className="text-text-tertiary">Sin fecha</span>}
                </SummaryRow>

                <SummaryRow
                    icon={Tags}
                    iconClass="bg-pink-500/15 text-pink-500"
                    label="Etiquetas"
                    onEdit={() => onEditField("summary")}
                >
                    {transaction.tags?.length
                        ? transaction.tags.join(" · ")
                        : <span className="text-text-tertiary">Sin etiquetas</span>}
                </SummaryRow>

                {/* Notes get their own block rather than a one-line row: unlike
                    every other field they are a paragraph, and truncating the
                    only context a scanned movement carries would defeat it. */}
                <SummaryRow
                    icon={MessageSquare}
                    iconClass="bg-accent-primary/15 text-accent-primary"
                    label="Notas · contexto"
                    onEdit={() => onEditField("summary")}
                >
                    {notes.trim() ? "Ver abajo" : <span className="text-text-tertiary">Sin notas</span>}
                </SummaryRow>

                {notes.trim() && (
                    <div className="rounded-xl border border-border/40 bg-bg-secondary/40 p-3">
                        <p className="w-full max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary [word-break:break-word]">
                            {notes}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
