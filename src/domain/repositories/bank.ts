import { UUID, ISODate } from "../core";
import { IRepository } from "./index";
import {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement,
    BankNumberObservation, BankNumberResolution, BankCardPayment
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
    /**
     * Mueve todas las cuentas del usuario de un emisor a otro. Devuelve cuántas
     * se movieron. Lo usa la unificación de instituciones duplicadas.
     */
    reassignInstitution(userId: UUID, fromInstitutionId: UUID, toInstitutionId: UUID): Promise<number>;
}

export interface IBankCardRepository extends IRepository<BankCard> {
    findByOwnerId(userId: UUID): Promise<BankCard[]>;
    findByAccountId(userId: UUID, accountId: UUID): Promise<BankCard[]>;
    /** El equivalente para tarjetas; ver {@link IBankAccountRepository.reassignInstitution}. */
    reassignInstitution(userId: UUID, fromInstitutionId: UUID, toInstitutionId: UUID): Promise<number>;
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

/** Pagos de tarjeta registrados desde Bancos, que no son transacciones. */
export interface IBankCardPaymentRepository extends IRepository<BankCardPayment> {
    findByCardId(userId: UUID, cardId: UUID): Promise<BankCardPayment[]>;
}

/** Solo lectura: la vista bank_movements se deriva de financial_transactions y bank_card_payments. */
export interface IBankMovementRepository {
    find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]>;
    findAllForOwner(userId: UUID): Promise<BankMovement[]>;
}

export interface IBankNumberObservationRepository extends IRepository<BankNumberObservation> {
    findByOwnerId(userId: UUID): Promise<BankNumberObservation[]>;
    /** La observación de esta cadena exacta, si ya se vio. */
    findByRaw(userId: UUID, raw: string): Promise<BankNumberObservation | null>;
    findByResolution(userId: UUID, resolution: BankNumberResolution): Promise<BankNumberObservation[]>;
    /** Las que ya apuntan a una identidad; alimentan el emparejamiento. */
    findResolved(userId: UUID): Promise<BankNumberObservation[]>;
}

/** Lo que movió una unificación, para poder decirlo en el aviso. */
export interface IdentityMergeResult {
    movedTransactions: number;
    movedObservations: number;
    /** Solo en tarjetas. */
    movedStatements?: number;
    /** Solo en cuentas. */
    movedSnapshots?: number;
    /** Solo en cuentas: tarjetas de débito que gastaban de una repetida. */
    movedCards?: number;
}

/**
 * Unificar tarjetas o cuentas repetidas: todo lo que cuelga de las repetidas
 * pasa a la que se queda, y las repetidas se archivan.
 *
 * Es un puerto propio y no un método de cada repositorio porque cruza hasta
 * seis tablas, y tiene que hacerlo de una vez: a medio camino la historia
 * quedaría repartida entre una identidad viva y otra archivada. En Supabase es
 * una función SQL transaccional; en memoria, la misma secuencia a mano.
 */
export interface IBankIdentityMergeRepository {
    mergeCards(userId: UUID, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult>;
    mergeAccounts(userId: UUID, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult>;
}
