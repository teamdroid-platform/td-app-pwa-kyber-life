"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { financialOfflineStore } from "@/infrastructure/offline/financial-offline-store";
import { isoToWallClockInput, wallClockInputToISO } from "@/lib/date-range";
import { createTransactionAction } from "@/app/actions/financial-transactions";
import type { FinancialTransactionType } from "@/domain/entities/financial";
import type { WizardValues } from "../../hooks/useTransactionWizard";
import { nowValue } from "./steps/DateStep";
import { TransactionWizard } from "./TransactionWizard";

const CURRENCY = "USD";

function emptyValues(): WizardValues {
    return {
        type: "EXPENSE",
        amount: "",
        description: "",
        institutionName: "",
        bankInstitutionKind: null,
        categoryName: "",
        paidWithCredit: false,
        bankSourceAccountId: null,
        bankCardId: null,
        date: nowValue(),
        notes: "",
        tags: [],
    };
}

/** Rehydrate the wizard from the last saved draft, field by field. */
function fromDraft(draft: Record<string, unknown>): WizardValues {
    const base = emptyValues();
    const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
    return {
        type: (typeof draft.type === "string" ? draft.type : base.type) as FinancialTransactionType,
        amount: draft.amount ? String(draft.amount) : "",
        description: str(draft.description, ""),
        institutionName: str(draft.institutionName, ""),
        bankInstitutionKind: (draft.bankInstitutionKind as WizardValues["bankInstitutionKind"]) ?? null,
        categoryName: str(draft.categoryName, ""),
        paidWithCredit: Boolean(draft.paidWithCredit),
        date: isoToWallClockInput(typeof draft.date === "string" ? draft.date : null) || base.date,
        notes: str(draft.notes, ""),
        tags: Array.isArray(draft.tags) ? (draft.tags as string[]) : [],
    };
}

/**
 * Create mode. Owns the one write to the server and the offline fallback the
 * previous form had: nothing about persistence changes, only how the values
 * are collected.
 */
export function TransactionCreateWizard() {
    const router = useRouter();
    const [initialValues, setInitialValues] = useState<WizardValues | null>(null);

    // Seed from the saved draft before mounting the wizard, so its state starts
    // complete rather than being patched after the first render.
    useEffect(() => {
        let active = true;
        const loadDraft = async () => {
            let values = emptyValues();
            try {
                const drafts = await financialOfflineStore.drafts.getAll();
                const latest = drafts.length > 0 ? drafts[drafts.length - 1] : null;
                if (latest) values = fromDraft(latest.data as Record<string, unknown>);
            } catch (e) {
                console.error("Failed to load transaction draft", e);
            }
            if (active) setInitialValues(values);
        };
        void loadDraft();
        return () => {
            active = false;
        };
    }, []);

    const handleSubmit = async (values: WizardValues): Promise<boolean> => {
        const payload = {
            type: values.type,
            status: "MANUAL" as const,
            amount: Number(values.amount),
            currency: CURRENCY,
            description: values.description.trim(),
            date: wallClockInputToISO(values.date)!,
            notes: values.notes || undefined,
            institutionName: values.institutionName || undefined,
            bankInstitutionKind: values.bankInstitutionKind ?? undefined,
            categoryName: values.categoryName || undefined,
            tags: values.tags.length > 0 ? values.tags : undefined,
            paidWithCredit: values.type === "EXPENSE" ? values.paidWithCredit : undefined,
            bankSourceAccountId: values.bankSourceAccountId ?? undefined,
            bankCardId: values.bankCardId ?? undefined,
        };

        const queueOffline = async (message: string, id: string): Promise<boolean> => {
            try {
                await financialOfflineStore.drafts.add(`draft_${Date.now()}`, payload);
                toast.success(message, { id });
                router.push("/financial/transactions");
                router.refresh();
                return true;
            } catch {
                toast.error("Ocurrió un error inesperado y no se pudo guardar localmente.", { id: `${id}-failed` });
                return false;
            }
        };

        if (!navigator.onLine) {
            return queueOffline("Guardado localmente. Se sincronizará cuando tengas conexión.", "tx-offline-success");
        }

        try {
            const result = await createTransactionAction(payload);
            if (result.success) {
                toast.success("Transacción creada correctamente", { id: "tx-create-success" });
                await financialOfflineStore.drafts.clear();
                router.push("/financial/transactions");
                router.refresh();
                return true;
            }
            toast.error(result.error || "No se pudo crear la transacción", { id: "tx-create-error" });
            return false;
        } catch {
            return queueOffline("Error de red. Guardado localmente para sincronización futura.", "tx-network-fallback-success");
        }
    };

    if (!initialValues) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center text-text-tertiary">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <TransactionWizard
            mode="create"
            initialValues={initialValues}
            currency={CURRENCY}
            notesOrigin="auto"
            onSubmit={handleSubmit}
            onClose={() => router.push("/financial/transactions")}
        />
    );
}
