import { BankService } from "@/application/services/bank-service";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";

const USER = "11111111-1111-4111-8111-111111111111";

function build() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const observations = new InMemoryBankNumberObservationRepository();

    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const service = new BankService(
        institutions, accounts, cards,
        new InMemoryBankAccountBalanceSnapshotRepository(), statements,
        new InMemoryBankMovementRepository(transactions, cards, statements),
        transactions, identification,
    );

    return { service, institutions, accounts, cards, observations };
}

/**
 * El caso que no funcionaba de punta a punta: un retiro de cajero del Banco del
 * Austro con la tarjeta 493176XXXXXX2780. La institución se creaba pero la
 * tarjeta no nacía nunca, porque la regla exigía un pago a crédito que un
 * retiro jamás trae.
 */
const RETIRO = {
    accounts: [{ type: "origen", account: "493176XXXXXX2780" }],
    merchant: "Banco del Austro",
    currency: "USD",
    paidWithCredit: false,
};

describe("retiro de cajero, de punta a punta", () => {
    it("crea el emisor y la tarjeta de una sola confirmación", async () => {
        const { service, institutions, cards } = build();

        await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            currency: RETIRO.currency,
            paidWithCredit: RETIRO.paidWithCredit,
            scannedAccounts: RETIRO.accounts,
        });

        const [emisor] = await institutions.findByOwnerId(USER);
        expect(emisor).toMatchObject({ name: "Banco del Austro", kind: "BANK" });

        const [tarjeta] = await cards.findByOwnerId(USER);
        expect(tarjeta).toMatchObject({
            institutionId: emisor.id,
            bin: "493176",
            lastFour: "2780",
            cardType: "DEBIT",
            isUnconfirmed: true,
        });
    });

    it("la transacción queda apuntando a la tarjeta y al emisor", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            paidWithCredit: false,
            scannedAccounts: RETIRO.accounts,
        });

        expect(links.bankCardId).toBeTruthy();
        expect(links.bankInstitutionId).toBeTruthy();
    });

    it("el detalle de la transacción sabe nombrar esa tarjeta", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            paidWithCredit: false,
            scannedAccounts: RETIRO.accounts,
        });

        const [vista] = await service.transactionAccounts(USER, links);
        expect(vista).toMatchObject({
            role: "SOURCE",
            kind: "CARD",
            display: "493176XXXX2780",
            match: { name: "Visa XXXX2780", institutionName: "Banco del Austro" },
        });
    });

    it("no repite la tarjeta al confirmar un segundo retiro igual", async () => {
        const { service, cards, institutions } = build();

        for (let i = 0; i < 3; i++) {
            await service.syncTransactionBankLinks(USER, {
                merchant: RETIRO.merchant,
                paidWithCredit: false,
                scannedAccounts: RETIRO.accounts,
            });
        }

        expect(await cards.findByOwnerId(USER)).toHaveLength(1);
        expect(await institutions.findByOwnerId(USER)).toHaveLength(1);
    });

    it("sin cuenta atada no afirma de dónde salió el dinero", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            paidWithCredit: false,
            scannedAccounts: RETIRO.accounts,
        });

        // La tarjeta existe, pero mientras no diga de qué cuenta gasta ningún
        // saldo puede bajar por su culpa.
        expect(links.bankSourceAccountId).toBeNull();
    });

    it("el mantenimiento la ata a una cuenta y la da por revisada", async () => {
        const { service, cards } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            paidWithCredit: false,
            scannedAccounts: RETIRO.accounts,
        });

        const cuenta = await service.createAccount(USER, {
            institutionId: links.bankInstitutionId!,
            name: "Ahorros Principal", accountType: "SAVINGS", lastFour: "0814",
        });
        await service.updateCard(USER, links.bankCardId!, {
            accountId: cuenta.id, isUnconfirmed: false,
        });

        const tarjeta = await cards.findById(links.bankCardId!);
        expect(tarjeta).toMatchObject({ accountId: cuenta.id, isUnconfirmed: false });
    });

    it("una vez atada, el siguiente retiro sí sale de esa cuenta", async () => {
        const { service } = build();

        const primero = await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            paidWithCredit: false,
            scannedAccounts: RETIRO.accounts,
        });

        const cuenta = await service.createAccount(USER, {
            institutionId: primero.bankInstitutionId!,
            name: "Ahorros Principal", accountType: "SAVINGS", lastFour: "0814",
        });
        await service.updateCard(USER, primero.bankCardId!, {
            accountId: cuenta.id, isUnconfirmed: false,
        });

        const segundo = await service.syncTransactionBankLinks(USER, {
            merchant: RETIRO.merchant,
            paidWithCredit: false,
            scannedAccounts: RETIRO.accounts,
        });

        expect(segundo.bankCardId).toBe(primero.bankCardId);
        expect(segundo.bankSourceAccountId).toBe(cuenta.id);
    });

    it("una compra en un comercio también registra la tarjeta usada", async () => {
        const { service, cards, institutions } = build();

        // El caso de la suscripción a ChatGPT: el correo lo manda el banco pero
        // el comercio extraído es la tienda, así que no hay emisor que deducir.
        const links = await service.syncTransactionBankLinks(USER, {
            merchant: "GOOGLE *CHATGPT MOUNTAIN VIEW",
            paidWithCredit: false,
            scannedAccounts: [{ type: "origen", account: "Mastercard-8361" }],
        });

        expect(links.bankCardId).toBeTruthy();
        const [tarjeta] = await cards.findByOwnerId(USER);
        expect(tarjeta).toMatchObject({
            lastFour: "8361",
            brand: "Mastercard",
            institutionId: null,
            isUnconfirmed: true,
        });
        // Y sigue sin fundar un banco llamado GOOGLE *CHATGPT.
        expect(await institutions.findByOwnerId(USER)).toHaveLength(0);
    });

    it("el mantenimiento le asigna el emisor que el correo no dijo", async () => {
        const { service, cards } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: "GOOGLE *CHATGPT MOUNTAIN VIEW",
            paidWithCredit: false,
            scannedAccounts: [{ type: "origen", account: "Mastercard-8361" }],
        });

        const emisor = await service.createInstitution(USER, { name: "Banco Pichincha", kind: "BANK" });
        const cuenta = await service.createAccount(USER, {
            institutionId: emisor.id, name: "Ahorros", accountType: "SAVINGS",
        });
        await service.updateCard(USER, links.bankCardId!, {
            institutionId: emisor.id, accountId: cuenta.id, isUnconfirmed: false,
        });

        expect(await cards.findById(links.bankCardId!)).toMatchObject({
            institutionId: emisor.id, isUnconfirmed: false,
        });
    });

    it("un consumo a crédito sí nace como tarjeta de crédito", async () => {
        const { service, cards } = build();

        await service.syncTransactionBankLinks(USER, {
            merchant: "Banco Pichincha",
            paidWithCredit: true,
            scannedAccounts: [{ type: "origen", account: "542258XXXXXX8361" }],
        });

        const [tarjeta] = await cards.findByOwnerId(USER);
        expect(tarjeta).toMatchObject({ cardType: "CREDIT", isUnconfirmed: true });
        // Sin cupo ni ciclo: el correo no los dice y no se inventan.
        expect(tarjeta.creditLimit).toBeNull();
    });
});
