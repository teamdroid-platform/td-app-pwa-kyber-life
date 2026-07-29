"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isoToWallClockInput, wallClockInputToISO } from "@/lib/date-range";
import { mapInboxTransactionAction, dismissInboxTransactionAction } from "@/app/actions/financial-inbox";
import type { FinancialScannerTransaction, FinancialTransactionType } from "@/domain/entities/financial";
import type { InstitutionMatchInfo } from "@/lib/institution-match";
import type { WizardValues } from "../../hooks/useTransactionWizard";
import { InstitutionMatchBadge } from "../InstitutionMatchBadge";
import { ScanOriginalData } from "../ScanOriginalData";
import { TransactionWizard } from "./TransactionWizard";

const TYPE_OPTIONS = ["EXPENSE", "INCOME", "TRANSFER", "WITHDRAWAL"] as const;

function normalizeType(type?: string | null): FinancialTransactionType {
    const normalized = type?.toUpperCase();
    return (TYPE_OPTIONS as readonly string[]).includes(normalized || "") ? (normalized as FinancialTransactionType) : "EXPENSE";
}

/**
 * The scan's own summary of the movement, which seeds the notes.
 *
 * `summary` belongs to the scanner record, not to the transaction: it is what
 * the scan extracted from the email. Falls back to the raw body or snippet so
 * a confirmation never loses the only context it had.
 */
export function extractSummary(tx: FinancialScannerTransaction): string {
    const s = tx.summary?.trim();
    if (s && s !== "null" && s !== "undefined") return s;

    const stats = tx.originStats as Record<string, unknown> | null | undefined;
    const emailBody = typeof stats?.emailBody === "string" ? stats.emailBody.trim() : "";
    if (emailBody) return `[MAIL] ${emailBody}`;

    const snippet = typeof stats?.snippet === "string" ? stats.snippet.trim() : "";
    if (snippet) return `[SNIPPET] ${snippet}`;

    return "";
}

export interface TransactionScanWizardProps {
    initialData: FinancialScannerTransaction;
    /** Institution name already resolved on the server (avoids a client-side flash). */
    resolvedInstitutionName?: string;
    /** Confidence of the scanned merchant → existing institution identification. */
    institutionMatch?: InstitutionMatchInfo;
}

/**
 * Confirming a scanned movement, through the same stepped flow as manual
 * capture — one standard instead of a third variant of the same form.
 *
 * What is specific to a scan is carried by the wizard's extension points: the
 * match confidence sits in the institution step, and the originally extracted
 * data stays consultable on the summary, right where the decision is made.
 */
export function TransactionScanWizard({ initialData, resolvedInstitutionName, institutionMatch }: TransactionScanWizardProps) {
    const router = useRouter();
    const [isDismissing, setIsDismissing] = useState(false);

    const initialValues = useMemo<WizardValues>(() => ({
        type: normalizeType(initialData.type),
        amount: initialData.amount !== null && initialData.amount !== undefined ? String(initialData.amount) : "",
        description: initialData.description || "",
        institutionName: resolvedInstitutionName || initialData.merchant || "",
        accountName: "",
        categoryName: initialData.category || "",
        paidWithCredit: false,
        date: isoToWallClockInput(initialData.date) ?? "",
        notes: extractSummary(initialData),
        tags: [],
    }), [initialData, resolvedInstitutionName]);

    const handleSubmit = async (values: WizardValues): Promise<boolean> => {
        try {
            const result = await mapInboxTransactionAction({
                scannerTransactionId: initialData.id,
                description: values.description.trim(),
                type: values.type,
                merchant: values.institutionName || null,
                amount: Number(values.amount),
                // The datetime-local value is a literal wall-clock; persist those
                // exact digits (as UTC) so saving never shifts the stored time.
                date: wallClockInputToISO(values.date) ?? null,
                notes: values.notes || null,
                institutionName: values.institutionName || null,
                accountName: values.accountName || null,
                categoryName: values.categoryName || null,
                tags: values.tags,
                paidWithCredit: values.type === "EXPENSE" ? values.paidWithCredit : null,
            });

            if (!result.success) {
                toast.error("Error al confirmar la transacción", {
                    description: result.error,
                    id: `scan-confirm-error-${initialData.id}`,
                });
                return false;
            }

            toast.success("Transacción guardada exitosamente", { id: `scan-confirm-success-${initialData.id}` });
            router.replace("/financial/scans");
            return true;
        } catch {
            toast.error("Ocurrió un error inesperado", { id: `scan-confirm-unexpected-${initialData.id}` });
            return false;
        }
    };

    const handleDismiss = async () => {
        if (!window.confirm("¿Estás seguro de que deseas descartar este registro?")) return;

        setIsDismissing(true);
        try {
            const result = await dismissInboxTransactionAction(initialData.id!);
            if (!result.success) {
                toast.error("Error al descartar la transacción", {
                    description: result.error,
                    id: `scan-dismiss-error-${initialData.id}`,
                });
                return;
            }
            toast.success("Transacción descartada", { id: `scan-dismiss-success-${initialData.id}` });
            router.replace("/financial/scans");
        } catch {
            toast.error("Ocurrió un error inesperado", { id: `scan-dismiss-unexpected-${initialData.id}` });
        } finally {
            setIsDismissing(false);
        }
    };

    return (
        <TransactionWizard
            // Opens on the summary: the values are already extracted, so the
            // task is to approve them at a glance, not to walk five steps.
            mode="confirm"
            initialValues={initialValues}
            currency={initialData.currency || "USD"}
            // Never let the auto-generated sentence overwrite the email's summary.
            notesOrigin="scan"
            submitLabel="Confirmar"
            onSubmit={handleSubmit}
            onClose={() => router.replace("/financial/scans")}
            institutionHint={institutionMatch && (
                <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-bg-secondary/40 px-3 py-2">
                    <InstitutionMatchBadge info={institutionMatch} size={14} />
                </div>
            )}
            summaryExtra={<ScanOriginalData transaction={initialData} />}
            secondaryAction={
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDismiss}
                    disabled={isDismissing}
                    className="h-10 w-full rounded-2xl border border-border/50"
                >
                    <X className="mr-2 h-4 w-4" /> Descartar
                </Button>
            }
        />
    );
}
