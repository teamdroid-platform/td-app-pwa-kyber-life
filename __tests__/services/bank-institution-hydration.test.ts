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

function buildService() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const observations = new InMemoryBankNumberObservationRepository();
    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    return new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions, identification,
    );
}

/**
 * `institutionName` no se guarda: se enriquece en lectura. Sin ese paso la
 * cuenta llega al cliente sabiendo el id de su emisor pero no su nombre, y
 * toda la interfaz que lo muestra cae al texto de reserva sin avisar.
 */
describe("el emisor viaja con la cuenta y con la tarjeta", () => {
    it("getOverview nombra al emisor de cada cuenta", async () => {
        const service = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });

        const overview = await service.getOverview(USER);

        expect(overview.accounts[0].institutionName).toBe("Banco del Austro");
    });

    it("getOverview nombra al emisor de cada tarjeta", async () => {
        const service = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco Pichincha", kind: "BANK" });
        await service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT", brand: "Visa", lastFour: "2780",
        });

        const overview = await service.getOverview(USER);

        expect(overview.cards[0].institutionName).toBe("Banco Pichincha");
    });

    it("una cuenta huérfana no inventa emisor", async () => {
        const service = buildService();
        // El efectivo no cuelga de ningún banco, igual que una cuenta que
        // detectó un escaneo y aún no se ata a ninguno.
        await service.ensureCashAccount(USER);

        const overview = await service.getOverview(USER);

        expect(overview.accounts[0].institutionName).toBeUndefined();
    });

    it("el detalle de la cuenta también lo trae", async () => {
        const service = buildService();
        const inst = await service.createInstitution(USER, { name: "COAC Jardín Azuayo", kind: "COOPERATIVE" });
        const account = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "CHECKING", lastFour: "9511",
        });

        const detail = await service.getAccountDetail(USER, account.id);

        expect(detail?.account.institutionName).toBe("COAC Jardín Azuayo");
    });

    it("el detalle de la tarjeta también lo trae", async () => {
        const service = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco Guayaquil", kind: "BANK" });
        const card = await service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT", brand: "Mastercard", lastFour: "8361",
        });

        const detail = await service.getCardDetail(USER, card.id);

        expect(detail?.card.institutionName).toBe("Banco Guayaquil");
    });

    it("las cuentas con que se paga una tarjeta llegan con su emisor", async () => {
        const service = buildService();
        const inst = await service.createInstitution(USER, { name: "Banco del Pacífico", kind: "BANK" });
        await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "1860",
        });
        const card = await service.createCard(USER, {
            institutionId: inst.id, cardType: "CREDIT", brand: "Visa", lastFour: "2780",
        });

        const detail = await service.getCardDetail(USER, card.id);

        expect(detail?.payableAccounts[0].institutionName).toBe("Banco del Pacífico");
    });
});
