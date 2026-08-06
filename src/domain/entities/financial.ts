import { BaseEntity, UUID, ISODate } from "../core";

export type FinancialTransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'PAYMENT' | 'REFUND' | 'WITHDRAWAL' | 'DEPOSIT' | 'FEE' | 'TAX' | 'OTHER';
export type FinancialTransactionStatus = 'DETECTED' | 'REVIEWED' | 'CONFIRMED' | 'REJECTED' | 'DUPLICATE' | 'ARCHIVED' | 'MANUAL' | 'DELETED';
export type FinancialScanStatus = 'PROCESSING' | 'FAILED' | 'COMPLETED';

export interface FinancialInstitutionType extends BaseEntity {
    label: string;
    iconName: string;
    code: string;
    ownerUserId?: UUID | null; // null for global types
}

export interface FinancialInstitution extends BaseEntity {
    ownerUserId: UUID;
    name: string;
    description?: string | null;
    logoUrl?: string | null;
    institutionTypeId?: UUID | null;
    institutionTypeObj?: FinancialInstitutionType | null;
}

export interface FinancialAccount extends BaseEntity {
    ownerUserId: UUID;
    institutionId?: UUID | null;
    name: string;
    accountType?: string | null;
    lastFour?: string | null;
    currency: string;
}

export interface FinancialCategory extends BaseEntity {
    ownerUserId?: UUID | null;
    name: string;
    color?: string | null;
    icon?: string | null;
    parentId?: UUID | null;
}

export interface FinancialScanExecution extends BaseEntity {
    ownerUserId: UUID;
    status: FinancialScanStatus;
    source: string;
    triggerSource?: string | null;
    stats?: Record<string, any> | null;
    startedAt: ISODate;
    completedAt?: ISODate | null;
    /** Scan window boundaries (primary source for the displayed range). */
    searchRangeStart?: ISODate | null;
    searchRangeEnd?: ISODate | null;
    errorDetails?: string | null;
    requestPayload?: Record<string, any> | null;
}

export interface FinancialTransaction extends BaseEntity {
    ownerUserId: UUID;
    type: FinancialTransactionType;
    status: FinancialTransactionStatus;
    amount: number;
    originalAmount?: number | null;
    currency: string;
    merchant?: string | null;
    categoryId?: UUID | null;
    categoryName?: string;
    categoryColor?: string;
    institutionId?: UUID | null;
    institutionName?: string;
    accountId?: UUID | null;
    tags?: string[] | null;
    description: string;
    notes?: string | null;
    possibleDuplicate: boolean;
    executionId?: UUID | null;
    originStats?: Record<string, any> | null;
    date: ISODate;
    /** True when an expense-like transaction was paid with a credit card (cash outflow deferred to the card-bill payment). */
    paidWithCredit?: boolean | null;
}

export interface FinancialScannerTransaction extends BaseEntity {
    ownerUserId: UUID;
    executionId?: UUID | null;
    hash?: string | null;
    amount?: number | null;
    currency?: string | null;
    merchant?: string | null;
    date?: ISODate | null;
    type?: string | null;
    category?: string | null;
    description?: string | null;
    summary?: string | null;
    relatedTransactionHint?: string | null;
    originId?: string | null;
    originStats?: Record<string, any> | null;
    status: string;
}

export interface FinancialTransactionAuditLog extends BaseEntity {
    transactionId: UUID;
    changedByUserId: UUID;
    action: string;
    previousState?: Record<string, any> | null;
    newState?: Record<string, any> | null;
}
