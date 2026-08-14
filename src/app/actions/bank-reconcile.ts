"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    bankIdentificationService, bankService,
    bankAccountRepository, bankCardRepository,
} from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { formatBankNumber } from "@/lib/format-bank-number";
import type { PendingGroup } from "@/application/services/bank-identification-service";

const uuid = z.string().uuid();

/** Un grupo candidato, tal como lo consume la pantalla de conciliación. */
export interface ReconcileGroup {
    /** `${prefixDigits}|${suffixDigits}`, estable entre recargas. */
    key: string;
    prefixDigits: string;
    suffixDigits: string;
    occurrences: number;
    /** Las cadenas crudas. Es la única pantalla donde salen a la superficie. */
    samples: string[];
    observationIds: string[];
    /** Identidades compatibles. Con más de una, el grupo es ambiguo. */
    candidateIds: string[];
    institutionHint: string | null;
    brand: string | null;
    accountTypeHint: string | null;
    /** La identidad a la que ya apunta, si alguna. */
    accountId: string | null;
    cardId: string | null;
    /** Por qué se ligó. Presente solo en las inferidas. */
    evidence?: string;
}

export interface ReconcileIdentity {
    id: string;
    kind: "ACCOUNT" | "CARD";
    /** Nombre y número ya formateados, listos para mostrar. */
    label: string;
}

export interface ReconcileState {
    exact: ReconcileGroup[];
    inferred: ReconcileGroup[];
    pending: ReconcileGroup[];
    /** Todas las identidades del usuario, para los selectores de los ambiguos. */
    identities: ReconcileIdentity[];
    totalMovements: number;
}

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

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

function toGroup(group: PendingGroup, evidence?: string): ReconcileGroup {
    return {
        key: `${group.prefixDigits}|${group.suffixDigits}`,
        prefixDigits: group.prefixDigits,
        suffixDigits: group.suffixDigits,
        occurrences: group.occurrences,
        samples: group.samples,
        observationIds: group.observationIds,
        candidateIds: group.candidateIds,
        institutionHint: group.institutionHint,
        brand: group.brand,
        accountTypeHint: group.accountTypeHint,
        accountId: group.accountId,
        cardId: group.cardId,
        ...(evidence ? { evidence } : {}),
    };
}

/** La frase que explica por qué se ligó un grupo con sufijo corto. */
function explainInferred(group: PendingGroup): string {
    const largo = group.candidateIds.length === 1 ? "y no hay otro candidato" : "";
    return `${group.suffixDigits} coincide con una sola identidad ${largo}`.trim();
}

export async function getReconcileStateAction() {
    return run("getReconcileState", async userId => {
        // Re-resolver primero: el backfill deja las observaciones sin parsear, y
        // una identidad creada desde el último paso puede resolver pendientes.
        await bankIdentificationService.reparseAll(userId);

        const [exact, inferred, pending, accounts, cards] = await Promise.all([
            bankIdentificationService.groupsByResolution(userId, "EXACT"),
            bankIdentificationService.groupsByResolution(userId, "INFERRED"),
            bankIdentificationService.groupsByResolution(userId, "PENDING"),
            bankAccountRepository.findByOwnerId(userId),
            bankCardRepository.findByOwnerId(userId),
        ]);

        const identities: ReconcileIdentity[] = [
            ...accounts.map(a => ({
                id: a.id, kind: "ACCOUNT" as const,
                label: `${a.name} ${formatBankNumber(a, "ACCOUNT")}`.trim(),
            })),
            ...cards.map(c => ({
                id: c.id, kind: "CARD" as const,
                label: `${c.name} ${formatBankNumber(c, "CARD")}`.trim(),
            })),
        ];

        const state: ReconcileState = {
            exact: exact.map(g => toGroup(g)),
            inferred: inferred.map(g => toGroup(g, explainInferred(g))),
            pending: pending.map(g => toGroup(g)),
            identities,
            totalMovements: [...exact, ...inferred, ...pending]
                .reduce((sum, g) => sum + g.occurrences, 0),
        };

        return state;
    });
}

const assignSchema = z.object({
    observationIds: z.array(uuid).min(1),
    kind: z.enum(["ACCOUNT", "CARD"]),
    targetId: uuid,
});

export async function assignGroupAction(input: unknown) {
    return run("assignGroup", async userId => {
        const v = assignSchema.parse(input);
        const count = await bankIdentificationService.assignGroup(
            userId, v.observationIds, { kind: v.kind, targetId: v.targetId },
        );
        revalidatePath("/financial/banks/reconcile");
        return count;
    });
}

const externalSchema = z.object({ observationIds: z.array(uuid).min(1) });

export async function markGroupExternalAction(input: unknown) {
    return run("markGroupExternal", async userId => {
        const v = externalSchema.parse(input);
        for (const id of v.observationIds) {
            await bankIdentificationService.markExternal(userId, id);
        }
        revalidatePath("/financial/banks/reconcile");
        return v.observationIds.length;
    });
}

const createIdentitySchema = z.object({
    observationIds: z.array(uuid).min(1),
    institutionId: uuid,
    name: z.string().min(1, "El nombre es requerido").max(120),
    kind: z.enum(["ACCOUNT", "CARD"]),
    accountType: z.enum(["CHECKING", "SAVINGS", "INVESTMENT"]).optional(),
    cardType: z.enum(["DEBIT", "CREDIT"]).optional(),
    /** Obligatorio para una tarjeta de débito: la cuenta de la que gasta. */
    accountId: uuid.optional().nullable(),
    lastFour: z.string().regex(/^[0-9]{1,6}$/).optional().nullable(),
    prefixDigits: z.string().regex(/^[0-9]{1,6}$/).optional().nullable(),
    brand: z.string().max(40).optional().nullable(),
    bin: z.string().regex(/^[0-9]{6}$/).optional().nullable(),
});

/** Crea la cuenta o tarjeta que describe un grupo, y liga sus observaciones. */
export async function createIdentityFromGroupAction(input: unknown) {
    return run("createIdentityFromGroup", async userId => {
        const v = createIdentitySchema.parse(input);

        const target = v.kind === "ACCOUNT"
            ? await bankService.createAccount(userId, {
                institutionId: v.institutionId,
                name: v.name,
                accountType: v.accountType ?? "SAVINGS",
                lastFour: v.lastFour ?? null,
                prefixDigits: v.prefixDigits ?? null,
            })
            : await bankService.createCard(userId, {
                institutionId: v.institutionId,
                accountId: v.cardType === "DEBIT" ? v.accountId ?? null : null,
                name: v.name,
                cardType: v.cardType ?? "CREDIT",
                brand: v.brand ?? null,
                bin: v.bin ?? null,
                lastFour: v.lastFour ?? null,
                prefixDigits: v.prefixDigits ?? null,
            });

        await bankIdentificationService.assignGroup(userId, v.observationIds, {
            kind: v.kind, targetId: target.id,
        });

        revalidatePath("/financial/banks/reconcile");
        revalidatePath("/financial/banks");
        return target;
    });
}

/**
 * Cierra la conciliación: confirma las identidades que ya tienen observaciones
 * resueltas y re-apunta el historial contra ellas.
 */
export async function confirmReconcileAction() {
    return run("confirmReconcile", async userId => {
        const confirmed = await bankIdentificationService.confirmResolvedIdentities(userId);
        const relinked = await bankService.relinkHistory(userId);

        revalidatePath("/financial/banks/reconcile");
        revalidatePath("/financial/banks");
        revalidatePath("/financial");
        return { confirmed, relinked };
    });
}
