import type { IBankInstitutionRepository } from "@/domain/repositories/bank";
import type { BankInstitution } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

function mapToEntity(row: Row): BankInstitution {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        name: row.name as string,
        shortName: (row.short_name as string) ?? null,
        kind: row.kind as BankInstitution["kind"],
        logoUrl: (row.logo_url as string) ?? null,
        color: (row.color as string) ?? null,
        country: (row.country as string) ?? null,
        financialInstitutionId: (row.financial_institution_id as string) ?? null,
        isUnconfirmed: Boolean(row.is_unconfirmed),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankInstitution): Row {
    return {
        owner_user_id: entity.ownerUserId,
        name: entity.name,
        short_name: entity.shortName ?? null,
        kind: entity.kind,
        logo_url: entity.logoUrl ?? null,
        color: entity.color ?? null,
        country: entity.country ?? null,
        financial_institution_id: entity.financialInstitutionId ?? null,
        is_unconfirmed: entity.isUnconfirmed,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankInstitutionRepository implements IBankInstitutionRepository {
    async create(entity: BankInstitution): Promise<BankInstitution> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating bank institution: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankInstitution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*").eq("id", id).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankInstitution[]> {
        throw new Error("findAll not implemented for bank_institutions. Use findByOwnerId.");
    }

    async findByOwnerId(userId: UUID): Promise<BankInstitution[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .order("name");

        if (error) throw new Error(`Error loading bank institutions: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findByName(userId: UUID, name: string): Promise<BankInstitution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .ilike("name", name).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async update(entity: BankInstitution): Promise<BankInstitution> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating bank institution: ${error.message}`);
        return mapToEntity(data);
    }

    /** Borrado lógico: las transacciones que la referencian conservan el vínculo. */
    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_institutions")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting bank institution: ${error.message}`);
    }
}
