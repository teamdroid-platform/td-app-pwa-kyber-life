import type { IBankAccountBalanceSnapshotRepository } from "@/domain/repositories/bank";
import type { BankAccountBalanceSnapshot } from "@/domain/entities/bank";
import type { UUID, ISODate } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

function mapToEntity(row: Row): BankAccountBalanceSnapshot {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        accountId: row.account_id as string,
        balance: Number(row.balance),
        asOf: row.as_of as string,
        source: row.source as BankAccountBalanceSnapshot["source"],
        note: (row.note as string) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankAccountBalanceSnapshot): Row {
    return {
        owner_user_id: entity.ownerUserId,
        account_id: entity.accountId,
        balance: entity.balance,
        as_of: entity.asOf,
        source: entity.source,
        note: entity.note ?? null,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankAccountBalanceSnapshotRepository implements IBankAccountBalanceSnapshotRepository {
    async create(entity: BankAccountBalanceSnapshot): Promise<BankAccountBalanceSnapshot> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_account_balance_snapshots")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating balance snapshot: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankAccountBalanceSnapshot | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_account_balance_snapshots").select("*").eq("id", id).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankAccountBalanceSnapshot[]> {
        throw new Error("findAll not implemented for bank_account_balance_snapshots. Use findByAccountId.");
    }

    async findByAccountId(accountId: UUID): Promise<BankAccountBalanceSnapshot[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_account_balance_snapshots").select("*")
            .eq("account_id", accountId).eq("is_deleted", false)
            .order("as_of", { ascending: false });

        if (error) throw new Error(`Error loading balance snapshots: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    /**
     * El ancla del saldo: el corte más reciente que no está en el futuro.
     *
     * Empatados por fecha, gana el último declarado. Corregir el saldo del
     * mismo día es lo más normal —uno mira el banco, escribe una cifra y la
     * enmienda al momento— y sin este desempate Postgres devolvía cualquiera
     * de los dos: la app se quedaba con el valor viejo.
     */
    async findLatestForAccount(accountId: UUID, reference: ISODate): Promise<BankAccountBalanceSnapshot | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_account_balance_snapshots").select("*")
            .eq("account_id", accountId).eq("is_deleted", false)
            .lte("as_of", reference)
            .order("as_of", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async update(entity: BankAccountBalanceSnapshot): Promise<BankAccountBalanceSnapshot> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_account_balance_snapshots")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating balance snapshot: ${error.message}`);
        return mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_account_balance_snapshots")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting balance snapshot: ${error.message}`);
    }
}
