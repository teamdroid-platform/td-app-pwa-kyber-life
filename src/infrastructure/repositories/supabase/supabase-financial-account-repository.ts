import type { IFinancialAccountRepository } from "@/domain/repositories/financial";
import type { FinancialAccount } from "@/domain/entities/financial";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseFinancialAccountRepository implements IFinancialAccountRepository {
    async create(entity: FinancialAccount): Promise<FinancialAccount> {
        const supabase = await createClient();
        
        const insertData = {
            id: entity.id,
            owner_user_id: entity.ownerUserId,
            institution_id: entity.institutionId,
            name: entity.name,
            account_type: entity.accountType,
            last_four: entity.lastFour,
            currency: entity.currency,
            created_at: entity.createdAt,
            updated_at: entity.updatedAt
        };

        const { data, error } = await supabase
            .from('financial_accounts')
            .insert(insertData)
            .select()
            .single();

        if (error) throw new Error(`Error creating financial account: ${error.message}`);
        
        return this.mapToEntity(data);
    }

    async findById(id: UUID): Promise<FinancialAccount | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_accounts')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialAccount[]> {
        throw new Error("findAll not implemented for financial_accounts. Use findByOwnerId.");
    }

    async update(entity: FinancialAccount): Promise<FinancialAccount> {
        const supabase = await createClient();
        
        const updateData = {
            institution_id: entity.institutionId,
            name: entity.name,
            account_type: entity.accountType,
            last_four: entity.lastFour,
            currency: entity.currency,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('financial_accounts')
            .update(updateData)
            .eq('id', entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating financial account: ${error.message}`);
        return this.mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_accounts')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Error deleting financial account: ${error.message}`);
    }

    async findByOwnerId(userId: UUID): Promise<FinancialAccount[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_accounts')
            .select('*')
            .eq('owner_user_id', userId)
            .order('name', { ascending: true });

        // Surface failures instead of returning an empty list: callers must be
        // able to tell "this user has no accounts" from "the query failed".
        if (error) throw new Error(`Error loading financial accounts: ${error.message}`);
        return (data ?? []).map(row => this.mapToEntity(row));
    }

    async findByInstitutionId(institutionId: UUID): Promise<FinancialAccount[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_accounts')
            .select('*')
            .eq('institution_id', institutionId)
            .order('name', { ascending: true });

        if (error || !data) return [];
        return data.map(row => this.mapToEntity(row));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToEntity(row: any): FinancialAccount {
        return {
            id: row.id,
            ownerUserId: row.owner_user_id,
            institutionId: row.institution_id,
            name: row.name,
            accountType: row.account_type,
            lastFour: row.last_four,
            currency: row.currency,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isDeleted: false,
        };
    }
}
