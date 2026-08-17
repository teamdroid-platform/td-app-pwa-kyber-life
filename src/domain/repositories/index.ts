import { User, PasswordResetToken, Supermarket, Category, Unit, GenericItem, BrandProduct, Template, TemplateItem, Purchase, PurchaseLine, PriceObservation } from "../entities";
import { UUID } from "../core";

// Generic Repository Interface
export interface IRepository<T> {
    create(entity: T): Promise<T>;
    findById(id: UUID): Promise<T | null>;
    findAll(): Promise<T[]>;
    update(entity: T): Promise<T>;
    delete(id: UUID): Promise<void>; // Logical delete usually handled by update, but explicit delete method for API contract is good.
}

export interface IUserRepository extends IRepository<User> {
    findByEmail(email: string): Promise<User | null>;
}

export interface IPasswordResetTokenRepository extends IRepository<PasswordResetToken> {
    findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
}

export interface ISupermarketRepository extends IRepository<Supermarket> {
    findByOwnerId(userId: UUID): Promise<Supermarket[]>;
}

export interface ICategoryRepository extends IRepository<Category> {
    findAllBaseAndUser(userId: UUID): Promise<Category[]>;
}

export interface IUnitRepository extends IRepository<Unit> {
    findAllBaseAndUser(userId: UUID): Promise<Unit[]>;
}

export interface IGenericItemRepository extends IRepository<GenericItem> {
    findByOwnerId(userId: UUID): Promise<GenericItem[]>;
    search(userId: UUID, query: string): Promise<GenericItem[]>;
}

export interface IBrandProductRepository extends IRepository<BrandProduct> {
    findByGenericItemId(genericItemId: UUID): Promise<BrandProduct[]>;
    findByOwnerId(userId: UUID): Promise<BrandProduct[]>;
}

export interface ITemplateRepository extends IRepository<Template> {
    findByOwnerId(userId: UUID): Promise<Template[]>;
}

export interface ITemplateItemRepository {
    create(item: TemplateItem): Promise<TemplateItem>;
    findById(id: UUID): Promise<TemplateItem | null>;
    findByTemplateId(templateId: UUID): Promise<TemplateItem[]>;
    update(item: TemplateItem): Promise<TemplateItem>;
    delete(id: UUID): Promise<void>;
    deleteByTemplateId(templateId: UUID): Promise<void>;
}

export interface IPurchaseRepository extends IRepository<Purchase> {
    findByOwnerId(userId: UUID, startDate?: string, endDate?: string): Promise<Purchase[]>;
    findRecent(userId: UUID, limit: number, startDate?: string, endDate?: string): Promise<Purchase[]>;
}

export interface IPurchaseLineRepository {
    create(line: PurchaseLine): Promise<PurchaseLine>;
    findById(id: UUID): Promise<PurchaseLine | null>;
    createMany(lines: PurchaseLine[]): Promise<PurchaseLine[]>;
    findByPurchaseId(purchaseId: UUID): Promise<PurchaseLine[]>;
    findByPurchaseIds(purchaseIds: UUID[]): Promise<PurchaseLine[]>;
    update(line: PurchaseLine): Promise<PurchaseLine>;
    delete(id: UUID): Promise<void>;
    deleteByPurchaseId(purchaseId: UUID): Promise<void>;
}

export interface IPriceObservationRepository extends IRepository<PriceObservation> {
    findLatestByProductAndSupermarket(brandProductId: UUID, supermarketId: UUID): Promise<PriceObservation | null>;
    findByOwnerId(userId: UUID): Promise<PriceObservation[]>;
}

export * from './financial';
export * from './notification';
export * from './bank';
