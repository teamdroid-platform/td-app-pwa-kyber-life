import { BankService } from "@/application/services/bank-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";
import { BankIdentificationService } from "@/application/services/bank-identification-service";

const USER = "11111111-1111-1111-1111-111111111111";
const TARJETA = "542258XXXXXXX361";

function build() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const observations = new InMemoryBankNumberObservationRepository();
    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const service = new BankService(
        institutions, accounts, cards, new InMemoryBankAccountBalanceSnapshotRepository(),
        statements, movements, transactions, identification,
    );
    return { service, observations };
}

/** El consumo de un correo de PacifiCard: la tarjeta sale como origen. */
function consumo(service: BankService) {
    return service.syncTransactionBankLinks(USER, {
        scannedAccounts: [{ type: "origen", account: TARJETA }],
        merchant: "Anthropic", currency: "USD", type: "EXPENSE", paidWithCredit: false,
    });
}

/** El pago a la tarjeta desde una cuenta: la tarjeta sale como destino. */
function pagoATarjeta(service: BankService) {
    return service.syncTransactionBankLinks(USER, {
        scannedAccounts: [
            { type: "origen", account: "10XXXXXX11" },
            { type: "destino", account: TARJETA },
        ],
        merchant: "Banco del Pacifico", currency: "USD", type: "TRANSFER", paidWithCredit: false,
    });
}

async function mastercard8361(service: BankService) {
    return service.createCard(USER, { cardType: "CREDIT", brand: "Mastercard", lastFour: "8361" });
}

describe("la tarjeta propia que primero apareció como destino", () => {
    it("un pago a tu tarjeta no la marca como de un tercero aunque sea ambigua", async () => {
        const { service, observations } = build();
        // Como en junio: el número encajaba con más de una tarjeta propia.
        await mastercard8361(service);
        await service.createCard(USER, { cardType: "CREDIT", brand: "Mastercard", lastFour: "0361" });

        await pagoATarjeta(service);

        const observation = await observations.findByRaw(USER, TARJETA);
        expect(observation?.resolution).not.toBe("EXTERNAL");
    });

    it("un consumo posterior se liga a la tarjeta aunque estuviera marcada ajena", async () => {
        const { service, observations } = build();
        const card = await mastercard8361(service);
        // El estado que dejó el código anterior: marcada ajena por el pago de junio.
        const seen = await service["identification"].observe(USER, TARJETA);
        await observations.update({ ...seen, resolution: "EXTERNAL", cardId: null, accountId: null });

        const links = await consumo(service);

        expect(links.bankCardId).toBe(card.id);
    });

    it("el origen de un ingreso marcado ajeno sigue siendo ajeno: lo paga otro", async () => {
        const { service, observations } = build();
        await mastercard8361(service);
        const seen = await service["identification"].observe(USER, TARJETA);
        await observations.update({ ...seen, resolution: "EXTERNAL", cardId: null, accountId: null });

        const links = await service.syncTransactionBankLinks(USER, {
            scannedAccounts: [{ type: "origen", account: TARJETA }],
            merchant: "Alguien", currency: "USD", type: "INCOME", paidWithCredit: false,
        });

        expect(links.bankCardId).toBeNull();
        expect((await observations.findByRaw(USER, TARJETA))?.resolution).toBe("EXTERNAL");
    });

    it("con una tarjeta fantasma que también encaja queda sin decidir, y al eliminarla se liga", async () => {
        const { service } = build();
        const real = await mastercard8361(service);
        const fantasma = await service.createCard(USER, { cardType: "CREDIT", brand: "Mastercard", lastFour: "0361" });

        expect((await consumo(service)).bankCardId).toBeNull();

        await service.deleteCard(USER, fantasma.id);

        expect((await consumo(service)).bankCardId).toBe(real.id);
    });

    it("eliminar una tarjeta suelta sus lecturas", async () => {
        const { service, observations } = build();
        const card = await mastercard8361(service);
        await consumo(service);
        expect((await observations.findByRaw(USER, TARJETA))?.cardId).toBe(card.id);

        await service.deleteCard(USER, card.id);

        const released = await observations.findByRaw(USER, TARJETA);
        expect(released?.cardId).toBeNull();
        expect(released?.resolution).toBe("PENDING");
    });
});
