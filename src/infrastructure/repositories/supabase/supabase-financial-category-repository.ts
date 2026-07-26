import type { IFinancialCategoryRepository } from "@/domain/repositories/financial";
import type { FinancialCategory } from "@/domain/entities/financial";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseFinancialCategoryRepository implements IFinancialCategoryRepository {
    async create(entity: FinancialCategory): Promise<FinancialCategory> {
        const supabase = await createClient();
        
        const insertData = {
            id: entity.id,
            owner_user_id: entity.ownerUserId,
            name: entity.name,
            color: entity.color,
            icon: entity.icon,
            parent_id: entity.parentId,
            created_at: entity.createdAt,
            updated_at: entity.updatedAt
        };

        const { data, error } = await supabase
            .from('financial_categories')
            .insert(insertData)
            .select()
            .single();

        if (error) throw new Error(`Error creating financial category: ${error.message}`);
        
        return this.mapToEntity(data);
    }

    async findById(id: UUID): Promise<FinancialCategory | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_categories')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialCategory[]> {
        throw new Error("findAll not implemented for financial_categories. Use findAllBaseAndUser.");
    }

    async update(entity: FinancialCategory): Promise<FinancialCategory> {
        const supabase = await createClient();
        
        const updateData = {
            name: entity.name,
            color: entity.color,
            icon: entity.icon,
            parent_id: entity.parentId,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('financial_categories')
            .update(updateData)
            .eq('id', entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating financial category: ${error.message}`);
        return this.mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_categories')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Error deleting financial category: ${error.message}`);
    }

    async findAllBaseAndUser(userId: UUID): Promise<FinancialCategory[]> {
        const supabase = await createClient();
        // Base categories have owner_user_id IS NULL
        const { data, error } = await supabase
            .from('financial_categories')
            .select('*')
            .or(`owner_user_id.eq.${userId},owner_user_id.is.null`)
            .order('name', { ascending: true });

        // Surface failures instead of returning an empty list: callers must be
        // able to tell "this user has no categories" from "the query failed".
        if (error) throw new Error(`Error loading financial categories: ${error.message}`);
        return (data ?? []).map(row => this.mapToEntity(row));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToEntity(row: any): FinancialCategory {
        return {
            id: row.id,
            ownerUserId: row.owner_user_id,
            name: row.name,
            color: row.color,
            icon: row.icon,
            parentId: row.parent_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isDeleted: false,
        };
    }
}
