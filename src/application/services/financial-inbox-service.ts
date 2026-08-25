import { UUID } from "../../domain/core";
import { FinancialScannerTransaction, FinancialTransaction } from "../../domain/entities/financial";
import { IFinancialScannerTransactionRepository, IFinancialTransactionRepository, IFinancialTransactionAuditLogRepository, IFinancialInstitutionRepository } from "../../domain/repositories/financial";
import { isTransactionPaidWithCredit } from "../../lib/financial-utils";

export function normalizeForMatch(str?: string | null): string {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();
}

export interface MapScannerTransactionDTO {
    scannerTransactionId: UUID;
    userId: UUID;
    categoryId?: UUID;
    categoryName?: string;
    institutionId?: UUID;
    institutionName?: string;
    bankSourceAccountId?: UUID;
    bankDestinationAccountId?: UUID;
    bankCardId?: UUID;
    bankInstitutionId?: UUID;
    description?: string;
    type?: FinancialTransaction['type'];
    notes?: string;
    merchant?: string;
    amount?: number;
    date?: string;
    tags?: string[];
    paidWithCredit?: boolean;
    /** Tipo declarado por el usuario para el emisor, si la confirmación lo funda. */
    bankInstitutionKind?: 'BANK' | 'COOPERATIVE' | 'WALLET' | 'OTHER' | null;
    /** Lo que el usuario corrigió sobre cada cuenta del escaneo. */
    scannedOwnership?: Record<string, import("./bank-service").ScannedAccountDecision> | null;
}

export class FinancialInboxService {
    constructor(
        private scannerRepo: IFinancialScannerTransactionRepository,
        private transactionRepo: IFinancialTransactionRepository,
        private auditLogRepo: IFinancialTransactionAuditLogRepository,
        private institutionRepo: IFinancialInstitutionRepository,
        private categoryRepo?: import("../../domain/repositories/financial").IFinancialCategoryRepository,
        /** Opcional: sin él, confirmar un escaneo no identifica cuentas. */
        private bankService?: import("./bank-service").BankService
    ) {}

    async getUnprocessedTransactions(userId: UUID): Promise<FinancialScannerTransaction[]> {
        return this.scannerRepo.findUnprocessedByOwnerId(userId);
    }

    async getScannerTransactionById(scannerTransactionId: UUID, userId: UUID): Promise<FinancialScannerTransaction | null> {
        const scannerTx = await this.scannerRepo.findById(scannerTransactionId);
        if (!scannerTx || scannerTx.ownerUserId !== userId) {
            return null;
        }
        return scannerTx;
    }

    async mapAndConfirmTransaction(dto: MapScannerTransactionDTO): Promise<FinancialTransaction> {
        const scannerTx = await this.scannerRepo.findById(dto.scannerTransactionId);
        if (!scannerTx || scannerTx.ownerUserId !== dto.userId) {
            throw new Error("Scanner transaction not found or unauthorized");
        }

        if (scannerTx.status !== 'DETECTED' && scannerTx.status !== 'IN_REVIEW') {
            throw new Error("This scanner transaction has already been processed");
        }

        // Create the definitive transaction
        const now = new Date().toISOString();
        
        // Map types correctly or fallback
        const transactionType = dto.type ?? (scannerTx.type as FinancialTransaction['type']) ?? 'EXPENSE';
        
        const isValidUuid = (id: string | null | undefined) => {
            if (!id) return false;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        };

        const validExecutionId = isValidUuid(scannerTx.executionId) ? scannerTx.executionId : undefined;

        let finalInstitutionId = dto.institutionId ?? null;
        let finalCategoryId = dto.categoryId ?? null;

        // Auto-create or reuse institution if name is provided but no ID
        if (!finalInstitutionId && dto.institutionName) {
            const userInstitutions = await this.institutionRepo.findByOwnerId(dto.userId);
            const normalizedTarget = normalizeForMatch(dto.institutionName);
            const existing = userInstitutions.find(inst => normalizeForMatch(inst.name) === normalizedTarget && !inst.isDeleted);
            
            if (existing && existing.id) {
                finalInstitutionId = existing.id;
            } else {
                const newInstitution = await this.institutionRepo.create({
                    id: crypto.randomUUID(),
                    ownerUserId: dto.userId,
                    name: dto.institutionName,
                    institutionTypeId: null,
                    isDeleted: false,
                    createdAt: now,
                    updatedAt: now
                });
                finalInstitutionId = newInstitution.id!;
            }
        }

        const categoryNameToMatch = dto.categoryName || scannerTx.category;

        if (!finalCategoryId && categoryNameToMatch && this.categoryRepo) {
            const categories = await this.categoryRepo.findAllBaseAndUser(dto.userId);
            const normalizedTarget = normalizeForMatch(categoryNameToMatch);
            const existing = categories.find(c => normalizeForMatch(c.name) === normalizedTarget && !c.isDeleted);
            if (existing && existing.id) {
                finalCategoryId = existing.id;
            } else if (dto.categoryName) {
                // Only auto-create when the user explicitly provided the category name
                const newCat = await this.categoryRepo.create({
                    id: crypto.randomUUID(), ownerUserId: dto.userId, name: dto.categoryName, isDeleted: false, createdAt: now, updatedAt: now
                });
                finalCategoryId = newCat.id!;
            }
            // When falling back to scannerTx.category and no match: skip (don't auto-create from scanner data)
        }

        const resolvedDescription = (dto.description?.trim() || scannerTx.description?.trim() || '').trim();
        if (!resolvedDescription) {
            throw new Error("La descripción es requerida para confirmar la transacción");
        }

        const detectedCredit = transactionType === 'EXPENSE' && isTransactionPaidWithCredit({
            type: transactionType,
            summary: scannerTx.summary,
            description: scannerTx.description ?? dto.description,
            originStats: scannerTx.originStats as Record<string, unknown> | null,
            notes: (scannerTx.originStats as Record<string, string>)?.emailBody,
        });

        const effectivePaidWithCredit = dto.paidWithCredit !== undefined && dto.paidWithCredit !== null
            ? dto.paidWithCredit
            : detectedCredit;

        // El mismo punto único por el que pasan la creación y la edición:
        // identifica las cuentas del escaneo, crea las que falten y respeta lo
        // que el usuario eligió a mano — él vio el movimiento, la heurística
        // solo vio una cadena enmascarada.
        const resolvedBank = this.bankService
            ? await this.bankService.syncTransactionBankLinks(dto.userId, {
                scannedAccounts: scannerTx.accounts ?? [],
                merchant: dto.merchant ?? scannerTx.merchant ?? null,
                currency: scannerTx.currency ?? 'USD',
                paidWithCredit: effectivePaidWithCredit,
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
            ownerUserId: dto.userId,
            type: transactionType,
            status: 'CONFIRMED',
            amount: dto.amount ?? scannerTx.amount ?? 0,
            originalAmount: scannerTx.amount,
            currency: scannerTx.currency || 'USD',
            merchant: dto.merchant ?? scannerTx.merchant ?? null,
            categoryId: finalCategoryId,
            institutionId: finalInstitutionId,
            bankSourceAccountId: dto.bankSourceAccountId ?? resolvedBank?.bankSourceAccountId ?? null,
            bankDestinationAccountId: dto.bankDestinationAccountId ?? resolvedBank?.bankDestinationAccountId ?? null,
            bankCardId: dto.bankCardId ?? resolvedBank?.bankCardId ?? null,
            bankInstitutionId: dto.bankInstitutionId ?? resolvedBank?.bankInstitutionId ?? null,
            bankCounterpartyObservationId: resolvedBank?.bankCounterpartyObservationId ?? null,
            tags: dto.tags ?? [],
            description: resolvedDescription,
            notes: dto.notes ?? (scannerTx.originStats as Record<string, string>)?.emailBody ?? (scannerTx.originStats as Record<string, string>)?.snippet ?? null,
            possibleDuplicate: false,
            paidWithCredit: effectivePaidWithCredit,
            executionId: validExecutionId,
            originStats: {
                ...((scannerTx.originStats as Record<string, unknown>) || {}),
                originalExecutionId: scannerTx.executionId, // Preserve the original non-UUID execution ID for debugging
            },
            date: dto.date ?? scannerTx.date ?? now,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
        };

        const createdTx = await this.transactionRepo.create(transaction);

        // Audit Log
        await this.auditLogRepo.create({
            id: crypto.randomUUID(),
            transactionId: createdTx.id!,
            changedByUserId: dto.userId,
            action: 'MAPPED_FROM_INBOX',
            newState: createdTx as any,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
        });

        // Mark scanner transaction as processed
        scannerTx.status = 'APPROVED';
        scannerTx.updatedAt = new Date().toISOString();
        await this.scannerRepo.update(scannerTx);

        return createdTx;
    }

    async dismissTransaction(scannerTransactionId: UUID, userId: UUID): Promise<void> {
        const scannerTx = await this.scannerRepo.findById(scannerTransactionId);
        if (!scannerTx || scannerTx.ownerUserId !== userId) {
            throw new Error("Scanner transaction not found or unauthorized");
        }

        scannerTx.status = 'REJECTED';
        scannerTx.description = (scannerTx.description ? scannerTx.description + " | " : "") + "Dismissed by user";
        scannerTx.updatedAt = new Date().toISOString();
        await this.scannerRepo.update(scannerTx);
    }
}
