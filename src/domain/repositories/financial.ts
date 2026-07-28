import { UUID } from "../core";
import { IRepository } from "./index";
import { PaginationParams, PaginatedResult, TransactionSearchFilters } from "../pagination";
import {
    FinancialTransaction,
    FinancialScanExecution,
    FinancialScannerTransaction,
    FinancialInstitution,
    FinancialInstitutionType,
    FinancialAccount,
    FinancialCategory,
    FinancialTransactionAuditLog
} from "../entities/financial";

export interface DashboardRangeFilter {
    startDate?: Date;
    endDate?: Date;
    /** Statuses to keep. Defaults to the "active" ones the dashboards read. */
    statuses?: string[];
}

export interface IFinancialTransactionRepository extends IRepository<FinancialTransaction> {
    findByOwnerId(userId: UUID): Promise<FinancialTransaction[]>;
    /**
     * Transactions for the dashboards, already narrowed **in SQL** by owner,
     * date range and status — instead of pulling the whole history and
     * filtering it in memory.
     */
    findForDashboard(userId: UUID, filter?: DashboardRangeFilter): Promise<FinancialTransaction[]>;
    findRecent(userId: UUID, limit: number): Promise<FinancialTransaction[]>;
    search(userId: UUID, query: string, filters?: TransactionSearchFilters): Promise<FinancialTransaction[]>;
    findPaginated(userId: UUID, filters: TransactionSearchFilters, pagination: PaginationParams): Promise<PaginatedResult<FinancialTransaction>>;
    getUniqueTags(userId: UUID): Promise<string[]>;
    /** Number of transactions owned by the user that reference the given category. */
    countByCategoryId(userId: UUID, categoryId: UUID): Promise<number>;
    /**
     * Move every transaction owned by the user from `fromCategoryId` to
     * `toCategoryId` (or null to un-categorize). Returns how many were updated.
     */
    reassignCategory(userId: UUID, fromCategoryId: UUID, toCategoryId: UUID | null): Promise<number>;
    /** Number of transactions owned by the user that reference the given institution. */
    countByInstitutionId(userId: UUID, institutionId: UUID): Promise<number>;
    /**
     * Move every transaction owned by the user from `fromInstitutionId` to
     * `toInstitutionId` (or null). Returns how many were updated.
     */
    reassignInstitution(userId: UUID, fromInstitutionId: UUID, toInstitutionId: UUID | null): Promise<number>;
}

export interface ScanExecutionDateFilter {
    dateFrom?: string;
    dateTo?: string;
}

export interface IFinancialScanExecutionRepository extends IRepository<FinancialScanExecution> {
    findByOwnerId(userId: UUID): Promise<FinancialScanExecution[]>;
    findLatestBySource(userId: UUID, source: string): Promise<FinancialScanExecution | null>;
    findPaginatedByOwnerId(userId: UUID, pagination: PaginationParams, dateFilter?: ScanExecutionDateFilter): Promise<PaginatedResult<FinancialScanExecution>>;
}

export interface IFinancialScannerTransactionRepository extends IRepository<FinancialScannerTransaction> {
    findUnprocessedByOwnerId(userId: UUID): Promise<FinancialScannerTransaction[]>;
}


export interface IFinancialInstitutionTypeRepository extends IRepository<FinancialInstitutionType> {
    findAllGlobalAndUser(userId: UUID): Promise<FinancialInstitutionType[]>;
}

export interface IFinancialInstitutionRepository extends IRepository<FinancialInstitution> {
    findByOwnerId(userId: UUID): Promise<FinancialInstitution[]>;
}

export interface IFinancialAccountRepository extends IRepository<FinancialAccount> {
    findByOwnerId(userId: UUID): Promise<FinancialAccount[]>;
    findByInstitutionId(institutionId: UUID): Promise<FinancialAccount[]>;
}

export interface IFinancialCategoryRepository extends IRepository<FinancialCategory> {
    findAllBaseAndUser(userId: UUID): Promise<FinancialCategory[]>;
}

export interface IFinancialTransactionAuditLogRepository extends IRepository<FinancialTransactionAuditLog> {
    findByTransactionId(transactionId: UUID): Promise<FinancialTransactionAuditLog[]>;
}
