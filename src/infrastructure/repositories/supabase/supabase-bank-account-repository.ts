import type { IBankAccountRepository } from "@/domain/repositories/bank";
import type { BankAccount } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

function mapToEntity(row: Row): BankAccount {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        institutionId: (row.institution_id as string) ?? null,
        accountType: row.account_type as BankAccount["accountType"],
        lastFour: (row.last_four as string) ?? null,
        prefixDigits: (row.prefix_digits as string) ?? null,
        currency: row.currency as string,
        status: row.status as BankAccount["status"],
        isUnconfirmed: Boolean(row.is_unconfirmed),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankAccount): Row {
    return {
        owner_user_id: entity.ownerUserId,
        institution_id: entity.institutionId ?? null,
        account_type: entity.accountType,
        last_four: entity.lastFour ?? null,
        prefix_digits: entity.prefixDigits ?? null,
        currency: entity.currency,
        status: entity.status,
        is_unconfirmed: entity.isUnconfirmed,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankAccountRepository implements IBankAccountRepository {
    async create(entity: BankAccount): Promise<BankAccount> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating bank account: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankAccount | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts").select("*").eq("id", id).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankAccount[]> {
        throw new Error("findAll not implemented for bank_accounts. Use findByOwnerId.");
    }

    async findByOwnerId(userId: UUID): Promise<BankAccount[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .order("name");

        if (error) throw new Error(`Error loading bank accounts: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findByInstitutionId(userId: UUID, institutionId: UUID): Promise<BankAccount[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts").select("*")
            .eq("owner_user_id", userId).eq("institution_id", institutionId)
            .eq("is_deleted", false).order("name");

        if (error) throw new Error(`Error loading bank accounts: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    /** Hay a lo sumo una por usuario: un índice único parcial lo garantiza. */
    async findCashAccount(userId: UUID): Promise<BankAccount | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts").select("*")
            .eq("owner_user_id", userId).eq("account_type", "CASH")
            .eq("is_deleted", false).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async update(entity: BankAccount): Promise<BankAccount> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating bank account: ${error.message}`);
        return mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_accounts")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting bank account: ${error.message}`);
    }
}
