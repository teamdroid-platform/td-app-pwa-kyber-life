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
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

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
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions, identification,
    );
    return { service, institutions, accounts, cards };
}

/** Las tres «Jardín Azuayo» del caso real, con una cuenta en cada una. */
async function seedDuplicates(service: BankService) {
    const target = await service.createInstitution(USER, { name: "COAC Jardín Azuayo", kind: "COOPERATIVE" });
    const dupA = await service.createInstitution(USER, { name: "Coop Jardín Azuayo", kind: "COOPERATIVE" });
    const dupB = await service.createInstitution(USER, {
        name: "Cooperativa de Ahorro y Crédito Jardín Azuayo", kind: "COOPERATIVE",
    });
    return { target, dupA, dupB };
}

describe("mergeInstitutions", () => {
    it("mueve cuentas y tarjetas al destino y archiva los orígenes", async () => {
        const { service, institutions, accounts, cards } = buildService();
        const { target, dupA, dupB } = await seedDuplicates(service);

        await service.createAccount(USER, { institutionId: dupA.id, accountType: "SAVINGS", lastFour: "0814" });
        await service.createAccount(USER, { institutionId: dupB.id, accountType: "SAVINGS", lastFour: "1860" });
        await service.createCard(USER, { institutionId: dupB.id, cardType: "CREDIT", lastFour: "9620" });

        const result = await service.mergeInstitutions(USER, [dupA.id, dupB.id], target.id);

        expect(result).toEqual({ movedAccounts: 2, movedCards: 1, mergedInstitutions: 2 });
        expect(await accounts.findByInstitutionId(USER, target.id)).toHaveLength(2);
        expect(await accounts.findByInstitutionId(USER, dupA.id)).toHaveLength(0);

        const survivors = (await institutions.findByOwnerId(USER)).filter(i => !i.isDeleted);
        expect(survivors.map(i => i.id)).toEqual([target.id]);

        const moved = (await cards.findByOwnerId(USER)).filter(c => !c.isDeleted);
        expect(moved.every(c => c.institutionId === target.id)).toBe(true);
    });

    it("no pierde lo que el destino ya tenía", async () => {
        const { service, accounts } = buildService();
        const { target, dupA } = await seedDuplicates(service);

        await service.createAccount(USER, { institutionId: target.id, accountType: "CHECKING", lastFour: "1111" });
        await service.createAccount(USER, { institutionId: dupA.id, accountType: "SAVINGS", lastFour: "2222" });

        await service.mergeInstitutions(USER, [dupA.id], target.id);

        expect(await accounts.findByInstitutionId(USER, target.id)).toHaveLength(2);
    });

    it("unificar una institución vacía no rompe nada", async () => {
        const { service } = buildService();
        const { target, dupA } = await seedDuplicates(service);

        expect(await service.mergeInstitutions(USER, [dupA.id], target.id))
            .toEqual({ movedAccounts: 0, movedCards: 0, mergedInstitutions: 1 });
    });

    it("ignora el destino si viene también como origen", async () => {
        const { service, institutions } = buildService();
        const { target, dupA } = await seedDuplicates(service);

        // El destino sobrevive: absorberse a sí mismo dejaría el grupo sin nadie.
        const result = await service.mergeInstitutions(USER, [dupA.id, target.id], target.id);

        expect(result.mergedInstitutions).toBe(1);
        expect((await institutions.findById(target.id))?.isDeleted).toBe(false);
    });

    it("rechaza cuando no queda ningún origen distinto del destino", async () => {
        const { service } = buildService();
        const { target } = await seedDuplicates(service);

        await expect(service.mergeInstitutions(USER, [target.id], target.id))
            .rejects.toThrow(/al menos una institución distinta/i);
    });

    it("no toca instituciones de otro usuario", async () => {
        const { service, institutions, accounts } = buildService();
        const { target } = await seedDuplicates(service);
        const ajena = await service.createInstitution(OTHER_USER, { name: "Banco Ajeno", kind: "BANK" });
        await service.createAccount(OTHER_USER, {
            institutionId: ajena.id, accountType: "SAVINGS", lastFour: "9999",
        });

        await expect(service.mergeInstitutions(USER, [ajena.id], target.id)).rejects.toThrow();

        // Y sobre todo: la cuenta ajena sigue donde estaba.
        expect(await accounts.findByInstitutionId(OTHER_USER, ajena.id)).toHaveLength(1);
        expect((await institutions.findById(ajena.id))?.isDeleted).toBe(false);
    });

    it("comprueba la propiedad antes de mover: un origen inválido no deja el grupo a medias", async () => {
        const { service, accounts } = buildService();
        const { target, dupA } = await seedDuplicates(service);
        const ajena = await service.createInstitution(OTHER_USER, { name: "Banco Ajeno", kind: "BANK" });
        await service.createAccount(USER, { institutionId: dupA.id, accountType: "SAVINGS", lastFour: "0814" });

        await expect(service.mergeInstitutions(USER, [dupA.id, ajena.id], target.id)).rejects.toThrow();

        // Nada se movió: si se validara sobre la marcha, la cuenta de dupA ya
        // estaría en el destino y el usuario vería una unificación a medias.
        expect(await accounts.findByInstitutionId(USER, dupA.id)).toHaveLength(1);
        expect(await accounts.findByInstitutionId(USER, target.id)).toHaveLength(0);
    });
});
