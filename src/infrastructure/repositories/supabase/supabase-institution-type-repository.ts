import type { IFinancialInstitutionTypeRepository } from "@/domain/repositories/financial";
import type { FinancialInstitutionType } from "@/domain/entities/financial";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseInstitutionTypeRepository implements IFinancialInstitutionTypeRepository {
    async create(entity: FinancialInstitutionType): Promise<FinancialInstitutionType> {
        const supabase = await createClient();
        
        const insertData = {
            id: entity.id,
            label: entity.label,
            icon_name: entity.iconName,
            code: entity.code,
            owner_user_id: entity.ownerUserId ?? null,
            created_at: entity.createdAt,
            updated_at: entity.updatedAt
        };

        const { data, error } = await supabase
            .from('financial_institution_types')
            .insert(insertData)
            .select()
            .single();

        if (error) throw new Error(`Error creating institution type: ${error.message}`);
        
        return this.mapToEntity(data);
    }

    async findById(id: UUID): Promise<FinancialInstitutionType | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_institution_types')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialInstitutionType[]> {
        throw new Error("findAll not implemented for institution types. Use findAllGlobalAndUser.");
    }

    async update(entity: FinancialInstitutionType): Promise<FinancialInstitutionType> {
        const supabase = await createClient();
        
        const updateData = {
            label: entity.label,
            icon_name: entity.iconName,
            code: entity.code,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('financial_institution_types')
            .update(updateData)
            .eq('id', entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating institution type: ${error.message}`);
        return this.mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_institution_types')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Error deleting institution type: ${error.message}`);
    }

    async findAllGlobalAndUser(userId: UUID): Promise<FinancialInstitutionType[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_institution_types')
            .select('*')
            .or(`owner_user_id.is.null,owner_user_id.eq.${userId}`)
            .order('label', { ascending: true });

        // Surface failures instead of returning an empty list: callers must be
        // able to tell "there are no types" from "the query failed".
        if (error) throw new Error(`Error loading institution types: ${error.message}`);
        return (data ?? []).map(row => this.mapToEntity(row));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToEntity(row: any): FinancialInstitutionType {
        return {
            id: row.id,
            label: row.label,
            iconName: row.icon_name,
            code: row.code,
            ownerUserId: row.owner_user_id ?? null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isDeleted: false,
        };
    }
}
