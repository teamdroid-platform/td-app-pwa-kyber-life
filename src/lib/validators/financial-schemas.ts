import { z } from "zod";

// ─── Enums as Zod types ──────────────────────────────────────

const TRANSACTION_TYPES = [
    'EXPENSE', 'INCOME', 'TRANSFER', 'PAYMENT',
    'REFUND', 'WITHDRAWAL', 'DEPOSIT', 'FEE', 'TAX', 'OTHER',
] as const;

const TRANSACTION_STATUSES = [
    'DETECTED', 'REVIEWED', 'CONFIRMED', 'REJECTED',
    'DUPLICATE', 'ARCHIVED', 'MANUAL', 'DELETED',
] as const;

export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);

// ─── Create Transaction ──────────────────────────────────────

/**
 * Lo que el usuario corrigió de una cuenta del escaneo antes de confirmar:
 * de quién es y, si es suya, qué es exactamente.
 */
const scannedDecisionSchema = z.object({
    ownership: z.enum(["MINE", "EXTERNAL"]),
    kind: z.enum(["ACCOUNT", "CARD"]).optional().nullable(),
    accountType: z.enum(["CHECKING", "SAVINGS", "CASH", "INVESTMENT"]).optional().nullable(),
    cardType: z.enum(["DEBIT", "CREDIT"]).optional().nullable(),
    institutionId: z.string().uuid().optional().nullable(),
    institutionName: z.string().max(120).optional().nullable(),
    institutionKind: z.enum(["BANK", "COOPERATIVE", "WALLET", "OTHER"]).optional().nullable(),
    number: z.string().max(40).optional().nullable(),
});

export const createTransactionSchema = z.object({
    type: transactionTypeSchema,
    status: transactionStatusSchema.optional(),
    // Required: the description is the transaction's title everywhere
    // (`getTransactionDisplayTitle`), so an empty one leaves the record showing
    // a generated "Gasto – <merchant>" instead of a name the user recognises.
    description: z.string().trim().min(1, "La descripción es requerida").max(2000),
    amount: z.number().positive("Amount must be positive"),
    currency: z.string().min(3, "Currency code required").max(3, "Use ISO 4217 code"),
    date: z.string().refine(
        (val) => !isNaN(Date.parse(val)),
        { message: "Invalid date format. Use ISO 8601" },
    ),
    merchant: z.string().max(255).optional().nullable(),
    categoryId: z.string().uuid("Invalid category ID").optional().nullable(),
    categoryName: z.string().max(255).optional().nullable(),
    institutionId: z.string().uuid("Invalid institution ID").optional().nullable(),
    institutionName: z.string().max(255).optional().nullable(),
    bankSourceAccountId: z.string().uuid("Invalid bank account ID").optional().nullable(),
    bankDestinationAccountId: z.string().uuid("Invalid bank account ID").optional().nullable(),
    bankCardId: z.string().uuid("Invalid bank card ID").optional().nullable(),
    bankInstitutionId: z.string().uuid("Invalid bank institution ID").optional().nullable(),
    // Tipo declarado por el usuario para el emisor, cuando la transacción lo funda.
    bankInstitutionKind: z.enum(["BANK", "COOPERATIVE", "WALLET", "OTHER"]).optional().nullable(),
    // Lo declarado por el usuario sobre cada cuenta del escaneo.
    scannedOwnership: z.record(z.string(), scannedDecisionSchema).optional().nullable(),
    bankCardStatementId: z.string().uuid("Invalid statement ID").optional().nullable(),
    tags: z.array(z.string().max(50)).max(20).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    executionId: z.string().uuid("Invalid execution ID").optional().nullable(),
    originalAmount: z.number().positive().optional().nullable(),
    originStats: z.record(z.string(), z.unknown()).optional().nullable(),
    paidWithCredit: z.boolean().optional().nullable(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial().extend({
    id: z.string().uuid("Invalid transaction ID"),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

// ─── Search / List Transactions ──────────────────────────────

export const searchTransactionsSchema = z.object({
    query: z.string().max(200).optional(),
    status: transactionStatusSchema.optional(),
    types: z.array(transactionTypeSchema).optional(),
    currency: z.string().min(3).max(3).optional(),
});

export type SearchTransactionsInput = z.infer<typeof searchTransactionsSchema>;

// ─── Paginated Search ────────────────────────────────────────

export const paginatedSearchSchema = z.object({
    query: z.string().max(200).optional(),
    status: transactionStatusSchema.optional(),
    types: z.array(transactionTypeSchema).optional(),
    currency: z.string().min(3).max(3).optional(),
    categoryId: z.string().uuid().optional(),
    institutionId: z.string().uuid().optional(),
    dateFrom: z.string().refine(v => !v || !isNaN(Date.parse(v)), "Invalid dateFrom").optional(),
    dateTo: z.string().refine(v => !v || !isNaN(Date.parse(v)), "Invalid dateTo").optional(),
    amountMin: z.number().nonnegative().optional(),
    amountMax: z.number().nonnegative().optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
});

export type PaginatedSearchInput = z.infer<typeof paginatedSearchSchema>;

// ─── Duplicate Operations ────────────────────────────────────

export const markDuplicateSchema = z.object({
    transactionId: z.string().uuid("Invalid transaction ID"),
    duplicateOfId: z.string().uuid("Invalid duplicate-of ID"),
});

export type MarkDuplicateInput = z.infer<typeof markDuplicateSchema>;

// ─── Workflow Transitions ────────────────────────────────────

export const transactionIdSchema = z.string().uuid("Invalid transaction ID");

export const bulkActionSchema = z.object({
    ids: z.array(transactionIdSchema).min(1, "At least one transaction ID is required"),
});

export const bulkCategorizeSchema = bulkActionSchema.extend({
    categoryId: z.string().uuid("Invalid category ID"),
});

// ─── Dashboard Params ────────────────────────────────────────

export const dateFilterSchema = z.object({
    startDate: z.string().refine(v => !isNaN(Date.parse(v)), "Invalid startDate").optional(),
    endDate: z.string().refine(v => !isNaN(Date.parse(v)), "Invalid endDate").optional(),
});

export const monthlyBreakdownSchema = dateFilterSchema.extend({
    monthsBack: z.number().int().min(1).max(24).default(6),
});

export const recentTransactionsSchema = dateFilterSchema.extend({
    limit: z.number().int().min(1).max(50).default(5),
});

// ─── Inbox Operations ────────────────────────────────────────

export const mapInboxTransactionSchema = z.object({
    scannerTransactionId: z.string().uuid("Invalid scanner transaction ID"),
    description: z.string().min(1, "La descripción es requerida").max(2000),
    categoryId: z.string().uuid("Invalid category ID").optional().nullable(),
    categoryName: z.string().max(255).optional().nullable(),
    institutionId: z.string().uuid("Invalid institution ID").optional().nullable(),
    institutionName: z.string().max(255).optional().nullable(),
    bankSourceAccountId: z.string().uuid("Invalid bank account ID").optional().nullable(),
    bankDestinationAccountId: z.string().uuid("Invalid bank account ID").optional().nullable(),
    bankCardId: z.string().uuid("Invalid bank card ID").optional().nullable(),
    bankInstitutionId: z.string().uuid("Invalid bank institution ID").optional().nullable(),
    // Tipo declarado por el usuario para el emisor, cuando la confirmación lo funda.
    bankInstitutionKind: z.enum(["BANK", "COOPERATIVE", "WALLET", "OTHER"]).optional().nullable(),
    // Lo declarado por el usuario sobre cada cuenta del escaneo.
    scannedOwnership: z.record(z.string(), scannedDecisionSchema).optional().nullable(),
    bankCardStatementId: z.string().uuid("Invalid statement ID").optional().nullable(),
    type: transactionTypeSchema.optional(),
    notes: z.string().max(2000).optional().nullable(),
    merchant: z.string().max(255).optional().nullable(),
    amount: z.number().positive().optional().nullable(),
    date: z.string().optional().nullable(),
    tags: z.array(z.string().max(50)).max(20).optional().nullable(),
    paidWithCredit: z.boolean().optional().nullable(),
});

export type MapInboxTransactionInput = z.infer<typeof mapInboxTransactionSchema>;

export const dismissInboxSchema = z.object({
    scannerTransactionId: z.string().uuid("Invalid scanner transaction ID"),
});
