import type { UUID } from "@/domain/core";
import type { IBankIdentityMergeRepository, IdentityMergeResult } from "@/domain/repositories/bank";
import { createClient } from "@/infrastructure/supabase/server";

/**
 * La unificación en Supabase: una llamada a una función SQL que mueve todo en
 * una sola transacción. Ver `20260928120000_merge_bank_identities.sql`.
 *
 * `userId` no viaja: la función toma al dueño de `auth.uid()`, que es la
 * sesión de quien llama. Pasarlo sería ofrecer una puerta para unificar las
 * tarjetas de otro.
 */
export class SupabaseBankIdentityMergeRepository implements IBankIdentityMergeRepository {
    async mergeCards(_userId: UUID, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult> {
        return this.call("merge_bank_cards", sourceIds, targetId);
    }

    async mergeAccounts(_userId: UUID, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult> {
        return this.call("merge_bank_accounts", sourceIds, targetId);
    }

    private async call(fn: string, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult> {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc(fn, {
            p_target: targetId,
            p_sources: [...sourceIds],
        });

        // El mensaje de la función ya está escrito para el usuario («Solo se
        // unifican tarjetas tuyas y del mismo tipo»): se deja pasar tal cual.
        if (error) throw new Error(error.message);
        return data as IdentityMergeResult;
    }
}
