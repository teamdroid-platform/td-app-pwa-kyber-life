import { BaseEntity, UUID, ISODate } from "../core";

export type BankInstitutionKind = 'BANK' | 'COOPERATIVE' | 'WALLET' | 'OTHER';
export type BankAccountType = 'CHECKING' | 'SAVINGS' | 'CASH' | 'INVESTMENT';
export type BankAccountStatus = 'ACTIVE' | 'CLOSED';
export type BankCardType = 'DEBIT' | 'CREDIT';
export type BankCardStatus = 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'CLOSED';
export type BankSnapshotSource = 'MANUAL' | 'SCAN' | 'INITIAL';
export type BankStatementStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE';

/** Dirección de una línea del libro mayor derivado. */
export type BankMovementDirection = 'IN' | 'OUT' | 'CHARGE' | 'PAYMENT';

/**
 * Emisor: banco, cooperativa o billetera digital.
 *
 * Distinto de `FinancialInstitution`, que significa **comercio**. Un banco
 * puede existir en ambos lados a la vez —un retiro en el Austro tiene al banco
 * como comercio— y `financialInstitutionId` los une.
 */
export interface BankInstitution extends BaseEntity {
    ownerUserId: UUID;
    name: string;
    shortName?: string | null;
    kind: BankInstitutionKind;
    logoUrl?: string | null;
    color?: string | null;
    country?: string | null;
    financialInstitutionId?: UUID | null;
    isUnconfirmed: boolean;
}

export interface BankAccount extends BaseEntity {
    ownerUserId: UUID;
    /** Null solo para la cuenta de efectivo. */
    institutionId?: UUID | null;
    accountType: BankAccountType;
    lastFour?: string | null;
    prefixDigits?: string | null;
    currency: string;
    status: BankAccountStatus;
    isUnconfirmed: boolean;
    /** Enriquecido en lectura, no persiste. */
    institutionName?: string;
}

/**
 * Tarjeta de débito o crédito.
 *
 * En Ecuador la de débito golpea el saldo de la cuenta a la que está atada; la
 * de crédito la emite la institución directo al cliente y no cuelga de ninguna
 * cuenta. Los CHECK de la tabla hacen imposible el estado inválido.
 */
export interface BankCard extends BaseEntity {
    ownerUserId: UUID;
    /**
     * El emisor. Solo puede faltar mientras la tarjeta está sin confirmar: una
     * compra nombra la tarjeta pero no el banco que la emitió, así que se
     * detecta primero y se asigna después, en el mantenimiento.
     */
    institutionId?: UUID | null;
    /** Obligatorio en DEBIT, siempre null en CREDIT. */
    accountId?: UUID | null;
    cardType: BankCardType;
    brand?: string | null;
    bin?: string | null;
    lastFour?: string | null;
    prefixDigits?: string | null;
    currency: string;
    creditLimit?: number | null;
    statementDay?: number | null;
    dueDay?: number | null;
    status: BankCardStatus;
    isUnconfirmed: boolean;
    institutionName?: string;
    accountName?: string;
}

/**
 * Saldo declarado a una fecha. El saldo actual se calcula desde el corte más
 * reciente más los movimientos posteriores, así que corregirlo no exige
 * reescribir historia.
 */
export interface BankAccountBalanceSnapshot extends BaseEntity {
    ownerUserId: UUID;
    accountId: UUID;
    balance: number;
    asOf: ISODate;
    source: BankSnapshotSource;
    note?: string | null;
}

export interface BankCardStatement extends BaseEntity {
    ownerUserId: UUID;
    cardId: UUID;
    periodStart: ISODate;
    periodEnd: ISODate;
    dueDate: ISODate;
    /** Lo que la app sumó de consumos detectados. */
    computedAmount: number;
    /** Lo que declara el banco. Null significa "igual al calculado". */
    totalAmount?: number | null;
    paidAmount: number;
    status: BankStatementStatus;
}

/** Fila de la vista bank_movements. No es una entidad persistida. */
export interface BankMovement {
    transactionId: UUID;
    ownerUserId: UUID;
    date: ISODate;
    accountId?: UUID | null;
    cardId?: UUID | null;
    direction: BankMovementDirection;
    amount: number;
    currency: string;
    description?: string | null;
    merchant?: string | null;
    categoryId?: UUID | null;
}

export type BankNumberResolution = 'EXACT' | 'INFERRED' | 'MANUAL' | 'EXTERNAL' | 'PENDING';

/**
 * Una forma concreta en que se vio escrito un número, con sus partes parseadas.
 * La cadena cruda se conserva íntegra: si las reglas de emparejamiento mejoran,
 * todo se puede recalcular sin haber perdido nada.
 */
export interface BankNumberObservation extends BaseEntity {
    ownerUserId: UUID;
    raw: string;
    prefixDigits: string;
    suffixDigits: string;
    totalLength?: number | null;
    bin?: string | null;
    brand?: string | null;
    accountTypeHint?: string | null;
    institutionHint?: string | null;
    isComplete: boolean;
    accountId?: UUID | null;
    cardId?: UUID | null;
    resolution: BankNumberResolution;
    occurrences: number;
}
