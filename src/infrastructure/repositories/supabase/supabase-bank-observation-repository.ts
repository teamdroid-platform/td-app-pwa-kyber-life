import type { IBankNumberObservationRepository } from "@/domain/repositories/bank";
import type { BankNumberObservation, BankNumberResolution } from "@/domain/entities/bank";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

type Row = Record<string, unknown>;

function mapToEntity(row: Row): BankNumberObservation {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        raw: row.raw as string,
        prefixDigits: row.prefix_digits as string,
        suffixDigits: row.suffix_digits as string,
        totalLength: (row.total_length as number) ?? null,
        bin: (row.bin as string) ?? null,
        brand: (row.brand as string) ?? null,
        accountTypeHint: (row.account_type_hint as string) ?? null,
        institutionHint: (row.institution_hint as string) ?? null,
        isComplete: Boolean(row.is_complete),
        accountId: (row.account_id as string) ?? null,
        cardId: (row.card_id as string) ?? null,
        resolution: row.resolution as BankNumberObservation["resolution"],
        occurrences: Number(row.occurrences),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: BankNumberObservation): Row {
    return {
        owner_user_id: entity.ownerUserId,
        raw: entity.raw,
        prefix_digits: entity.prefixDigits,
        suffix_digits: entity.suffixDigits,
        total_length: entity.totalLength ?? null,
        bin: entity.bin ?? null,
        brand: entity.brand ?? null,
        account_type_hint: entity.accountTypeHint ?? null,
        institution_hint: entity.institutionHint ?? null,
        is_complete: entity.isComplete,
        account_id: entity.accountId ?? null,
        card_id: entity.cardId ?? null,
        resolution: entity.resolution,
        occurrences: entity.occurrences,
        is_deleted: entity.isDeleted,
    };
}

export class SupabaseBankNumberObservationRepository implements IBankNumberObservationRepository {
    async create(entity: BankNumberObservation): Promise<BankNumberObservation> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations")
            .insert({ id: entity.id, ...toRow(entity) })
            .select()
            .single();

        if (error) throw new Error(`Error creating observation: ${error.message}`);
        return mapToEntity(data);
    }

    async findById(id: UUID): Promise<BankNumberObservation | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*").eq("id", id).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findAll(): Promise<BankNumberObservation[]> {
        throw new Error("findAll not implemented for bank_number_observations. Use findByOwnerId.");
    }

    async findByOwnerId(userId: UUID): Promise<BankNumberObservation[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .order("occurrences", { ascending: false });

        if (error) throw new Error(`Error loading observations: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findByRaw(userId: UUID, raw: string): Promise<BankNumberObservation | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("raw", raw).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findByResolution(userId: UUID, resolution: BankNumberResolution): Promise<BankNumberObservation[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("resolution", resolution)
            .eq("is_deleted", false).order("occurrences", { ascending: false });

        if (error) throw new Error(`Error loading observations: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findResolved(userId: UUID): Promise<BankNumberObservation[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .in("resolution", ["EXACT", "INFERRED", "MANUAL"]);

        if (error) throw new Error(`Error loading observations: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async update(entity: BankNumberObservation): Promise<BankNumberObservation> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating observation: ${error.message}`);
        return mapToEntity(data);
    }

    /** Borrado lógico: las transacciones que referencian la observación conservan el vínculo. */
    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_number_observations")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);

        if (error) throw new Error(`Error deleting observation: ${error.message}`);
    }
}
