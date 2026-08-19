"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    bankService,
    financialScannerTransactionRepository,
    financialTransactionRepository,
} from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import {
    createInstitutionSchema, updateInstitutionSchema,
    createAccountSchema, updateAccountSchema,
    createCardSchema, updateCardSchema,
    balanceSnapshotSchema, statementTotalSchema, payStatementSchema,
    mergeInstitutionsSchema,
} from "@/lib/validators/bank-schemas";

const idSchema = z.string().uuid();

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

/**
 * Envuelve una acción con el contrato del repo: nunca lanza al cliente, y un
 * fallo de validación llega como texto legible en vez de como excepción.
 */
async function run<T>(label: string, fn: (userId: string) => Promise<T>) {
    try {
        const userId = await requireUserId();
        return { success: true as const, data: await fn(userId) };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false as const, error: formatZodError(error) };
        }
        console.error(`Error in ${label}:`, error);
        return { success: false as const, error: (error as Error).message };
    }
}

function revalidateBanks() {
    revalidatePath("/financial/banks");
}

// ─── Lecturas ────────────────────────────────────────────────

export async function getBankOverviewAction() {
    return run("getBankOverview", userId => bankService.getOverview(userId));
}

/**
 * Las cuentas de una transacción confirmada, con la forma que espera el mismo
 * panel que usa el escaneo.
 */
export async function getTransactionAccountsAction(transactionId: string) {
    return run("getTransactionAccounts", async userId => {
        const transaction = await financialTransactionRepository.findById(
            idSchema.parse(transactionId),
        );
        if (!transaction || transaction.ownerUserId !== userId) return [];

        return bankService.transactionAccounts(userId, transaction);
    });
}

/**
 * Las cuentas de un escaneo, listas para mostrar antes de confirmarlo.
 *
 * Recibe el id y no las cuentas: así lo que se lee es lo que hay guardado bajo
 * el dueño, y no lo que quien llama diga que hay. Es una consulta pura — mirar
 * un escaneo no debe crear nada en Bancos.
 */
export async function getScannedAccountsPreviewAction(scannerTransactionId: string) {
    return run("getScannedAccountsPreview", async userId => {
        const scan = await financialScannerTransactionRepository.findById(
            idSchema.parse(scannerTransactionId),
        );
        if (!scan || scan.ownerUserId !== userId) return [];

        return bankService.previewScannedAccounts(userId, scan.accounts ?? []);
    });
}

export async function getBankAccountDetailAction(accountId: string) {
    return run("getBankAccountDetail", async userId => {
        const data = await bankService.getAccountDetail(userId, idSchema.parse(accountId));
        if (!data) throw new Error("Cuenta no encontrada");
        return data;
    });
}

export async function getBankCardDetailAction(cardId: string) {
    return run("getBankCardDetail", async userId => {
        const data = await bankService.getCardDetail(userId, idSchema.parse(cardId));
        if (!data) throw new Error("Tarjeta no encontrada");
        return data;
    });
}

// ─── Instituciones ───────────────────────────────────────────

export async function createBankInstitutionAction(input: unknown) {
    return run("createBankInstitution", async userId => {
        const result = await bankService.createInstitution(userId, createInstitutionSchema.parse(input));
        revalidateBanks();
        return result;
    });
}

export async function updateBankInstitutionAction(id: string, input: unknown) {
    return run("updateBankInstitution", async userId => {
        const result = await bankService.updateInstitution(
            userId, idSchema.parse(id), updateInstitutionSchema.parse(input),
        );
        revalidateBanks();
        return result;
    });
}

export async function deleteBankInstitutionAction(id: string) {
    return run("deleteBankInstitution", async userId => {
        await bankService.deleteInstitution(userId, idSchema.parse(id));
        revalidateBanks();
        return true;
    });
}

/**
 * Unifica emisores duplicados en uno. Devuelve cuántas cuentas y tarjetas se
 * movieron para poder decirlo en el aviso: «se movieron 2 cuentas» es una
 * confirmación, «listo» no lo es.
 */
export async function mergeBankInstitutionsAction(input: unknown) {
    return run("mergeBankInstitutions", async userId => {
        const { sourceIds, targetId } = mergeInstitutionsSchema.parse(input);
        const result = await bankService.mergeInstitutions(userId, sourceIds, targetId);
        revalidateBanks();
        return result;
    });
}

// ─── Cuentas ─────────────────────────────────────────────────

export async function createBankAccountAction(input: unknown) {
    return run("createBankAccount", async userId => {
        const result = await bankService.createAccount(userId, createAccountSchema.parse(input));
        revalidateBanks();
        return result;
    });
}

export async function updateBankAccountAction(id: string, input: unknown) {
    return run("updateBankAccount", async userId => {
        const result = await bankService.updateAccount(
            userId, idSchema.parse(id), updateAccountSchema.parse(input),
        );
        revalidateBanks();
        revalidatePath(`/financial/banks/accounts/${id}`);
        return result;
    });
}

export async function deleteBankAccountAction(id: string) {
    return run("deleteBankAccount", async userId => {
        await bankService.deleteAccount(userId, idSchema.parse(id));
        revalidateBanks();
        return true;
    });
}

// ─── Tarjetas ────────────────────────────────────────────────

export async function createBankCardAction(input: unknown) {
    return run("createBankCard", async userId => {
        const result = await bankService.createCard(userId, createCardSchema.parse(input));
        revalidateBanks();
        return result;
    });
}

export async function updateBankCardAction(id: string, input: unknown) {
    return run("updateBankCard", async userId => {
        const result = await bankService.updateCard(
            userId, idSchema.parse(id), updateCardSchema.parse(input),
        );
        revalidateBanks();
        revalidatePath(`/financial/banks/cards/${id}`);
        return result;
    });
}

export async function deleteBankCardAction(id: string) {
    return run("deleteBankCard", async userId => {
        await bankService.deleteCard(userId, idSchema.parse(id));
        revalidateBanks();
        return true;
    });
}

// ─── Saldos y estados de cuenta ──────────────────────────────

export async function registerBalanceSnapshotAction(input: unknown) {
    return run("registerBalanceSnapshot", async userId => {
        const v = balanceSnapshotSchema.parse(input);
        const result = await bankService.registerBalanceSnapshot(
            userId, v.accountId, v.balance, v.asOf, v.note ?? undefined,
        );
        revalidateBanks();
        revalidatePath(`/financial/banks/accounts/${v.accountId}`);
        return result;
    });
}

export async function setStatementTotalAction(input: unknown) {
    return run("setStatementTotal", async userId => {
        const v = statementTotalSchema.parse(input);
        const result = await bankService.setStatementTotal(userId, v.statementId, v.totalAmount);
        revalidateBanks();
        return result;
    });
}

export async function payStatementAction(input: unknown) {
    return run("payStatement", async userId => {
        const v = payStatementSchema.parse(input);
        const result = await bankService.payStatement(
            userId, v.statementId, v.sourceAccountId, v.amount, v.date,
        );
        revalidateBanks();
        // El pago es un gasto real, así que también mueve el dashboard financiero.
        revalidatePath("/financial");
        revalidatePath("/financial/transactions");
        return result;
    });
}
