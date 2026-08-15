import type { IBankCardRepository } from "@/domain/repositories/bank";
import type { BankCard } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

/** Postgres devuelve `numeric` como string; el dominio los quiere numéricos. */
function num(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
}

function mapToEntity(row: Row): BankCard {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        institutionId: row.institution_id as string,
        accountId: (row.account_id as string) ?? null,
        cardType: row.card_type as BankCard["cardType"],
        brand: (row.brand as string) ?? null,
        bin: (row.bin as string) ?? null,
        lastFour: (row.last_four as string) ?? null,
        prefixDigits: (row.prefix_digits as string) ?? null,
        currency: row.currency as string,
        creditLimit: num(row.credit_limit),
        statementDay: num(row.statement_day),
        dueDay: num(row.due_day),
        status: row.status as BankCard["status"],
        isUnconfirmed: Boolean(row.is_unconfirmed),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankCard): Row {
    return {
        owner_user_id: entity.ownerUserId,
        institution_id: entity.institutionId,
        account_id: entity.accountId ?? null,
        card_type: entity.cardType,
        brand: entity.brand ?? null,
        bin: entity.bin ?? null,
        last_four: entity.lastFour ?? null,
        prefix_digits: entity.prefixDigits ?? null,
        currency: entity.currency,
        credit_limit: entity.creditLimit ?? null,
        statement_day: entity.statementDay ?? null,
        due_day: entity.dueDay ?? null,
        status: entity.status,
        is_unconfirmed: entity.isUnconfirmed,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankCardRepository implements IBankCardRepository {
    async create(entity: BankCard): Promise<BankCard> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_cards")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating bank card: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankCard | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_cards").select("*").eq("id", id).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankCard[]> {
        throw new Error("findAll not implemented for bank_cards. Use findByOwnerId.");
    }

    async findByOwnerId(userId: UUID): Promise<BankCard[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_cards").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .order("name");

        if (error) throw new Error(`Error loading bank cards: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findByAccountId(userId: UUID, accountId: UUID): Promise<BankCard[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_cards").select("*")
            .eq("owner_user_id", userId).eq("account_id", accountId)
            .eq("is_deleted", false).order("name");

        if (error) throw new Error(`Error loading bank cards: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async update(entity: BankCard): Promise<BankCard> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_cards")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating bank card: ${error.message}`);
        return mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_cards")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting bank card: ${error.message}`);
    }
}
