import type { IBankMovementRepository, BankMovementFilter } from "@/domain/repositories/bank";
import type { BankMovement } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

function mapToEntity(row: Record<string, unknown>): BankMovement {
    return {
        transactionId: row.transaction_id as string,
        ownerUserId: row.owner_user_id as string,
        date: row.date as string,
        accountId: (row.account_id as string) ?? null,
        cardId: (row.card_id as string) ?? null,
        direction: row.direction as BankMovement["direction"],
        amount: Number(row.amount),
        currency: row.currency as string,
        description: (row.description as string) ?? null,
        merchant: (row.merchant as string) ?? null,
        categoryId: (row.category_id as string) ?? null,
    };
}

/**
 * Solo lectura sobre la vista `bank_movements`, que explota cada transacción en
 * líneas de libro mayor. No hay create ni update: la transacción es la única
 * fuente de verdad, así que estas filas no existen por sí solas.
 */
export class SupabaseBankMovementRepository implements IBankMovementRepository {
    async find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]> {
        const supabase = await createClient();
        let query = supabase.from("bank_movements").select("*").eq("owner_user_id", userId);

        if (filter.accountId) query = query.eq("account_id", filter.accountId);
        if (filter.cardId) query = query.eq("card_id", filter.cardId);
        if (filter.since) query = query.gt("date", filter.since);
        if (filter.until) query = query.lte("date", filter.until);

        query = query.order("date", { ascending: false });
        if (filter.limit) query = query.limit(filter.limit);

        const { data, error } = await query;
        if (error) throw new Error(`Error loading bank movements: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findAllForOwner(userId: UUID): Promise<BankMovement[]> {
        return this.find(userId, {});
    }
}
