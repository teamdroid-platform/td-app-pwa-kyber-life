import { InMemoryRepository } from "./in-memory-repository";
import type { UUID, ISODate } from "@/domain/core";
import type {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement,
    BankNumberObservation, BankNumberResolution,
} from "@/domain/entities/bank";
import type {
    IBankInstitutionRepository, IBankAccountRepository, IBankCardRepository,
    IBankAccountBalanceSnapshotRepository, IBankCardStatementRepository,
    IBankMovementRepository, BankMovementFilter, IBankNumberObservationRepository,
} from "@/domain/repositories/bank";
import type { IFinancialTransactionRepository } from "@/domain/repositories/financial";

export class InMemoryBankInstitutionRepository
    extends InMemoryRepository<BankInstitution>
    implements IBankInstitutionRepository {

    async findByOwnerId(userId: UUID): Promise<BankInstitution[]> {
        return (await this.findAll()).filter(i => i.ownerUserId === userId);
    }

    async findByName(userId: UUID, name: string): Promise<BankInstitution | null> {
        const target = name.trim().toLowerCase();
        return (await this.findByOwnerId(userId))
            .find(i => i.name.trim().toLowerCase() === target) ?? null;
    }
}

export class InMemoryBankAccountRepository
    extends InMemoryRepository<BankAccount>
    implements IBankAccountRepository {

    async findByOwnerId(userId: UUID): Promise<BankAccount[]> {
        return (await this.findAll()).filter(a => a.ownerUserId === userId);
    }

    async findByInstitutionId(userId: UUID, institutionId: UUID): Promise<BankAccount[]> {
        return (await this.findByOwnerId(userId)).filter(a => a.institutionId === institutionId);
    }

    async findCashAccount(userId: UUID): Promise<BankAccount | null> {
        return (await this.findByOwnerId(userId)).find(a => a.accountType === "CASH") ?? null;
    }
}

export class InMemoryBankCardRepository
    extends InMemoryRepository<BankCard>
    implements IBankCardRepository {

    async findByOwnerId(userId: UUID): Promise<BankCard[]> {
        return (await this.findAll()).filter(c => c.ownerUserId === userId);
    }

    async findByAccountId(userId: UUID, accountId: UUID): Promise<BankCard[]> {
        return (await this.findByOwnerId(userId)).filter(c => c.accountId === accountId);
    }
}

export class InMemoryBankAccountBalanceSnapshotRepository
    extends InMemoryRepository<BankAccountBalanceSnapshot>
    implements IBankAccountBalanceSnapshotRepository {

    async findByAccountId(accountId: UUID): Promise<BankAccountBalanceSnapshot[]> {
        return (await this.findAll())
            .filter(s => s.accountId === accountId)
            .sort((a, b) => b.asOf.localeCompare(a.asOf));
    }

    async findLatestForAccount(accountId: UUID, reference: ISODate): Promise<BankAccountBalanceSnapshot | null> {
        const ref = Date.parse(reference);
        return (await this.findByAccountId(accountId))
            .find(s => Date.parse(s.asOf) <= ref) ?? null;
    }
}

export class InMemoryBankCardStatementRepository
    extends InMemoryRepository<BankCardStatement>
    implements IBankCardStatementRepository {

    async findByCardId(cardId: UUID): Promise<BankCardStatement[]> {
        return (await this.findAll())
            .filter(s => s.cardId === cardId)
            .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    }

    async findOpenForCard(cardId: UUID): Promise<BankCardStatement | null> {
        return (await this.findByCardId(cardId)).find(s => s.status === "OPEN") ?? null;
    }

    async findByCardAndPeriodStart(cardId: UUID, periodStart: ISODate): Promise<BankCardStatement | null> {
        return (await this.findByCardId(cardId)).find(s => s.periodStart === periodStart) ?? null;
    }
}

/** Estados que la vista SQL excluye; se repiten aquí para que ambas coincidan. */
const EXCLUDED_STATUSES = ["REJECTED", "DELETED", "DUPLICATE"];

/**
 * Deriva las líneas del libro mayor desde las transacciones en memoria,
 * aplicando las mismas seis reglas que la vista `bank_movements`. No guarda
 * nada propio: si divergiera de la vista, los saldos en modo MEMORY mentirían
 * respecto a los de SUPABASE.
 */
export class InMemoryBankMovementRepository implements IBankMovementRepository {
    constructor(
        private readonly transactions: IFinancialTransactionRepository,
        private readonly cards: IBankCardRepository,
        private readonly statements: IBankCardStatementRepository,
    ) {}

    async findAllForOwner(userId: UUID): Promise<BankMovement[]> {
        const txs = await this.transactions.findByOwnerId(userId);
        const creditCardIds = new Set(
            (await this.cards.findByOwnerId(userId))
                .filter(c => c.cardType === "CREDIT")
                .map(c => c.id),
        );
        const out: BankMovement[] = [];

        for (const t of txs) {
            if (EXCLUDED_STATUSES.includes(t.status)) continue;

            const base = {
                transactionId: t.id, ownerUserId: t.ownerUserId, date: t.date,
                amount: Number(t.amount), currency: t.currency,
                description: t.description ?? null, merchant: t.merchant ?? null,
                categoryId: t.categoryId ?? null,
            };

            if (t.bankSourceAccountId) {
                out.push({ ...base, accountId: t.bankSourceAccountId, cardId: null, direction: "OUT" });
            }
            if (t.bankDestinationAccountId) {
                out.push({ ...base, accountId: t.bankDestinationAccountId, cardId: null, direction: "IN" });
            }
            if (t.bankCardId && creditCardIds.has(t.bankCardId) && t.paidWithCredit) {
                out.push({ ...base, accountId: null, cardId: t.bankCardId, direction: "CHARGE" });
            }
            if (t.bankCardStatementId) {
                const statement = await this.statements.findById(t.bankCardStatementId);
                if (statement) {
                    out.push({ ...base, accountId: null, cardId: statement.cardId, direction: "PAYMENT" });
                }
            }
        }

        return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }

    async find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]> {
        let movs = await this.findAllForOwner(userId);

        if (filter.accountId) movs = movs.filter(m => m.accountId === filter.accountId);
        if (filter.cardId) movs = movs.filter(m => m.cardId === filter.cardId);
        if (filter.since) movs = movs.filter(m => Date.parse(m.date) > Date.parse(filter.since!));
        if (filter.until) movs = movs.filter(m => Date.parse(m.date) <= Date.parse(filter.until!));

        return filter.limit ? movs.slice(0, filter.limit) : movs;
    }
}

export class InMemoryBankNumberObservationRepository
    extends InMemoryRepository<BankNumberObservation>
    implements IBankNumberObservationRepository {

    async findByOwnerId(userId: UUID): Promise<BankNumberObservation[]> {
        return (await this.findAll()).filter(o => o.ownerUserId === userId);
    }

    async findByRaw(userId: UUID, raw: string): Promise<BankNumberObservation | null> {
        return (await this.findByOwnerId(userId)).find(o => o.raw === raw) ?? null;
    }

    async findByResolution(userId: UUID, resolution: BankNumberResolution): Promise<BankNumberObservation[]> {
        return (await this.findByOwnerId(userId))
            .filter(o => o.resolution === resolution)
            .sort((a, b) => b.occurrences - a.occurrences);
    }

    async findResolved(userId: UUID): Promise<BankNumberObservation[]> {
        return (await this.findByOwnerId(userId))
            .filter(o => ["EXACT", "INFERRED", "MANUAL"].includes(o.resolution));
    }
}
