import { InMemoryRepository } from "./in-memory-repository";
import { pickInstitutionByName } from "@/lib/institution-match";
import type { UUID, ISODate } from "@/domain/core";
import type {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement,
    BankNumberObservation, BankNumberResolution, BankCardPayment,
} from "@/domain/entities/bank";
import type {
    IBankInstitutionRepository, IBankAccountRepository, IBankCardRepository,
    IBankAccountBalanceSnapshotRepository, IBankCardStatementRepository,
    IBankMovementRepository, BankMovementFilter, IBankNumberObservationRepository,
    IBankIdentityMergeRepository, IdentityMergeResult, IBankCardPaymentRepository,
} from "@/domain/repositories/bank";
import type { IBalanceSettingsRepository } from "@/domain/repositories/balance";
import type { IFinancialTransactionRepository } from "@/domain/repositories/financial";

export class InMemoryBankInstitutionRepository
    extends InMemoryRepository<BankInstitution>
    implements IBankInstitutionRepository {

    async findByOwnerId(userId: UUID): Promise<BankInstitution[]> {
        return (await this.findAll()).filter(i => i.ownerUserId === userId);
    }

    /**
     * Incluye los archivados a propósito: ver {@link pickInstitutionByName}.
     * Por eso no se apoya en `findByOwnerId`, que los oculta.
     */
    async findByName(userId: UUID, name: string): Promise<BankInstitution | null> {
        const todos = [...this.items.values()].filter(i => i.ownerUserId === userId);
        return pickInstitutionByName(todos, name);
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

    async reassignInstitution(userId: UUID, from: UUID, to: UUID): Promise<number> {
        const moving = (await this.findByInstitutionId(userId, from));
        for (const account of moving) {
            await this.update({ ...account, institutionId: to });
        }
        return moving.length;
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

    async reassignInstitution(userId: UUID, from: UUID, to: UUID): Promise<number> {
        const moving = (await this.findByOwnerId(userId)).filter(c => c.institutionId === from);
        for (const card of moving) {
            await this.update({ ...card, institutionId: to });
        }
        return moving.length;
    }
}

export class InMemoryBankAccountBalanceSnapshotRepository
    extends InMemoryRepository<BankAccountBalanceSnapshot>
    implements IBankAccountBalanceSnapshotRepository {

    async findByAccountId(accountId: UUID): Promise<BankAccountBalanceSnapshot[]> {
        // Empatados por fecha, primero el último declarado: corregir el saldo
        // del mismo día tiene que ganarle al valor que enmienda. Se invierte
        // antes de ordenar porque `sort` es estable y dos cortes seguidos
        // pueden compartir `createdAt` al milisegundo — entonces decide el
        // orden de llegada, y el último en llegar es la corrección.
        return (await this.findAll())
            .filter(s => s.accountId === accountId)
            .reverse()
            .sort((a, b) => b.asOf.localeCompare(a.asOf)
                || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
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

export class InMemoryBankCardPaymentRepository
    extends InMemoryRepository<BankCardPayment>
    implements IBankCardPaymentRepository {

    async findByCardId(userId: UUID, cardId: UUID): Promise<BankCardPayment[]> {
        return (await this.findAll())
            .filter(p => p.ownerUserId === userId && p.cardId === cardId)
            .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }

    async findByOwnerId(userId: UUID): Promise<BankCardPayment[]> {
        return (await this.findAll()).filter(p => p.ownerUserId === userId);
    }
}

/** Estados que la vista SQL excluye; se repiten aquí para que ambas coincidan. */
const EXCLUDED_STATUSES = ["REJECTED", "DELETED", "DUPLICATE"];

/**
 * Deriva las líneas del libro mayor desde las transacciones en memoria,
 * aplicando las mismas reglas que la vista `bank_movements`, más los pagos
 * de tarjeta registrados desde Bancos. No guarda nada propio: si divergiera de la vista, los saldos en modo MEMORY mentirían
 * respecto a los de SUPABASE.
 */
export class InMemoryBankMovementRepository implements IBankMovementRepository {
    constructor(
        private readonly transactions: IFinancialTransactionRepository,
        private readonly cards: IBankCardRepository,
        private readonly statements: IBankCardStatementRepository,
        private readonly cardPayments?: InMemoryBankCardPaymentRepository,
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
            // Espejo de la rama PAYMENT de la vista SQL: la tarjeta sale de la
            // columna propia o del estado, y se emite una sola línea aunque
            // vengan las dos puestas.
            const paidCardId = t.bankCardPaymentId
                ?? (t.bankCardStatementId
                    ? (await this.statements.findById(t.bankCardStatementId))?.cardId ?? null
                    : null);
            if (paidCardId) {
                out.push({ ...base, accountId: null, cardId: paidCardId, direction: "PAYMENT" });
            }
        }

        // Espejo de la última rama de la vista: el pago registrado desde
        // Bancos es una línea PAYMENT de su tarjeta y de nada más.
        for (const p of await this.cardPayments?.findByOwnerId(userId) ?? []) {
            out.push({
                transactionId: p.id, ownerUserId: p.ownerUserId, date: p.date,
                accountId: null, cardId: p.cardId, direction: "PAYMENT",
                amount: Number(p.amount), currency: p.currency,
                description: p.description ?? null, merchant: null, categoryId: null,
                cardPaymentId: p.id,
            });
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
        // Mismo orden que su gemelo de Supabase: si divergieran, el modo MEMORY
        // le mentiría al de SUPABASE sobre en qué orden llegan las observaciones.
        return (await this.findAll())
            .filter(o => o.ownerUserId === userId)
            .sort((a, b) => b.occurrences - a.occurrences);
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

/**
 * La unificación en memoria: la misma secuencia que la función SQL
 * `merge_bank_cards` / `merge_bank_accounts`, a mano. Si divergieran, el modo
 * MEMORY le mentiría al de SUPABASE sobre qué se mueve al unificar.
 *
 * Valida todo antes de tocar nada, igual que la función: en memoria no hay
 * transacción que deshacer si algo falla a mitad.
 */
export class InMemoryBankIdentityMergeRepository implements IBankIdentityMergeRepository {
    constructor(
        private readonly cards: InMemoryBankCardRepository,
        private readonly accounts: InMemoryBankAccountRepository,
        private readonly snapshots: InMemoryBankAccountBalanceSnapshotRepository,
        private readonly statements: InMemoryBankCardStatementRepository,
        private readonly observations: InMemoryBankNumberObservationRepository,
        private readonly transactions: IFinancialTransactionRepository,
        private readonly balanceSettings?: IBalanceSettingsRepository,
        private readonly cardPayments?: InMemoryBankCardPaymentRepository,
    ) {}

    async mergeCards(userId: UUID, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult> {
        const target = await this.cards.findById(targetId);
        if (!target || target.ownerUserId !== userId || target.isDeleted) {
            throw new Error("Tarjeta destino no encontrada");
        }
        if (sourceIds.includes(targetId)) {
            throw new Error("La tarjeta destino no puede estar entre las que se unifican");
        }
        const sources = await Promise.all(sourceIds.map(id => this.cards.findById(id)));
        if (sources.some(s => !s || s.ownerUserId !== userId || s.cardType !== target.cardType)) {
            throw new Error("Solo se unifican tarjetas tuyas y del mismo tipo");
        }
        const from = new Set(sourceIds);
        const now = new Date().toISOString();

        let movedTransactions = 0;
        for (const t of await this.transactions.findByOwnerId(userId)) {
            const card = t.bankCardId && from.has(t.bankCardId);
            const payment = t.bankCardPaymentId && from.has(t.bankCardPaymentId);
            if (!card && !payment) continue;
            await this.transactions.update({
                ...t,
                bankCardId: card ? targetId : t.bankCardId,
                bankCardPaymentId: payment ? targetId : t.bankCardPaymentId,
                updatedAt: now,
            });
            movedTransactions += (card ? 1 : 0) + (payment ? 1 : 0);
        }

        for (const p of await this.cardPayments?.findByOwnerId(userId) ?? []) {
            if (!from.has(p.cardId)) continue;
            await this.cardPayments!.update({ ...p, cardId: targetId, updatedAt: now });
            movedTransactions += 1;
        }

        let movedObservations = 0;
        for (const o of await this.observations.findByOwnerId(userId)) {
            if (!o.cardId || !from.has(o.cardId)) continue;
            await this.observations.update({ ...o, cardId: targetId, updatedAt: now });
            movedObservations += 1;
        }

        // Un estado por tarjeta y periodo: el que choca se archiva, el resto se muda.
        const targetPeriods = new Set(
            (await this.statements.findByCardId(targetId)).filter(s => !s.isDeleted).map(s => s.periodStart),
        );
        let movedStatements = 0;
        for (const sourceId of sourceIds) {
            for (const s of await this.statements.findByCardId(sourceId)) {
                const clash = !s.isDeleted && targetPeriods.has(s.periodStart);
                await this.statements.update({
                    ...s, cardId: targetId, isDeleted: s.isDeleted || clash, updatedAt: now,
                });
                movedStatements += 1;
            }
        }

        await this.balanceSettings?.clearRulesForTargets(userId, sourceIds);

        const known = sources.filter((s): s is BankCard => !!s);
        await this.cards.update({
            ...target,
            brand: target.brand ?? known.find(s => s.brand)?.brand ?? null,
            bin: target.bin ?? known.find(s => s.bin)?.bin ?? null,
            prefixDigits: target.prefixDigits ?? known.find(s => s.prefixDigits)?.prefixDigits ?? null,
            creditLimit: target.creditLimit ?? known.find(s => s.creditLimit != null)?.creditLimit ?? null,
            statementDay: target.statementDay ?? known.find(s => s.statementDay != null)?.statementDay ?? null,
            dueDay: target.dueDay ?? known.find(s => s.dueDay != null)?.dueDay ?? null,
            updatedAt: now,
        });
        for (const s of known) {
            if (!s.isDeleted) await this.cards.update({ ...s, isDeleted: true, updatedAt: now });
        }

        return { movedTransactions, movedObservations, movedStatements };
    }

    async mergeAccounts(userId: UUID, sourceIds: readonly UUID[], targetId: UUID): Promise<IdentityMergeResult> {
        const target = await this.accounts.findById(targetId);
        if (!target || target.ownerUserId !== userId || target.isDeleted) {
            throw new Error("Cuenta destino no encontrada");
        }
        if (sourceIds.includes(targetId)) {
            throw new Error("La cuenta destino no puede estar entre las que se unifican");
        }
        const targetIsCash = target.accountType === "CASH";
        const sources = await Promise.all(sourceIds.map(id => this.accounts.findById(id)));
        if (sources.some(s => !s || s.ownerUserId !== userId || (s.accountType === "CASH") !== targetIsCash)) {
            throw new Error("Solo se unifican cuentas tuyas, y el efectivo solo con efectivo");
        }
        const from = new Set(sourceIds);
        const now = new Date().toISOString();

        let movedTransactions = 0;
        for (const t of await this.transactions.findByOwnerId(userId)) {
            const src = t.bankSourceAccountId && from.has(t.bankSourceAccountId);
            const dst = t.bankDestinationAccountId && from.has(t.bankDestinationAccountId);
            if (!src && !dst) continue;
            await this.transactions.update({
                ...t,
                bankSourceAccountId: src ? targetId : t.bankSourceAccountId,
                bankDestinationAccountId: dst ? targetId : t.bankDestinationAccountId,
                updatedAt: now,
            });
            movedTransactions += (src ? 1 : 0) + (dst ? 1 : 0);
        }

        let movedSnapshots = 0;
        for (const sourceId of sourceIds) {
            for (const s of await this.snapshots.findByAccountId(sourceId)) {
                await this.snapshots.update({ ...s, accountId: targetId, updatedAt: now });
                movedSnapshots += 1;
            }
        }

        let movedCards = 0;
        for (const c of await this.cards.findByOwnerId(userId)) {
            if (!c.accountId || !from.has(c.accountId)) continue;
            await this.cards.update({ ...c, accountId: targetId, updatedAt: now });
            movedCards += 1;
        }

        let movedObservations = 0;
        for (const o of await this.observations.findByOwnerId(userId)) {
            if (!o.accountId || !from.has(o.accountId)) continue;
            await this.observations.update({ ...o, accountId: targetId, updatedAt: now });
            movedObservations += 1;
        }

        await this.balanceSettings?.clearRulesForTargets(userId, sourceIds);

        const known = sources.filter((s): s is BankAccount => !!s);
        await this.accounts.update({
            ...target,
            prefixDigits: target.prefixDigits ?? known.find(s => s.prefixDigits)?.prefixDigits ?? null,
            updatedAt: now,
        });
        for (const s of known) {
            if (!s.isDeleted) await this.accounts.update({ ...s, isDeleted: true, updatedAt: now });
        }

        return { movedTransactions, movedObservations, movedSnapshots, movedCards };
    }
}
