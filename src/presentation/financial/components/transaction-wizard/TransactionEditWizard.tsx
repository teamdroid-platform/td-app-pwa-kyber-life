"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { isoToWallClockInput, wallClockInputToISO } from "@/lib/date-range";
import { getTransactionDisplayTitle } from "@/lib/financial-utils";
import { updateTransactionAction } from "@/app/actions/financial-transactions";
import type { FinancialTransaction, FinancialTransactionType } from "@/domain/entities/financial";
import type { WizardScreen, WizardValues } from "../../hooks/useTransactionWizard";
import type { ScannedAccountView } from "@/application/services/bank-service";
import { TransactionWizard } from "./TransactionWizard";

export interface TransactionEditWizardProps {
    transaction: FinancialTransaction;
    /** Names already resolved from ids by the detail screen. */
    displayNames: { institution: string; category: string };
    /** Notes/context as the detail screen resolved them (may come from a scan). */
    notes: string;
    onSaved: (updated: FinancialTransaction) => void;
    onCancel: () => void;
    /** Open straight on the field the user tapped on the detail screen. */
    initialFocus?: WizardScreen;
    /** Origen y destino según el módulo Bancos, resueltos por la pantalla. */
    bankAccounts?: ScannedAccountView[];
}

/**
 * Edit mode. Opens on the summary — editing is about correcting one value, not
 * re-capturing the record — and writes the same payload the accordion form did.
 */
export function TransactionEditWizard({
    transaction,
    displayNames,
    notes,
    onSaved,
    onCancel,
    initialFocus,
    bankAccounts = [],
}: TransactionEditWizardProps) {
    const initialValues = useMemo<WizardValues>(() => ({
        type: (transaction.type || "EXPENSE") as FinancialTransactionType,
        amount: transaction.amount != null ? String(transaction.amount) : "",
        // Older transactions may have no description; seed the title the app
        // already shows for them so the required field starts answered.
        description: transaction.description?.trim() || getTransactionDisplayTitle(transaction),
        institutionName: displayNames.institution,
        // Se declara al editar, no se arrastra: la transacción guarda el vínculo
        // con el emisor, no la clasificación del emisor.
        bankInstitutionKind: null,
        categoryName: displayNames.category,
        paidWithCredit: transaction.paidWithCredit ?? false,
        bankSourceAccountId: transaction.bankSourceAccountId ?? null,
        bankDestinationAccountId: transaction.bankDestinationAccountId ?? null,
        bankCardId: transaction.bankCardId ?? null,
        date: isoToWallClockInput(transaction.date) ?? "",
        notes,
        tags: transaction.tags ?? [],
    }), [transaction, displayNames, notes]);

    const handleSubmit = async (values: WizardValues): Promise<boolean> => {
        try {
            const res = await updateTransactionAction(transaction.id!, {
                description: values.description.trim(),
                // The merchant mirrors the institution, as it always has.
                merchant: values.institutionName || transaction.merchant,
                institutionId: null, // Force the backend to resolve by name
                institutionName: values.institutionName || undefined,
                bankInstitutionKind: values.bankInstitutionKind ?? undefined,
                scannedOwnership: values.scannedOwnership ?? undefined,
                accountId: null,
                categoryId: null,
                categoryName: values.categoryName || undefined,
                type: values.type,
                amount: Number(values.amount),
                date: wallClockInputToISO(values.date),
                notes: values.notes,
                tags: values.tags,
                paidWithCredit: values.type === "EXPENSE" ? values.paidWithCredit : undefined,
                bankSourceAccountId: values.bankSourceAccountId ?? null,
                // Explícitos y no `undefined`: quitar una cuenta es una edición
                // como cualquier otra, y el servicio distingue null de ausente.
                bankDestinationAccountId: values.bankDestinationAccountId ?? null,
                bankCardId: values.bankCardId ?? null,
            });

            if (res.success && res.data) {
                toast.success("Transacción actualizada exitosamente");
                onSaved(res.data);
                return true;
            }
            toast.error(res.error || "Error al actualizar la transacción");
            return false;
        } catch {
            toast.error("Error inesperado al actualizar");
            return false;
        }
    };

    return (
        <TransactionWizard
            mode="edit"
            initialValues={initialValues}
            currency={transaction.currency || "USD"}
            notesOrigin="manual"
            onSubmit={handleSubmit}
            onClose={onCancel}
            initialFocus={initialFocus}
            // Editar no debe perder de vista de dónde salió el dinero, ni la
            // posibilidad de corregir de quién es cada cuenta.
            scannedAccounts={bankAccounts}
        />
    );
}
