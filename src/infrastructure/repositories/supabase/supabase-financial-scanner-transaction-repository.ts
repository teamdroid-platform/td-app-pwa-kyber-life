import type { UUID } from "../../../domain/core";
import type { FinancialScannerTransaction } from "../../../domain/entities/financial";
import type { IFinancialScannerTransactionRepository } from "../../../domain/repositories/financial";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseFinancialScannerTransactionRepository implements IFinancialScannerTransactionRepository {
    private tableName = "financial_scanner_transactions";

    private mapToEntity(row: any): FinancialScannerTransaction {
        return {
            id: row.id,
            ownerUserId: row.owner_user_id,
            executionId: row.execution_id,
            hash: row.hash,
            amount: row.amount ? Number(row.amount) : null,
            currency: row.currency,
            merchant: row.merchant,
            date: row.date,
            type: row.type,
            category: row.category,
            description: row.description,
            summary: row.summary,
            relatedTransactionHint: row.related_transaction_hint,
            originId: row.origin_id,
            originStats: row.origin_stats,
            accounts: row.accounts ?? null,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isDeleted: false,
        };
    }

    private mapToRow(entity: FinancialScannerTransaction): any {
        return {
            id: entity.id,
            owner_user_id: entity.ownerUserId,
            execution_id: entity.executionId,
            hash: entity.hash,
            amount: entity.amount,
            currency: entity.currency,
            merchant: entity.merchant,
            date: entity.date,
            type: entity.type,
            category: entity.category,
            description: entity.description,
            summary: entity.summary,
            related_transaction_hint: entity.relatedTransactionHint,
            origin_id: entity.originId,
            origin_stats: entity.originStats,
            accounts: entity.accounts ?? null,
            status: entity.status,
        };
    }

    async findById(id: UUID): Promise<FinancialScannerTransaction | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select("*")
            .eq("id", id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialScannerTransaction[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select("*")
            .order("created_at", { ascending: false });

        if (error || !data) return [];
        return data.map(this.mapToEntity);
    }

    async create(entity: FinancialScannerTransaction): Promise<FinancialScannerTransaction> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .insert(this.mapToRow(entity))
            .select()
            .single();

        if (error) throw error;
        return this.mapToEntity(data);
    }

    async update(entity: FinancialScannerTransaction): Promise<FinancialScannerTransaction> {
        const id = entity.id;
        const supabase = await createClient();
        
        // Convert partial entity to row format mapping keys correctly
        const rowData: any = {};
        if (entity.ownerUserId !== undefined) rowData.owner_user_id = entity.ownerUserId;
        if (entity.executionId !== undefined) rowData.execution_id = entity.executionId;
        if (entity.hash !== undefined) rowData.hash = entity.hash;
        if (entity.amount !== undefined) rowData.amount = entity.amount;
        if (entity.currency !== undefined) rowData.currency = entity.currency;
        if (entity.merchant !== undefined) rowData.merchant = entity.merchant;
        if (entity.date !== undefined) rowData.date = entity.date;
        if (entity.type !== undefined) rowData.type = entity.type;
        if (entity.category !== undefined) rowData.category = entity.category;
        if (entity.description !== undefined) rowData.description = entity.description;
        if (entity.summary !== undefined) rowData.summary = entity.summary;
        if (entity.relatedTransactionHint !== undefined) rowData.related_transaction_hint = entity.relatedTransactionHint;
        if (entity.originId !== undefined) rowData.origin_id = entity.originId;
        if (entity.originStats !== undefined) rowData.origin_stats = entity.originStats;
        if (entity.accounts !== undefined) rowData.accounts = entity.accounts;
        if (entity.status !== undefined) rowData.status = entity.status;

        const { data, error } = await supabase
            .from(this.tableName)
            .update(rowData)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;
        return this.mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from(this.tableName)
            .delete()
            .eq("id", id);

        if (error) throw error;
    }

    async findUnprocessedByOwnerId(userId: UUID): Promise<FinancialScannerTransaction[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select("*")
            .eq("owner_user_id", userId)
            .eq("status", "DETECTED")
            .order("date", { ascending: false });

        if (error) {
            console.error("Error in findUnprocessedByOwnerId:", error);
            throw error;
        }
        if (!data) return [];
        return data.map(this.mapToEntity);
    }
}
