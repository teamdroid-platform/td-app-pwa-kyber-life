import { BaseEntity, UUID, CurrencyCode, ISODate } from "../core";

export interface User extends BaseEntity {
    email: string;
    passwordHash: string;
    defaultCurrencyCode: CurrencyCode;
    image: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    bio: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    parish: string | null;
    neighborhood: string | null;
    primaryStreet: string | null;
    secondaryStreet: string | null;
    addressReference: string | null;
    postalCode: string | null;
    socials: {
        facebook?: string | null;
        twitter?: string | null;
        linkedin?: string | null;
        instagram?: string | null;
    } | null;
}

export interface PasswordResetToken {
    id: UUID;
    userId: UUID;
    tokenHash: string;
    expiresAt: ISODate;
    usedAt: ISODate | null;
    createdAt: ISODate;
}

export interface Supermarket extends BaseEntity {
    ownerUserId: UUID;
    name: string;
    address: string | null;
}

export interface Category extends BaseEntity {
    ownerUserId: UUID | null; // null = system base category
    name: string;
}

export interface Unit extends BaseEntity {
    ownerUserId: UUID | null; // null = system base unit
    name: string;
    symbol: string | null;
}

export interface GenericItem extends BaseEntity {
    ownerUserId: UUID;
    canonicalName: string;
    aliases: string[];
    primaryCategoryId: UUID | null;
    secondaryCategoryIds: UUID[];
    imageUrl: string | null;
    globalPrice?: number | null;
    currencyCode?: string | null;
    lastPriceUpdate?: ISODate | null;
}

export interface BrandProduct extends BaseEntity {
    ownerUserId: UUID;
    genericItemId: UUID;
    brand: string;
    presentation?: string;
    imageUrl: string | null;
    globalPrice: number | null;
    currencyCode: CurrencyCode | null;
}

export interface Template extends BaseEntity {
    ownerUserId: UUID;
    name: string;
    tags: string[];
}

export interface TemplateItem {
    id: UUID;
    templateId: UUID;
    genericItemId: UUID;
    defaultQty: number | null;
    defaultUnitId: UUID | null;
    sortOrder: number | null;
}

export type PurchaseStatus = 'draft' | 'completed';

export interface Purchase extends BaseEntity {
    ownerUserId: UUID;
    supermarketId: UUID | null;
    date: ISODate;
    currencyCode: CurrencyCode;
    selectedTemplateIds: UUID[];
    totalPaid: number | null;
    subtotal?: number | null;
    discount?: number | null;
    tax?: number | null;
    status: PurchaseStatus;
    completedAt?: ISODate | null;
}

export interface PurchaseLine extends BaseEntity {
    purchaseId: UUID;
    genericItemId: UUID;
    brandProductId: UUID | null;
    qty: number | null;
    unitId: UUID | null;
    unitPrice: number | null;
    checked: boolean;
    lineAmountOverride: number | null;
    note: string | null;
}

export interface PriceObservation extends BaseEntity {
    ownerUserId: UUID;
    brandProductId: UUID;
    supermarketId: UUID;
    currencyCode: CurrencyCode;
    unitPrice: number | null; // Nullable to support "Availability without price"
    observedAt: ISODate; // ISO Date string
    sourcePurchaseId: UUID | null; // Null if manually entered
}

export * from './financial';
export * from './notification';
export * from './bank';
