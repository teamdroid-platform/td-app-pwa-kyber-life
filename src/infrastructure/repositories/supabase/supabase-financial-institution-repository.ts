import type { IFinancialInstitutionRepository } from "@/domain/repositories/financial";
import type { FinancialInstitution } from "@/domain/entities/financial";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseFinancialInstitutionRepository implements IFinancialInstitutionRepository {
    async create(entity: FinancialInstitution): Promise<FinancialInstitution> {
        const supabase = await createClient();
        
        const insertData = {
            id: entity.id,
            owner_user_id: entity.ownerUserId,
            name: entity.name,
            logo_url: entity.logoUrl,
            institution_type_id: entity.institutionTypeId ?? null,
            created_at: entity.createdAt,
            updated_at: entity.updatedAt
        };

        const { data, error } = await supabase
            .from('financial_institutions')
            .insert(insertData)
            .select('*, type:financial_institution_types(*)')
            .single();

        if (error) throw new Error(`Error creating financial institution: ${error.message}`);
        
        return this.mapToEntity(data);
    }

    async findById(id: UUID): Promise<FinancialInstitution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_institutions')
            .select('*, type:financial_institution_types(*)')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialInstitution[]> {
        throw new Error("findAll not implemented for financial_institutions. Use findByOwnerId.");
    }

    async update(entity: FinancialInstitution): Promise<FinancialInstitution> {
        const supabase = await createClient();
        
        const updateData = {
            name: entity.name,
            description: entity.description ?? null,
            logo_url: entity.logoUrl,
            institution_type_id: entity.institutionTypeId ? entity.institutionTypeId : null,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('financial_institutions')
            .update(updateData)
            .eq('id', entity.id)
            .select('*, type:financial_institution_types(*)')
            .single();

        if (error) throw new Error(`Error updating financial institution: ${error.message}`);
        return this.mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_institutions')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Error deleting financial institution: ${error.message}`);
    }

    async findByOwnerId(userId: UUID): Promise<FinancialInstitution[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_institutions')
            .select('*, type:financial_institution_types(*)')
            .eq('owner_user_id', userId)
            .order('name', { ascending: true });

        // Surface failures instead of returning an empty list: callers must be
        // able to tell "this user has no institutions" from "the query failed".
        if (error) throw new Error(`Error loading financial institutions: ${error.message}`);
        return (data ?? []).map(row => this.mapToEntity(row));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToEntity(row: any): FinancialInstitution {
        const typeObj = row.type ? {
            id: row.type.id,
            label: row.type.label,
            iconName: row.type.icon_name,
            code: row.type.code,
            ownerUserId: row.type.owner_user_id ?? null,
            createdAt: row.type.created_at,
            updatedAt: row.type.updated_at,
            isDeleted: false,
        } : null;

        return {
            id: row.id,
            ownerUserId: row.owner_user_id,
            name: row.name,
            description: row.description ?? null,
            logoUrl: row.logo_url,
            institutionTypeId: row.institution_type_id ?? null,
            institutionTypeObj: typeObj,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isDeleted: false,
        };
    }
}
