"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { wallClockInputToISO } from "@/lib/date-range";
import { createTransactionAction } from "@/app/actions/financial-transactions";
import type { AiExtraction } from "@/lib/validators/ai-capture-schemas";
import type { WizardValues } from "../../hooks/useTransactionWizard";
import { collectPendingCreations, resolveEntityStatus, toWizardValues } from "../../lib/ai-extraction";
import {
    CaptureSourceNote,
    EntityStatusBadge,
    PendingCreationsNotice,
} from "../ai-capture/CaptureSummaryExtras";
import type { CaptureMethod } from "../ai-capture/CaptureMethodChooser";
import { nowValue } from "./steps/DateStep";
import { TransactionWizard } from "./TransactionWizard";

export interface TransactionAiWizardProps {
    extraction: AiExtraction;
    /** Which capture screen produced this, for the source note and the audit trail. */
    method: Exclude<CaptureMethod, "form">;
    /** The sentence the user typed, when there was one. */
    sourceText?: string;
    /** Throw the extraction away and capture again. */
    onDiscard: () => void;
}

/**
 * Confirming a dictated or written movement.
 *
 * Structurally the same deal as the scan flow: the values already exist, so the
 * wizard opens on the summary and the task is to approve or correct, not to
 * re-enter. What is specific to this flow rides on the summary decorations —
 * which records are about to be created, and what the extraction was built from.
 *
 * Nothing is written until the user confirms; extracting is a read.
 */
export function TransactionAiWizard({ extraction, method, sourceText, onDiscard }: TransactionAiWizardProps) {
    const router = useRouter();

    // `nowValue()` is read once, when the extraction arrives: re-reading it on
    // every render would make an untouched date drift while the user reviews.
    const { values: initialValues, currency } = useMemo(
        () => toWizardValues(extraction, { fallbackDate: nowValue() }),
        [extraction],
    );

    const handleSubmit = async (values: WizardValues): Promise<boolean> => {
        try {
            const result = await createTransactionAction({
                type: values.type,
                status: "MANUAL",
                amount: Number(values.amount),
                currency,
                description: values.description.trim(),
                date: wallClockInputToISO(values.date)!,
                notes: values.notes || undefined,
                institutionName: values.institutionName || undefined,
                categoryName: values.categoryName || undefined,
                // Sent only when the extractor resolved them and the user kept
                // that choice; the service falls back to matching by name.
                institutionId: values.institutionId || undefined,
                categoryId: values.categoryId || undefined,
                    tags: values.tags.length > 0 ? values.tags : undefined,
                paidWithCredit: values.type === "EXPENSE" ? values.paidWithCredit : undefined,
                // Keeps the capture auditable: what was said, and what came back.
                originStats: {
                    source: method === "voice" ? "AI_VOICE" : "AI_TEXT",
                    capturedText: sourceText ?? null,
                    extraction,
                },
            });

            if (result.success) {
                toast.success("Transacción creada correctamente", { id: "ai-capture-success" });
                router.push("/financial/transactions");
                router.refresh();
                return true;
            }

            toast.error(result.error || "No se pudo crear la transacción", { id: "ai-capture-error" });
            return false;
        } catch {
            toast.error("Ocurrió un error inesperado. Revisa tu conexión e intenta de nuevo.", {
                id: "ai-capture-unexpected",
            });
            return false;
        }
    };

    return (
        <TransactionWizard
            mode="confirm"
            initialValues={initialValues}
            currency={currency}
            submitLabel="Crear transacción"
            onSubmit={handleSubmit}
            onClose={() => router.push("/financial/transactions")}
            decorateSummary={({ values, institutions, categories }) => {
                const statuses = {
                    institution: resolveEntityStatus(
                        values.institutionName, values.institutionId, institutions.map((i) => i.name),
                    ),
                    category: resolveEntityStatus(
                        values.categoryName, values.categoryId, categories.map((c) => c.name),
                    ),
                };

                return {
                    fieldMarkers: {
                        institutionName: <EntityStatusBadge status={statuses.institution} />,
                        categoryName: <EntityStatusBadge status={statuses.category} />,
                    },
                    extra: (
                        <>
                            <PendingCreationsNotice pending={collectPendingCreations(values, statuses)} />
                            <CaptureSourceNote method={method} text={sourceText} />
                        </>
                    ),
                };
            }}
            secondaryAction={
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onDiscard}
                    className="h-10 w-full rounded-2xl border border-border/50"
                >
                    <RotateCcw className="mr-2 h-4 w-4" /> Descartar y volver a empezar
                </Button>
            }
        />
    );
}
