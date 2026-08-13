import { UUID, ISODate } from "../core";
import { IRepository } from "./index";
import {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement
} from "../entities/bank";

export interface IBankInstitutionRepository extends IRepository<BankInstitution> {
    findByOwnerId(userId: UUID): Promise<BankInstitution[]>;
    findByName(userId: UUID, name: string): Promise<BankInstitution | null>;
}

export interface IBankAccountRepository extends IRepository<BankAccount> {
    findByOwnerId(userId: UUID): Promise<BankAccount[]>;
    findByInstitutionId(userId: UUID, institutionId: UUID): Promise<BankAccount[]>;
    /** La cuenta de efectivo del usuario, o null si aún no existe. */
    findCashAccount(userId: UUID): Promise<BankAccount | null>;
}

export interface IBankCardRepository extends IRepository<BankCard> {
    findByOwnerId(userId: UUID): Promise<BankCard[]>;
    findByAccountId(userId: UUID, accountId: UUID): Promise<BankCard[]>;
}

export interface IBankAccountBalanceSnapshotRepository extends IRepository<BankAccountBalanceSnapshot> {
    /** El corte más reciente con `asOf` <= reference, o null. */
    findLatestForAccount(accountId: UUID, reference: ISODate): Promise<BankAccountBalanceSnapshot | null>;
    findByAccountId(accountId: UUID): Promise<BankAccountBalanceSnapshot[]>;
}

export interface IBankCardStatementRepository extends IRepository<BankCardStatement> {
    findByCardId(cardId: UUID): Promise<BankCardStatement[]>;
    findOpenForCard(cardId: UUID): Promise<BankCardStatement | null>;
    findByCardAndPeriodStart(cardId: UUID, periodStart: ISODate): Promise<BankCardStatement | null>;
}

export interface BankMovementFilter {
    accountId?: UUID;
    cardId?: UUID;
    /** Solo movimientos con `date` > since. */
    since?: ISODate;
    until?: ISODate;
    limit?: number;
}

/** Solo lectura: la vista bank_movements se deriva de financial_transactions. */
export interface IBankMovementRepository {
    find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]>;
    findAllForOwner(userId: UUID): Promise<BankMovement[]>;
}
