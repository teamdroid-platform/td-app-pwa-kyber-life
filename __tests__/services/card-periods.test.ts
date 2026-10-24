import { BankService } from "@/application/services/bank-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository, InMemoryBankCardPaymentRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import { cardPeriodsBack, payableStatement, computePeriodCharges } from "@/domain/services/bank-balance";
import type { FinancialTransaction } from "@/domain/entities/financial";
import type { BankCardStatement, BankMovement } from "@/domain/entities/bank";

const USER = "11111111-1111-1111-1111-111111111111";
const STAMPS = { createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", isDeleted: false };

function build() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const cardPayments = new InMemoryBankCardPaymentRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements, cardPayments);
    const observations = new InMemoryBankNumberObservationRepository();
    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions, identification,
        undefined, undefined, cardPayments,
    );
    return { service, cards, statements, transactions };
}

async function charge(repo: InMemoryFinancialTransactionRepository, cardId: string, amount: number, date: string) {
    return repo.create({
        id: crypto.randomUUID(), ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED", amount,
        currency: "USD", date, description: "consumo", possibleDuplicate: false, bankCardId: cardId,
        paidWithCredit: true, ...STAMPS,
    } as FinancialTransaction);
}

function statement(id: string, cardId: string, start: string, end: string, due: string, computed: number, status: BankCardStatement["status"]): BankCardStatement {
    return {
        id, ownerUserId: USER, cardId, periodStart: start, periodEnd: end, dueDate: due,
        computedAmount: computed, totalAmount: null, paidAmount: 0, status, ...STAMPS,
    };
}

/**
 * La Mastercard ••8361 real: el estado del 21 sept – 20 oct se abrió el 5 de
 * octubre con $461,81 y no recogió los consumos registrados después.
 */
async function mastercard() {
    const ctx = build();
    const card = await ctx.service.createCard(USER, {
        cardType: "CREDIT", lastFour: "8361", statementDay: 20, dueDay: 28,
    });
    await charge(ctx.transactions, card.id, 461.81, "2026-09-27T10:00:00.000Z");
    await charge(ctx.transactions, card.id, 339.90, "2026-10-12T10:00:00.000Z");
    await charge(ctx.transactions, card.id, 50, "2026-08-30T10:00:00.000Z");
    await ctx.statements.create(statement("cerrado", card.id, "2026-09-21", "2026-10-20", "2026-10-28", 461.81, "CLOSED"));
    return { ...ctx, card };
}

describe("estados de cuenta al día", () => {
    beforeAll(() => jest.useFakeTimers().setSystemTime(new Date("2026-10-24T12:00:00Z")));
    afterAll(() => jest.useRealTimers());

    it("el monto calculado recoge los consumos registrados después de abrir el estado", async () => {
        const { service, card } = await mastercard();

        const detail = await service.getCardDetail(USER, card.id);

        const cerrado = detail!.statements.find(s => s.id === "cerrado")!;
        expect(cerrado.computedAmount).toBe(801.71);
    });

    it("lo que vence es el estado cerrado que aún se debe, no el abierto", async () => {
        const { service, card } = await mastercard();

        const detail = await service.getCardDetail(USER, card.id);

        expect(detail!.card.payableStatement?.id).toBe("cerrado");
        expect(detail!.card.payableStatement?.dueDate).toBe("2026-10-28");
        expect(detail!.card.openStatement?.periodStart).toBe("2026-10-21");
    });

    it("un pago abona al estado cerrado que vence", async () => {
        const { service, statements, card } = await mastercard();

        const payment = await service.payCard(USER, card.id, 801.71, "2026-10-24T12:00:00.000Z");

        expect(payment.statementId).toBe("cerrado");
        const saved = await statements.findById("cerrado");
        expect(Number(saved!.paidAmount)).toBe(801.71);
        expect(saved!.status).toBe("PAID");
    });

    it("lista los períodos del actual hacia atrás, incluso los que no tienen estado", async () => {
        const { service, card } = await mastercard();

        const detail = await service.getCardDetail(USER, card.id);

        expect(detail!.periods.map(p => p.periodStart)).toEqual([
            "2026-10-21", "2026-09-21", "2026-08-21",
        ]);
        expect(detail!.periods[0].isCurrent).toBe(true);
        expect(detail!.periods[1].statement?.id).toBe("cerrado");
        // Agosto es anterior a los estados: se ve, pero sin estado de cuenta.
        expect(detail!.periods[2].statement).toBeNull();
    });
});

describe("piezas de dominio", () => {
    it("cardPeriodsBack llega hasta el período del primer movimiento", () => {
        const periods = cardPeriodsBack(20, 28, new Date("2026-10-24T00:00:00Z"), "2026-07-25T00:00:00Z");
        expect(periods.map(p => `${p.periodStart}/${p.periodEnd}`)).toEqual([
            "2026-10-21/2026-11-20", "2026-09-21/2026-10-20",
            "2026-08-21/2026-09-20", "2026-07-21/2026-08-20",
        ]);
    });

    it("sin movimientos solo devuelve el período en curso", () => {
        expect(cardPeriodsBack(20, 28, new Date("2026-10-24T00:00:00Z"), null)).toHaveLength(1);
    });

    it("payableStatement elige el más antiguo que aún debe", () => {
        const viejoPagado = { ...statement("a", "c", "2026-08-21", "2026-09-20", "2026-09-28", 100, "PAID"), paidAmount: 100 };
        const cerrado = statement("b", "c", "2026-09-21", "2026-10-20", "2026-10-28", 801.71, "CLOSED");
        const abierto = statement("c", "c", "2026-10-21", "2026-11-20", "2026-11-28", 20, "OPEN");
        expect(payableStatement([abierto, cerrado, viejoPagado])?.id).toBe("b");
        expect(payableStatement([viejoPagado])).toBeNull();
    });

    it("computePeriodCharges suma solo los consumos dentro del período", () => {
        const m = (direction: BankMovement["direction"], amount: number, date: string) =>
            ({ direction, amount, date } as BankMovement);
        expect(computePeriodCharges([
            m("CHARGE", 10, "2026-09-21T00:00:00Z"), m("CHARGE", 5, "2026-10-20T23:00:00Z"),
            m("CHARGE", 7, "2026-10-21T00:00:00Z"), m("PAYMENT", 100, "2026-10-01T00:00:00Z"),
        ], "2026-09-21", "2026-10-20")).toBe(15);
    });
});
