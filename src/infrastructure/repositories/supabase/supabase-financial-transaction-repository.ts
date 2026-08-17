import type { IFinancialTransactionRepository, DashboardRangeFilter } from "@/domain/repositories/financial";
import type { FinancialTransaction } from "@/domain/entities/financial";
import type { UUID } from "@/domain/core";
import type { PaginationParams, PaginatedResult, TransactionSearchFilters } from "@/domain/pagination";
import { createClient } from "@/infrastructure/supabase/server";
import { DASHBOARD_ACTIVE_STATUSES } from "@/domain/services/financial-balance";

export class SupabaseFinancialTransactionRepository implements IFinancialTransactionRepository {
    async create(entity: FinancialTransaction): Promise<FinancialTransaction> {
        const supabase = await createClient();
        
        const insertData = {
            id: entity.id,
            owner_user_id: entity.ownerUserId,
            institution_id: entity.institutionId,
            bank_source_account_id: entity.bankSourceAccountId ?? null,
            bank_destination_account_id: entity.bankDestinationAccountId ?? null,
            bank_card_id: entity.bankCardId ?? null,
            bank_institution_id: entity.bankInstitutionId ?? null,
            bank_card_statement_id: entity.bankCardStatementId ?? null,
            bank_counterparty_observation_id: entity.bankCounterpartyObservationId ?? null,
            type: entity.type,
            status: entity.status,
            amount: entity.amount,
            currency: entity.currency,
            date: entity.date,
            merchant: entity.merchant,
            category_id: entity.categoryId,
            tags: entity.tags || [],
            description: entity.description,
            notes: entity.notes,
            possible_duplicate: entity.possibleDuplicate,
            execution_id: entity.executionId,
            origin_stats: entity.originStats,
            paid_with_credit: entity.paidWithCredit ?? false,
            created_at: entity.createdAt,
            updated_at: entity.updatedAt
        };

        const { data, error } = await supabase
            .from('financial_transactions')
            .insert(insertData)
            .select()
            .single();

        if (error) throw new Error(`Error creating financial transaction: ${error.message}`);
        
        return this.mapToEntity(data);
    }

    async findById(id: UUID): Promise<FinancialTransaction | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) return null;
        return this.mapToEntity(data);
    }

    async findAll(): Promise<FinancialTransaction[]> {
        throw new Error("findAll not implemented for financial_transactions. Use findByOwnerId.");
    }

    async update(entity: FinancialTransaction): Promise<FinancialTransaction> {
        const supabase = await createClient();
        
        const updateData = {
            institution_id: entity.institutionId,
            bank_source_account_id: entity.bankSourceAccountId ?? null,
            bank_destination_account_id: entity.bankDestinationAccountId ?? null,
            bank_card_id: entity.bankCardId ?? null,
            bank_institution_id: entity.bankInstitutionId ?? null,
            bank_card_statement_id: entity.bankCardStatementId ?? null,
            bank_counterparty_observation_id: entity.bankCounterpartyObservationId ?? null,
            type: entity.type,
            status: entity.status,
            amount: entity.amount,
            currency: entity.currency,
            date: entity.date,
            merchant: entity.merchant,
            category_id: entity.categoryId,
            tags: entity.tags || [],
            description: entity.description,
            notes: entity.notes,
            possible_duplicate: entity.possibleDuplicate,
            paid_with_credit: entity.paidWithCredit ?? false,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('financial_transactions')
            .update(updateData)
            .eq('id', entity.id)
            .select()
            .single();

        if (error) throw new Error(`Error updating financial transaction: ${error.message}`);
        return this.mapToEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        // Since we don't have is_deleted for transactions, we use hard delete or rely on RLS/status.
        // If hard delete is expected:
        const { error } = await supabase
            .from('financial_transactions')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Error deleting financial transaction: ${error.message}`);
    }

    async findByOwnerId(userId: UUID): Promise<FinancialTransaction[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('owner_user_id', userId)
            .order('date', { ascending: false });

        if (error || !data) return [];
        return data.map(row => this.mapToEntity(row));
    }

    async findForDashboard(userId: UUID, filter?: DashboardRangeFilter): Promise<FinancialTransaction[]> {
        const supabase = await createClient();
        let query = supabase
            .from('financial_transactions')
            .select('*')
            .eq('owner_user_id', userId)
            .in('status', filter?.statuses ?? DASHBOARD_ACTIVE_STATUSES);

        // Narrow the range in SQL so a 30-day view doesn't transfer years of history.
        if (filter?.startDate) query = query.gte('date', filter.startDate.toISOString());
        if (filter?.endDate) query = query.lte('date', filter.endDate.toISOString());

        const { data, error } = await query.order('date', { ascending: false });

        if (error) throw new Error(`Error loading dashboard transactions: ${error.message}`);
        return (data ?? []).map(row => this.mapToEntity(row));
    }

    async countByCategoryId(userId: UUID, categoryId: UUID): Promise<number> {
        const supabase = await createClient();
        const { count, error } = await supabase
            .from('financial_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('owner_user_id', userId)
            .eq('category_id', categoryId);

        if (error) throw new Error(`Error counting transactions by category: ${error.message}`);
        return count ?? 0;
    }

    async reassignCategory(userId: UUID, fromCategoryId: UUID, toCategoryId: UUID | null): Promise<number> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_transactions')
            .update({ category_id: toCategoryId, updated_at: new Date().toISOString() })
            .eq('owner_user_id', userId)
            .eq('category_id', fromCategoryId)
            .select('id');

        if (error) throw new Error(`Error reassigning transactions category: ${error.message}`);
        return data?.length ?? 0;
    }

    async countByInstitutionId(userId: UUID, institutionId: UUID): Promise<number> {
        const supabase = await createClient();
        const { count, error } = await supabase
            .from('financial_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('owner_user_id', userId)
            .eq('institution_id', institutionId);

        if (error) throw new Error(`Error counting transactions by institution: ${error.message}`);
        return count ?? 0;
    }

    async reassignInstitution(userId: UUID, fromInstitutionId: UUID, toInstitutionId: UUID | null): Promise<number> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_transactions')
            .update({ institution_id: toInstitutionId, updated_at: new Date().toISOString() })
            .eq('owner_user_id', userId)
            .eq('institution_id', fromInstitutionId)
            .select('id');

        if (error) throw new Error(`Error reassigning transactions institution: ${error.message}`);
        return data?.length ?? 0;
    }

    async findRecent(userId: UUID, limit: number): Promise<FinancialTransaction[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('owner_user_id', userId)
            .order('date', { ascending: false })
            .limit(limit);

        if (error || !data) return [];
        return data.map(row => this.mapToEntity(row));
    }

    async search(userId: UUID, query: string, filters?: TransactionSearchFilters): Promise<FinancialTransaction[]> {
        const supabase = await createClient();
        let qb = supabase
            .from('financial_transactions')
            .select('*')
            .eq('owner_user_id', userId);

        qb = this.applyFilters(qb, query, filters);

        const { data, error } = await qb.order('date', { ascending: false });
        if (error || !data) return [];
        return data.map(row => this.mapToEntity(row));
    }

    async findPaginated(
        userId: UUID,
        filters: TransactionSearchFilters,
        pagination: PaginationParams,
    ): Promise<PaginatedResult<FinancialTransaction>> {
        const supabase = await createClient();
        const { page, pageSize } = pagination;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Count query — exact count via header
        let countQb = supabase
            .from('financial_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('owner_user_id', userId);
        countQb = this.applyFilters(countQb, filters.query, filters);
        const { count: totalItems, error: countError } = await countQb;

        if (countError) throw new Error(`Pagination count error: ${countError.message}`);

        const total = totalItems ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        // Data query
        let dataQb = supabase
            .from('financial_transactions')
            .select('*')
            .eq('owner_user_id', userId);
        dataQb = this.applyFilters(dataQb, filters.query, filters);
        dataQb = dataQb.order('date', { ascending: false }).range(from, to);

        const { data, error } = await dataQb;
        if (error) throw new Error(`Pagination data error: ${error.message}`);

        return {
            data: (data ?? []).map(row => this.mapToEntity(row)),
            pagination: {
                page,
                pageSize,
                totalItems: total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    async getUniqueTags(userId: UUID): Promise<string[]> {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc('get_unique_financial_tags', {
            p_user_id: userId
        });

        if (error) {
            console.error('Error fetching unique tags:', error);
            return [];
        }

        // data should be an array of objects like { tag: 'FOOD' }
        return (data || []).map((item: any) => item.tag);
    }

    async getFrequentDescriptions(userId: UUID, limit = 5): Promise<Record<string, string[]>> {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc('get_frequent_financial_descriptions', {
            p_user_id: userId,
            p_limit: limit,
        });

        if (error) {
            // Suggestions are a convenience: a missing RPC or a transient failure
            // must never break the capture flow.
            console.error('Error fetching frequent descriptions:', error);
            return {};
        }

        // The RPC already ranks each type; grouping only reshapes the rows.
        const grouped: Record<string, string[]> = {};
        for (const row of (data || []) as { type: string; description: string }[]) {
            (grouped[row.type] ??= []).push(row.description);
        }
        return grouped;
    }

    /**
     * Shared filter builder used by both `search` and `findPaginated`.
     * Keeps all SQL-level filtering in a single place.
     */
    private applyFilters(qb: any, query?: string, filters?: TransactionSearchFilters & any) {
        if (filters?.words && filters.words.length > 0) {
            filters.words.forEach((word: string, index: number) => {
                const safeWord = word.replace(/,/g, '');
                if (safeWord) {
                    // PostgREST uses '*' for wildcards in URL query strings (used by .or)
                    const pattern = `*${safeWord}*`;
                    let orConditions = `merchant.ilike.${pattern},description.ilike.${pattern}`;
                    
                    const catIds = filters.wordCategoryIds?.[index] || [];
                    if (catIds.length > 0) {
                        orConditions += `,category_id.in.(${catIds.join(',')})`;
                    }
                    
                    const instIds = filters.wordInstitutionIds?.[index] || [];
                    if (instIds.length > 0) {
                        orConditions += `,institution_id.in.(${instIds.join(',')})`;
                    }

                    qb = qb.or(orConditions);
                }
            });
        } else if (query) {
            // Fallback just in case `words` wasn't populated (e.g. from non-paginated search endpoint)
            const safeWord = query.replace(/,/g, '');
            qb = qb.or(`merchant.ilike.*${safeWord}*,description.ilike.*${safeWord}*`);
        }
        if (filters?.status) {
            qb = qb.eq('status', filters.status);
        } else {
            qb = qb.neq('status', 'DELETED').neq('status', 'ARCHIVED');
        }

        if (!filters) return qb;
        if (filters.types && filters.types.length > 0) qb = qb.in('type', filters.types);
        if (filters.categoryId) qb = qb.eq('category_id', filters.categoryId);
        if (filters.institutionId) qb = qb.eq('institution_id', filters.institutionId);
        if (filters.currency) qb = qb.eq('currency', filters.currency);
        if (filters.dateFrom) qb = qb.gte('date', filters.dateFrom);
        if (filters.dateTo) qb = qb.lte('date', filters.dateTo);
        if (filters.amountMin !== undefined) qb = qb.gte('amount', filters.amountMin);
        if (filters.amountMax !== undefined) qb = qb.lte('amount', filters.amountMax);
        if (filters.tags && filters.tags.length > 0) qb = qb.overlaps('tags', filters.tags);

        return qb;
    }

    private mapToEntity(row: any): FinancialTransaction {
        return {
            id: row.id,
            ownerUserId: row.owner_user_id,
            institutionId: row.institution_id,
            bankSourceAccountId: row.bank_source_account_id ?? null,
            bankDestinationAccountId: row.bank_destination_account_id ?? null,
            bankCardId: row.bank_card_id ?? null,
            bankInstitutionId: row.bank_institution_id ?? null,
            bankCardStatementId: row.bank_card_statement_id ?? null,
            bankCounterpartyObservationId: row.bank_counterparty_observation_id ?? null,
            type: row.type,
            status: row.status,
            amount: row.amount,
            currency: row.currency,
            date: row.date,
            merchant: row.merchant,
            categoryId: row.category_id,
            tags: row.tags || [],
            description: row.description || '',
            notes: row.notes,
            possibleDuplicate: row.possible_duplicate,
            executionId: row.execution_id,
            originStats: row.origin_stats,
            paidWithCredit: row.paid_with_credit ?? false,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isDeleted: false,
        };
    }
}
