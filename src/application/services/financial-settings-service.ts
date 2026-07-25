import { UUID } from "@/domain/core";
import { FinancialInstitution, FinancialAccount, FinancialCategory } from "@/domain/entities/financial";
import {
    IFinancialInstitutionRepository,
    IFinancialInstitutionTypeRepository,
    IFinancialAccountRepository,
    IFinancialCategoryRepository,
    IFinancialTransactionRepository
} from "@/domain/repositories/financial";
import { randomUUID } from "crypto";

/** Name of the base ("system") category orphaned transactions fall back to. */
const FALLBACK_CATEGORY_NAME = "otros";

export class FinancialSettingsService {
    constructor(
        private institutionTypeRepo: IFinancialInstitutionTypeRepository,
        private institutionRepo: IFinancialInstitutionRepository,
        private accountRepo: IFinancialAccountRepository,
        private categoryRepo: IFinancialCategoryRepository,
        private transactionRepo: IFinancialTransactionRepository
    ) {}

    // --- Institution Types ---
    
    async getInstitutionTypes(userId: UUID) {
        return this.institutionTypeRepo.findAllGlobalAndUser(userId);
    }
    
    async createInstitutionType(userId: UUID, data: any) {
        return this.institutionTypeRepo.create({
            id: randomUUID(),
            ownerUserId: userId,
            code: data.code,
            label: data.label,
            iconName: data.iconName || 'Tag',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        } as any);
    }

    // --- Institutions ---

    async getInstitutions(userId: UUID): Promise<FinancialInstitution[]> {
        return this.institutionRepo.findByOwnerId(userId);
    }

    async createInstitution(userId: UUID, data: Partial<FinancialInstitution>): Promise<FinancialInstitution> {
        const institution: FinancialInstitution = {
            id: randomUUID(),
            ownerUserId: userId,
            name: data.name!,
            logoUrl: data.logoUrl || null,
            institutionTypeId: data.institutionTypeId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: false
        };
        return this.institutionRepo.create(institution);
    }

    async updateInstitution(userId: UUID, institutionId: UUID, data: Partial<FinancialInstitution>): Promise<FinancialInstitution> {
        const existing = await this.institutionRepo.findById(institutionId);
        if (!existing || existing.ownerUserId !== userId || existing.isDeleted) {
            throw new Error("Institution not found or access denied");
        }
        
        const updated: FinancialInstitution = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString()
        };
        
        return this.institutionRepo.update(updated);
    }

    async deleteInstitution(userId: UUID, institutionId: UUID): Promise<void> {
        const existing = await this.institutionRepo.findById(institutionId);
        if (!existing || existing.ownerUserId !== userId) {
            throw new Error("Institution not found or access denied");
        }

        // Soft delete
        const updated: FinancialInstitution = {
            ...existing,
            isDeleted: true,
            updatedAt: new Date().toISOString()
        };
        await this.institutionRepo.update(updated);
    }

    /** How many of the user's transactions are linked to this institution. */
    async getInstitutionTransactionCount(userId: UUID, institutionId: UUID): Promise<number> {
        const existing = await this.institutionRepo.findById(institutionId);
        if (!existing || existing.ownerUserId !== userId) {
            throw new Error("Institution not found or access denied");
        }
        return this.transactionRepo.countByInstitutionId(userId, institutionId);
    }

    /**
     * Merge (unify) one institution into another: every transaction linked to
     * `sourceId` is reassigned to `targetId`, then the source institution is
     * removed. Both must belong to the user and be different. Returns how many
     * transactions were reassigned.
     */
    async mergeInstitution(userId: UUID, sourceId: UUID, targetId: UUID): Promise<{ reassignedCount: number }> {
        if (sourceId === targetId) {
            throw new Error("No se puede fusionar una institución consigo misma");
        }

        const source = await this.institutionRepo.findById(sourceId);
        if (!source || source.ownerUserId !== userId) {
            throw new Error("Institution not found or access denied");
        }

        const target = await this.institutionRepo.findById(targetId);
        if (!target || target.ownerUserId !== userId) {
            throw new Error("La institución destino no existe o no tienes acceso");
        }

        const reassignedCount = await this.transactionRepo.reassignInstitution(userId, sourceId, targetId);
        await this.institutionRepo.delete(sourceId);
        return { reassignedCount };
    }

    // --- Accounts ---

    async getAccounts(userId: UUID): Promise<FinancialAccount[]> {
        return this.accountRepo.findByOwnerId(userId);
    }

    async createAccount(userId: UUID, data: Partial<FinancialAccount>): Promise<FinancialAccount> {
        // Validate institution exists and belongs to user
        if (data.institutionId) {
            const institution = await this.institutionRepo.findById(data.institutionId);
            if (!institution || institution.ownerUserId !== userId || institution.isDeleted) {
                 throw new Error("Invalid institution");
            }
            if (institution.institutionTypeObj && !['FINANCIAL', 'DIGITAL_WALLET'].includes(institution.institutionTypeObj.code)) {
                 throw new Error("Accounts can only be associated with FINANCIAL or DIGITAL_WALLET institutions");
            }
        }

        const account: FinancialAccount = {
            id: randomUUID(),
            ownerUserId: userId,
            institutionId: data.institutionId || null,
            name: data.name!,
            accountType: data.accountType || 'CHECKING',
            lastFour: data.lastFour || null,
            currency: data.currency || 'USD',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: false
        };
        return this.accountRepo.create(account);
    }

    async updateAccount(userId: UUID, accountId: UUID, data: Partial<FinancialAccount>): Promise<FinancialAccount> {
        const existing = await this.accountRepo.findById(accountId);
        if (!existing || existing.ownerUserId !== userId || existing.isDeleted) {
            throw new Error("Account not found or access denied");
        }

        if (data.institutionId && data.institutionId !== existing.institutionId) {
            const institution = await this.institutionRepo.findById(data.institutionId);
            if (!institution || institution.ownerUserId !== userId || institution.isDeleted) {
                 throw new Error("Invalid institution");
            }
            if (institution.institutionTypeObj && !['FINANCIAL', 'DIGITAL_WALLET'].includes(institution.institutionTypeObj.code)) {
                 throw new Error("Accounts can only be associated with FINANCIAL or DIGITAL_WALLET institutions");
            }
        }
        
        const updated: FinancialAccount = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString()
        };
        
        return this.accountRepo.update(updated);
    }

    async deleteAccount(userId: UUID, accountId: UUID): Promise<void> {
        const existing = await this.accountRepo.findById(accountId);
        if (!existing || existing.ownerUserId !== userId) {
            throw new Error("Account not found or access denied");
        }
        
        // Soft delete
        const updated: FinancialAccount = {
            ...existing,
            isDeleted: true,
            updatedAt: new Date().toISOString()
        };
        await this.accountRepo.update(updated);
    }

    // --- Categories ---

    async getCategories(userId: UUID): Promise<FinancialCategory[]> {
        return this.categoryRepo.findAllBaseAndUser(userId);
    }

    async createCategory(userId: UUID, data: Partial<FinancialCategory>): Promise<FinancialCategory> {
        const category: FinancialCategory = {
            id: randomUUID(),
            ownerUserId: userId,
            name: data.name!,
            color: data.color || null,
            icon: data.icon || null,
            parentId: data.parentId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: false
        };
        return this.categoryRepo.create(category);
    }

    async updateCategory(userId: UUID, categoryId: UUID, data: Partial<FinancialCategory>): Promise<FinancialCategory> {
        const existing = await this.categoryRepo.findById(categoryId);
        if (!existing || existing.ownerUserId !== userId || existing.isDeleted) {
            throw new Error("Category not found or access denied");
        }
        
        // Cannot modify base categories (ownerUserId === null means system category)
        if (existing.ownerUserId === null) {
             throw new Error("Cannot modify system base categories");
        }
        
        const updated: FinancialCategory = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString()
        };
        
        return this.categoryRepo.update(updated);
    }

    /** How many of the user's transactions are classified under this category. */
    async getCategoryTransactionCount(userId: UUID, categoryId: UUID): Promise<number> {
        const existing = await this.categoryRepo.findById(categoryId);
        if (!existing || existing.ownerUserId !== userId) {
            throw new Error("Category not found or access denied");
        }
        return this.transactionRepo.countByCategoryId(userId, categoryId);
    }

    /**
     * Delete a user category. Any transaction still classified under it is first
     * reassigned to the base "Otros" category so none are left orphaned, then the
     * category itself is removed. Returns how many transactions were reassigned.
     */
    async deleteCategory(userId: UUID, categoryId: UUID): Promise<{ reassignedCount: number }> {
        const existing = await this.categoryRepo.findById(categoryId);
        if (!existing || existing.ownerUserId !== userId) {
            throw new Error("Category not found or access denied");
        }

        // Cannot delete base categories
        if (existing.ownerUserId === null) {
             throw new Error("Cannot delete system base categories");
        }

        // Move associated transactions to the "Otros" fallback before removing.
        const fallback = await this.findFallbackCategory(userId);
        let reassignedCount = 0;
        if (fallback && fallback.id && fallback.id !== categoryId) {
            reassignedCount = await this.transactionRepo.reassignCategory(userId, categoryId, fallback.id);
        }

        await this.categoryRepo.delete(categoryId);
        return { reassignedCount };
    }

    /** Resolve the base "Otros" category (ownerUserId === null) for fallback reassignment. */
    private async findFallbackCategory(userId: UUID): Promise<FinancialCategory | undefined> {
        const all = await this.categoryRepo.findAllBaseAndUser(userId);
        return all.find(c => c.ownerUserId === null && c.name.trim().toLowerCase() === FALLBACK_CATEGORY_NAME);
    }
}
