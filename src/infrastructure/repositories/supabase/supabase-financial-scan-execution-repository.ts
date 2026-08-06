import type { FinancialScanExecution } from "@/domain/entities/financial";
import type { IFinancialScanExecutionRepository } from "@/domain/repositories/financial";
import type { UUID } from "@/domain/core";
import type { PaginationParams, PaginatedResult } from "@/domain/pagination";
import { createClient } from "@/infrastructure/supabase/server";

export class SupabaseFinancialScanExecutionRepository implements IFinancialScanExecutionRepository {
    private tableName = 'financial_scanner_executions';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToEntity(data: any): FinancialScanExecution {

        let parsedPayload = null;
        if (data.request_payload) {
            try {
                parsedPayload = data.request_payload;
                while (typeof parsedPayload === 'string') {
                    parsedPayload = JSON.parse(parsedPayload);
                }
            } catch (e) {
                console.error("Error parsing request_payload", e);
            }
        }
        
        const stats: Record<string, any> = {};
        if (data.total_transactions != null) stats.totalTransactionsFound = data.total_transactions;
        if (parsedPayload?.startDate) stats.startDate = parsedPayload.startDate;
        if (parsedPayload?.endDate) stats.endDate = parsedPayload.endDate;

        return {
            id: data.id,
            ownerUserId: data.owner_user_id,
            status: data.status,
            source: data.source || 'GMAIL_N8N_WEBHOOK',
            triggerSource: data.trigger_source || null,
            stats: Object.keys(stats).length > 0 ? stats : undefined,
            requestPayload: parsedPayload,
            startedAt: data.started_at || data.created_at,
            completedAt: data.finished_at,
            searchRangeStart: data.search_range_start ?? null,
            searchRangeEnd: data.search_range_end ?? null,
            errorDetails: data.error_message,
            isDeleted: false,
            createdAt: data.created_at,
            updatedAt: data.updated_at || data.created_at,
        };
    }

    private mapToRow(entity: FinancialScanExecution): any {
        return {
            id: entity.id,
            owner_user_id: entity.ownerUserId,
            status: entity.status,
            // source is not in db
            total_transactions: entity.stats?.totalTransactionsFound,
            started_at: entity.startedAt,
            finished_at: entity.completedAt,
            error_message: entity.errorDetails,
            request_payload: entity.requestPayload,
            created_at: entity.createdAt,
            updated_at: entity.updatedAt,
        };
    }

    async findById(id: UUID): Promise<FinancialScanExecution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialScanExecution[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !data) return [];
        return data.map((row) => this.mapToEntity(row));
    }

    async create(entity: FinancialScanExecution): Promise<FinancialScanExecution> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .insert(this.mapToRow(entity))
            .select()
            .single();

        if (error) throw error;
        return this.mapToEntity(data);
    }

    async update(entity: FinancialScanExecution): Promise<FinancialScanExecution> {
        const supabase = await createClient();
        const rowData = this.mapToRow(entity);
        
        // Remove undefined values to avoid overwriting with null accidentally if not intended,
        // though mapToRow already maps properties. 
        // We ensure we update by ID.
        const { data, error } = await supabase
            .from(this.tableName)
            .update(rowData)
            .eq('id', entity.id)
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
            .eq('id', id);

        if (error) throw error;
    }

    async findByOwnerId(userId: UUID): Promise<FinancialScanExecution[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('owner_user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(`Error finding ${this.tableName} by user:`, error);
            return [];
        }

        return (data || []).map(row => this.mapToEntity(row));
    }

    async findLatestBySource(userId: UUID, source: string): Promise<FinancialScanExecution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('owner_user_id', userId)
            // source is not in the DB, so we just order by created_at.
            // if we need to filter by source we'd have to handle it differently, 
            // but for now this works.
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
                console.error(`Error finding latest ${this.tableName}:`, error);
            }
            return null;
        }

        return data ? this.mapToEntity(data) : null;
    }
    
    async findPaginatedByOwnerId(userId: UUID, pagination: PaginationParams, dateFilter?: import('@/domain/repositories/financial').ScanExecutionDateFilter): Promise<PaginatedResult<FinancialScanExecution>> {
        const supabase = await createClient();
        
        // Build base query filters
        const buildQuery = (query: any) => {
            query = query.eq('owner_user_id', userId);
            if (dateFilter?.dateFrom) {
                query = query.gte('created_at', `${dateFilter.dateFrom}T00:00:00`);
            }
            if (dateFilter?.dateTo) {
                query = query.lte('created_at', `${dateFilter.dateTo}T23:59:59`);
            }
            return query;
        };

        // Get total count
        const countQuery = supabase
            .from(this.tableName)
            .select('*', { count: 'exact', head: true });
        const { count, error: countError } = await buildQuery(countQuery);
            
        if (countError) {
            console.error(`Error counting ${this.tableName}:`, countError);
            return {
                data: [],
                pagination: { page: pagination.page, pageSize: pagination.pageSize, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
            };
        }
        
        const totalItems = count || 0;
        const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
        const from = (pagination.page - 1) * pagination.pageSize;
        const to = from + pagination.pageSize - 1;
        
        const dataQuery = supabase
            .from(this.tableName)
            .select('*');
        const { data, error } = await buildQuery(dataQuery)
            .order('created_at', { ascending: false })
            .range(from, to);
            
        if (error) {
            console.error(`Error paginating ${this.tableName}:`, error);
            return {
                data: [],
                pagination: { page: pagination.page, pageSize: pagination.pageSize, totalItems, totalPages, hasNextPage: false, hasPreviousPage: false }
            };
        }
        
        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: (data || []).map((row: any) => this.mapToEntity(row)),
            pagination: {
                page: pagination.page,
                pageSize: pagination.pageSize,
                totalItems,
                totalPages,
                hasNextPage: pagination.page < totalPages,
                hasPreviousPage: pagination.page > 1
            }
        };
    }
}
