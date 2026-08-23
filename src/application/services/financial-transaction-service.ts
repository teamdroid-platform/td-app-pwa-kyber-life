import { UUID } from "../../domain/core";
import { FinancialTransaction, FinancialTransactionType, FinancialTransactionStatus } from "../../domain/entities/financial";
import { IFinancialTransactionRepository, IFinancialTransactionAuditLogRepository } from "../../domain/repositories/financial";
import { findDuplicates } from "../../domain/services/financial-deduplication";
import { PaginationParams, PaginatedResult, TransactionSearchFilters } from "../../domain/pagination";

export interface CreateFinancialTransactionDTO {
    ownerUserId: UUID;
    type: FinancialTransactionType;
    status?: FinancialTransactionStatus;
    amount: number;
    currency: string;
    date: string; // ISODate
    merchant?: string | null;
    description: string;
    categoryId?: UUID | null;
    categoryName?: string | null;
    institutionId?: UUID | null;
    institutionName?: string | null;
    bankSourceAccountId?: UUID | null;
    bankDestinationAccountId?: UUID | null;
    bankCardId?: UUID | null;
    bankInstitutionId?: UUID | null;
    bankCardStatementId?: UUID | null;
    /** Tipo de emisor declarado por el usuario al crear la institución. */
    bankInstitutionKind?: 'BANK' | 'COOPERATIVE' | 'WALLET' | 'OTHER' | null;
    /** Lo que el usuario corrigió sobre cada cuenta del escaneo. */
    scannedOwnership?: Record<string, import("./bank-service").ScannedAccountDecision> | null;
    tags?: string[] | null;
    notes?: string | null;
    executionId?: UUID | null;
    originalAmount?: number | null;
    originStats?: Record<string, unknown> | null;
    paidWithCredit?: boolean | null;
}

// ─── Valid Workflow Transitions ───────────────────────────────

const VALID_TRANSITIONS: Record<FinancialTransactionStatus, readonly FinancialTransactionStatus[]> = {
    DETECTED:  ['REVIEWED', 'CONFIRMED', 'REJECTED', 'ARCHIVED', 'DELETED'],
    REVIEWED:  ['CONFIRMED', 'REJECTED', 'ARCHIVED', 'DELETED'],
    CONFIRMED: ['ARCHIVED', 'DELETED'],
    REJECTED:  ['DETECTED', 'DELETED'],
    MANUAL:    ['CONFIRMED', 'ARCHIVED', 'DELETED'],
    DUPLICATE: ['CONFIRMED', 'DELETED'],
    ARCHIVED:  ['DETECTED'],
    DELETED:   [],
} as const;

function assertValidTransition(
    currentStatus: FinancialTransactionStatus,
    targetStatus: FinancialTransactionStatus,
): void {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed.includes(targetStatus)) {
        throw new Error(
            `Invalid transition: cannot move from "${currentStatus}" to "${targetStatus}". ` +
            `Allowed: [${allowed.join(", ")}]`,
        );
    }
}

// ─── Service ─────────────────────────────────────────────────

export class FinancialTransactionService {
    constructor(
        private transactionRepo: IFinancialTransactionRepository,
        private auditLogRepo: IFinancialTransactionAuditLogRepository,
        private institutionRepo?: import("../../domain/repositories/financial").IFinancialInstitutionRepository,
        private categoryRepo?: import("../../domain/repositories/financial").IFinancialCategoryRepository,
        /** Opcional: sin él, capturar o editar no sincroniza el módulo Bancos. */
        private bankService?: import("./bank-service").BankService
    ) {}

    // ── Create ───────────────────────────────────────────────

    async createTransaction(dto: CreateFinancialTransactionDTO): Promise<FinancialTransaction> {
        const existingTransactions = await this.transactionRepo.findByOwnerId(dto.ownerUserId);
        const duplicateIds = findDuplicates(dto, existingTransactions);
        const hasDuplicate = duplicateIds.length > 0;

        let finalInstitutionId = dto.institutionId ?? null;
        let finalCategoryId = dto.categoryId ?? null;
        const now = new Date().toISOString();

        if (!finalInstitutionId && dto.institutionName && this.institutionRepo) {
            const institutions = await this.institutionRepo.findByOwnerId(dto.ownerUserId);
            const existing = institutions.find(i => i.name.toLowerCase() === dto.institutionName!.toLowerCase() && !i.isDeleted);
            if (existing) {
                finalInstitutionId = existing.id!;
            } else {
                const newInst = await this.institutionRepo.create({
                    id: crypto.randomUUID(), ownerUserId: dto.ownerUserId, name: dto.institutionName, institutionTypeId: null, isDeleted: false, createdAt: now, updatedAt: now
                });
                finalInstitutionId = newInst.id!;
            }
        }

        if (!finalCategoryId && dto.categoryName && this.categoryRepo) {
            const categories = await this.categoryRepo.findAllBaseAndUser(dto.ownerUserId);
            const existing = categories.find(c => c.name.toLowerCase() === dto.categoryName!.toLowerCase() && !c.isDeleted);
            if (existing) {
                finalCategoryId = existing.id!;
            } else {
                const newCat = await this.categoryRepo.create({
                    id: crypto.randomUUID(), ownerUserId: dto.ownerUserId, name: dto.categoryName, isDeleted: false, createdAt: now, updatedAt: now
                });
                finalCategoryId = newCat.id!;
            }
        }

        // Todo lo que escribe una transacción pasa por el mismo punto: crea el
        // emisor si hace falta y liga lo que ya se sepa. Los saldos no se tocan
        // porque no se guardan: se derivan de estas mismas transacciones.
        const bankLinks = this.bankService
            ? await this.bankService.syncTransactionBankLinks(dto.ownerUserId, {
                merchant: dto.merchant ?? dto.institutionName ?? null,
                currency: dto.currency,
                paidWithCredit: dto.paidWithCredit ?? false,
                institutionKind: dto.bankInstitutionKind ?? null,
                ownership: dto.scannedOwnership ?? null,
                bankSourceAccountId: dto.bankSourceAccountId ?? null,
                bankDestinationAccountId: dto.bankDestinationAccountId ?? null,
                bankCardId: dto.bankCardId ?? null,
                bankInstitutionId: dto.bankInstitutionId ?? null,
            })
            : null;

        const transaction: FinancialTransaction = {
            id: crypto.randomUUID(),
            ownerUserId: dto.ownerUserId,
            type: dto.type,
            status: dto.status ?? 'DETECTED',
            amount: dto.amount,
            currency: dto.currency,
            date: dto.date,
            // `merchant` is the persisted display field for a transaction's vendor/
            // institution. When a manual transaction provides only an institution
            // name (no explicit merchant), fall back to it so the card shows the
            // institution immediately — matching the edit and scan flows.
            merchant: dto.merchant ?? dto.institutionName ?? null,
            description: dto.description,
            categoryId: finalCategoryId,
            institutionId: finalInstitutionId,
            bankSourceAccountId: bankLinks?.bankSourceAccountId ?? dto.bankSourceAccountId ?? null,
            bankDestinationAccountId: bankLinks?.bankDestinationAccountId ?? dto.bankDestinationAccountId ?? null,
            bankCardId: bankLinks?.bankCardId ?? dto.bankCardId ?? null,
            bankInstitutionId: bankLinks?.bankInstitutionId ?? dto.bankInstitutionId ?? null,
            bankCardStatementId: dto.bankCardStatementId ?? null,
            tags: dto.tags ?? null,
            notes: dto.notes ?? null,
            possibleDuplicate: hasDuplicate,
            executionId: dto.executionId ?? null,
            originalAmount: dto.originalAmount ?? null,
            originStats: dto.originStats ?? null,
            paidWithCredit: dto.paidWithCredit ?? false,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
        };

        const created = await this.transactionRepo.create(transaction);

        const auditAction = hasDuplicate ? 'CREATED_WITH_DUPLICATE_FLAG' : 'CREATED';
        await this.writeAuditLog(created.id!, created.ownerUserId, auditAction, undefined, {
            ...(created as unknown as Record<string, unknown>),
            ...(hasDuplicate ? { duplicateOfIds: duplicateIds } : {}),
        });

        return created;
    }

    // ── Update ───────────────────────────────────────────────

    async updateTransaction(
        transactionId: UUID,
        userId: UUID,
        data: Partial<CreateFinancialTransactionDTO>
    ): Promise<FinancialTransaction> {
        const tx = await this.findOwnedTransactionOrThrow(transactionId, userId);
        const previousState = { ...tx } as unknown as Record<string, unknown>;

        let finalInstitutionId = data.institutionId !== undefined ? data.institutionId : tx.institutionId;
        let finalCategoryId = data.categoryId !== undefined ? data.categoryId : tx.categoryId;
        const now = new Date().toISOString();

        if (!finalInstitutionId && data.institutionName && this.institutionRepo) {
            const institutions = await this.institutionRepo.findByOwnerId(userId);
            const existing = institutions.find(i => i.name.toLowerCase() === data.institutionName!.toLowerCase() && !i.isDeleted);
            if (existing) {
                finalInstitutionId = existing.id!;
            } else {
                const newInst = await this.institutionRepo.create({
                    id: crypto.randomUUID(), ownerUserId: userId, name: data.institutionName, institutionTypeId: null, isDeleted: false, createdAt: now, updatedAt: now
                });
                finalInstitutionId = newInst.id!;
            }
        }

        if (!finalCategoryId && data.categoryName && this.categoryRepo) {
            const categories = await this.categoryRepo.findAllBaseAndUser(userId);
            const existing = categories.find(c => c.name.toLowerCase() === data.categoryName!.toLowerCase() && !c.isDeleted);
            if (existing) {
                finalCategoryId = existing.id!;
            } else {
                const newCat = await this.categoryRepo.create({
                    id: crypto.randomUUID(), ownerUserId: userId, name: data.categoryName, isDeleted: false, createdAt: now, updatedAt: now
                });
                finalCategoryId = newCat.id!;
            }
        }

        const { categoryName, institutionName, bankInstitutionKind, scannedOwnership, ...restData } = data;

        // Editar también sincroniza: si el merchant pasó a ser un banco, el
        // emisor nace aquí. Lo que el usuario haya elegido a mano no se pisa, y
        // una edición nunca funda cuentas — sin números enmascarados no hay de
        // dónde deducirlas.
        /**
         * Whether the caller mentioned a bank link at all.
         *
         * `??` cannot tell "leave it alone" from "clear it": both arrive as a
         * missing value and the stored link always won, so removing an account
         * from a transaction was impossible — it came back on the next read.
         * Presence of the key is what separates the two.
         */
        const mentions = (key: keyof CreateFinancialTransactionDTO) =>
            Object.prototype.hasOwnProperty.call(data, key);
        const clearedLink = (key: "bankSourceAccountId" | "bankDestinationAccountId" | "bankCardId") =>
            mentions(key) && data[key] === null;
        const linkOr = (key: "bankSourceAccountId" | "bankDestinationAccountId" | "bankCardId") =>
            mentions(key) ? (data[key] ?? null) : (tx[key] ?? null);

        const bankLinks = this.bankService
            ? await this.bankService.syncTransactionBankLinks(userId, {
                merchant: data.merchant ?? institutionName ?? tx.merchant ?? null,
                currency: data.currency ?? tx.currency,
                paidWithCredit: data.paidWithCredit ?? tx.paidWithCredit ?? false,
                institutionKind: bankInstitutionKind ?? null,
                ownership: scannedOwnership ?? null,
                bankSourceAccountId: linkOr("bankSourceAccountId"),
                bankDestinationAccountId: linkOr("bankDestinationAccountId"),
                bankCardId: linkOr("bankCardId"),
                bankInstitutionId: data.bankInstitutionId ?? tx.bankInstitutionId ?? null,
            })
            : null;

        const updatedTx: FinancialTransaction = {
            ...tx,
            ...restData,
            categoryName: categoryName === null ? undefined : (categoryName ?? tx.categoryName),
            institutionName: institutionName === null ? undefined : (institutionName ?? tx.institutionName),
            institutionId: finalInstitutionId,
            categoryId: finalCategoryId,
            // Un lado que el usuario vació se queda vacío: la identificación
            // automática puede volver a deducirlo del emisor, y reponerlo aquí
            // desharía justo lo que se acaba de pedir.
            bankSourceAccountId: clearedLink("bankSourceAccountId")
                ? null
                : bankLinks?.bankSourceAccountId ?? tx.bankSourceAccountId ?? null,
            bankDestinationAccountId: clearedLink("bankDestinationAccountId")
                ? null
                : bankLinks?.bankDestinationAccountId ?? tx.bankDestinationAccountId ?? null,
            bankCardId: clearedLink("bankCardId")
                ? null
                : bankLinks?.bankCardId ?? tx.bankCardId ?? null,
            bankInstitutionId: bankLinks?.bankInstitutionId ?? tx.bankInstitutionId ?? null,
            updatedAt: now,
        };

        const updated = await this.transactionRepo.update(updatedTx);

        await this.writeAuditLog(updated.id!, userId, 'UPDATED', previousState, 
            updated as unknown as Record<string, unknown>);

        return updated;
    }

    // ── Duplicate Operations ─────────────────────────────────

    async markAsDuplicate(transactionId: UUID, duplicateOfId: UUID, userId: UUID): Promise<FinancialTransaction> {
        const tx = await this.findOwnedTransactionOrThrow(transactionId, userId);
        const previousState = { ...tx } as unknown as Record<string, unknown>;

        tx.status = 'DUPLICATE';
        tx.possibleDuplicate = true;
        tx.updatedAt = new Date().toISOString();

        const updated = await this.transactionRepo.update(tx);

        await this.writeAuditLog(updated.id!, userId, 'MARKED_DUPLICATE', previousState, {
            ...(updated as unknown as Record<string, unknown>),
            duplicateOfId,
        });

        return updated;
    }

    async resolveDuplicate(transactionId: UUID, userId: UUID): Promise<FinancialTransaction> {
        const tx = await this.findOwnedTransactionOrThrow(transactionId, userId);
        const previousState = { ...tx } as unknown as Record<string, unknown>;

        tx.possibleDuplicate = false;
        tx.status = 'CONFIRMED';
        tx.updatedAt = new Date().toISOString();

        const updated = await this.transactionRepo.update(tx);

        await this.writeAuditLog(updated.id!, userId, 'DUPLICATE_RESOLVED', previousState,
            updated as unknown as Record<string, unknown>);

        return updated;
    }

    // ── Workflow Transitions ─────────────────────────────────

    async reviewTransaction(transactionId: UUID, userId: UUID): Promise<FinancialTransaction> {
        return this.transitionStatus(transactionId, userId, 'REVIEWED', 'STATUS_REVIEWED');
    }

    async rejectTransaction(transactionId: UUID, userId: UUID): Promise<FinancialTransaction> {
        return this.transitionStatus(transactionId, userId, 'REJECTED', 'STATUS_REJECTED');
    }

    async archiveTransaction(transactionId: UUID, userId: UUID): Promise<FinancialTransaction> {
        return this.transitionStatus(transactionId, userId, 'ARCHIVED', 'STATUS_ARCHIVED');
    }

    async softDeleteTransaction(transactionId: UUID, userId: UUID): Promise<FinancialTransaction> {
        const tx = await this.findOwnedTransactionOrThrow(transactionId, userId);
        
        await this.transactionRepo.delete(transactionId);
        
        // We set the status locally so the UI can optimistically remove it
        tx.status = 'DELETED';
        return tx;
    }

    // ── Bulk Operations ──────────────────────────────────────

    async bulkConfirmTransactions(transactionIds: UUID[], userId: UUID): Promise<FinancialTransaction[]> {
        return Promise.all(transactionIds.map(id => this.transitionStatus(id, userId, 'CONFIRMED', 'STATUS_CONFIRMED')));
    }

    async bulkRejectTransactions(transactionIds: UUID[], userId: UUID): Promise<FinancialTransaction[]> {
        return Promise.all(transactionIds.map(id => this.transitionStatus(id, userId, 'REJECTED', 'STATUS_REJECTED')));
    }

    async bulkArchiveTransactions(transactionIds: UUID[], userId: UUID): Promise<FinancialTransaction[]> {
        return Promise.all(transactionIds.map(id => this.transitionStatus(id, userId, 'ARCHIVED', 'STATUS_ARCHIVED')));
    }

    async bulkDeleteTransactions(transactionIds: UUID[], userId: UUID): Promise<FinancialTransaction[]> {
        return Promise.all(transactionIds.map(id => this.softDeleteTransaction(id, userId)));
    }

    async bulkCategorizeTransactions(transactionIds: UUID[], categoryId: UUID, userId: UUID): Promise<FinancialTransaction[]> {
        return Promise.all(transactionIds.map(id => this.updateTransaction(id, userId, { categoryId })));
    }

    // ── Queries ──────────────────────────────────────────────

    async getTransactionsByUser(userId: UUID): Promise<FinancialTransaction[]> {
        const transactions = await this.transactionRepo.findByOwnerId(userId);
        return this.enrichTransactions(transactions, userId);
    }

    async getTransactionById(id: string): Promise<FinancialTransaction | null> {
        const tx = await this.transactionRepo.findById(id);
        if (tx) {
            const enriched = await this.enrichTransactions([tx], tx.ownerUserId);
            return enriched[0];
        }
        return null;
    }

    async getUniqueTags(userId: UUID): Promise<string[]> {
        if (!this.transactionRepo.getUniqueTags) {
            console.warn("getUniqueTags is not implemented on the current transaction repository.");
            return [];
        }
        return this.transactionRepo.getUniqueTags(userId);
    }

    /**
     * The owner's most used descriptions, most frequent first, grouped by
     * transaction type.
     *
     * Delegated to the repository so the store can aggregate it: this feeds a
     * handful of suggestion chips, and counting them here would mean pulling
     * the history on every visit to the first step.
     */
    async getFrequentDescriptions(userId: UUID, limit = 5): Promise<Record<string, string[]>> {
        if (!this.transactionRepo.getFrequentDescriptions) {
            console.warn("getFrequentDescriptions is not implemented on the current transaction repository.");
            return {};
        }
        return this.transactionRepo.getFrequentDescriptions(userId, limit);
    }

    async getAuditTrail(transactionId: UUID): Promise<unknown[]> {
        return this.auditLogRepo.findByTransactionId(transactionId);
    }

    async searchPaginated(
        userId: UUID,
        filters: TransactionSearchFilters,
        pagination?: Partial<PaginationParams>,
    ): Promise<PaginatedResult<FinancialTransaction>> {
        const page = Math.max(1, pagination?.page ?? 1);
        const pageSize = Math.min(100, Math.max(1, pagination?.pageSize ?? 20));

        await this.resolveSearchFilters(userId, filters);

        const result = await this.transactionRepo.findPaginated(userId, filters, { page, pageSize });
        result.data = await this.enrichTransactions(result.data, userId);
        return result;
    }

    async searchAllFiltered(
        userId: UUID,
        filters: TransactionSearchFilters,
    ): Promise<FinancialTransaction[]> {
        await this.resolveSearchFilters(userId, filters);

        const transactions = await this.transactionRepo.search(userId, filters.query || '', filters);
        return this.enrichTransactions(transactions, userId);
    }

    // ── Private Helpers ──────────────────────────────────────

    private async resolveSearchFilters(userId: UUID, filters: TransactionSearchFilters): Promise<void> {
        if (filters.query) {
            const words = filters.query.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length > 0) {
                const categories = this.categoryRepo ? await this.categoryRepo.findAllBaseAndUser(userId) : [];
                const institutions = this.institutionRepo ? await this.institutionRepo.findByOwnerId(userId) : [];

                const wordCategoryIds = words.map(word => 
                    categories.filter(c => c.name.toLowerCase().includes(word.toLowerCase())).map(c => c.id!)
                );
                const wordInstitutionIds = words.map(word => 
                    institutions.filter(i => i.name.toLowerCase().includes(word.toLowerCase())).map(i => i.id!)
                );

                (filters as any).words = words;
                (filters as any).wordCategoryIds = wordCategoryIds;
                (filters as any).wordInstitutionIds = wordInstitutionIds;
            }
        }
    }

    private async enrichTransactions(transactions: FinancialTransaction[], userId: UUID): Promise<FinancialTransaction[]> {
        if (transactions.length === 0) return transactions;

        try {
            const [categories, institutions] = await Promise.all([
                this.categoryRepo ? this.categoryRepo.findAllBaseAndUser(userId) : Promise.resolve([]),
                this.institutionRepo ? this.institutionRepo.findByOwnerId(userId) : Promise.resolve([]),
            ]);
            const categoryMap = new Map(categories.map(c => [c.id, c]));
            const institutionMap = new Map(institutions.map(i => [i.id, i]));

            return transactions.map(tx => {
                const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
                const institution = tx.institutionId ? institutionMap.get(tx.institutionId) : undefined;
                return {
                    ...tx,
                    categoryName: category?.name ?? tx.categoryName,
                    categoryColor: category?.color ?? tx.categoryColor,
                    // Resolve the institution name from its id so the UI can always
                    // prioritize it over the stored merchant.
                    institutionName: institution?.name ?? tx.institutionName,
                };
            });
        } catch (e) {
            console.error("Failed to enrich transactions", e);
            return transactions;
        }
    }

    private async findOwnedTransactionOrThrow(transactionId: UUID, userId: UUID): Promise<FinancialTransaction> {
        const tx = await this.transactionRepo.findById(transactionId);
        if (!tx || tx.ownerUserId !== userId) {
            throw new Error("Transaction not found or unauthorized");
        }
        return tx;
    }

    private async transitionStatus(
        transactionId: UUID,
        userId: UUID,
        targetStatus: FinancialTransactionStatus,
        auditAction: string,
    ): Promise<FinancialTransaction> {
        const tx = await this.findOwnedTransactionOrThrow(transactionId, userId);
        
        // Idempotency check: if already in target state, do nothing
        if (tx.status === targetStatus) {
            return tx;
        }

        const previousState = { ...tx } as unknown as Record<string, unknown>;

        assertValidTransition(tx.status, targetStatus);

        tx.status = targetStatus;
        tx.updatedAt = new Date().toISOString();

        const updated = await this.transactionRepo.update(tx);

        await this.writeAuditLog(updated.id!, userId, auditAction, previousState,
            updated as unknown as Record<string, unknown>);

        return updated;
    }

    private async writeAuditLog(
        transactionId: UUID,
        userId: UUID,
        action: string,
        previousState?: Record<string, unknown>,
        newState?: Record<string, unknown>,
    ): Promise<void> {
        const now = new Date().toISOString();
        await this.auditLogRepo.create({
            id: crypto.randomUUID(),
            transactionId,
            changedByUserId: userId,
            action,
            previousState: previousState ?? null,
            newState: newState ?? null,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
        });
    }
}
