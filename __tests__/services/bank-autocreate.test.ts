import { BankService, type ScannedAccountEntry } from "@/application/services/bank-service";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";

const USER = "11111111-1111-4111-8111-111111111111";

async function buildService() {
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

    const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
    return { service, identification, observations, accounts, cards, institutions, inst };
}

function scan(
    accounts: ScannedAccountEntry[],
    extra: { merchant?: string | null; paidWithCredit?: boolean } = {},
) {
    return {
        accounts,
        merchant: extra.merchant === undefined ? "Banco del Austro" : extra.merchant,
        currency: "USD",
        paidWithCredit: extra.paidWithCredit ?? false,
    };
}

describe("resolveScannedAccounts — cuentas propias", () => {
    it("el origen de un gasto se vuelve identidad propia", async () => {
        const { service, accounts } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "AHO - XXXXXX0814" }]),
        );

        expect(result.bankSourceAccountId).toBeTruthy();
        const created = await accounts.findById(result.bankSourceAccountId!);
        expect(created).toMatchObject({
            lastFour: "0814", accountType: "SAVINGS", isUnconfirmed: true,
        });
    });

    it("un destino que nunca aparece como origen queda EXTERNAL", async () => {
        const { service, accounts, observations } = await buildService();

        const result = await service.resolveScannedAccounts(USER, scan([
            { type: "origen", account: "XXXXXX0814" },
            { type: "destino", account: "XXXXXX6655" },
        ]));

        expect(result.bankSourceAccountId).toBeTruthy();
        expect(result.bankDestinationAccountId).toBeNull();
        expect(result.bankCounterpartyObservationId).toBeTruthy();

        const ajena = await observations.findByRaw(USER, "XXXXXX6655");
        expect(ajena?.resolution).toBe("EXTERNAL");
        // Solo la propia existe como cuenta.
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("una transferencia entre dos cuentas propias liga ambas", async () => {
        const { service, inst } = await buildService();
        const origen = await service.createAccount(USER, {
            institutionId: inst.id, name: "Ahorros", accountType: "SAVINGS", lastFour: "0814",
        });
        const destino = await service.createAccount(USER, {
            institutionId: inst.id, name: "Corriente", accountType: "CHECKING", lastFour: "9511",
        });

        const result = await service.resolveScannedAccounts(USER, scan([
            { type: "origen", account: "XXXXXX0814" },
            { type: "destino", account: "XXXXXX9511" },
        ]));

        expect(result.bankSourceAccountId).toBe(origen.id);
        expect(result.bankDestinationAccountId).toBe(destino.id);
    });

    it("la segunda vez reutiliza la cuenta creada, no la duplica", async () => {
        const { service, accounts } = await buildService();
        const entradas = [{ type: "origen", account: "XXXXXX0814" }];

        const primera = await service.resolveScannedAccounts(USER, scan(entradas));
        const segunda = await service.resolveScannedAccounts(USER, scan(entradas));

        expect(segunda.bankSourceAccountId).toBe(primera.bankSourceAccountId);
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });
});

describe("resolveScannedAccounts — institución", () => {
    it("el banco sale del merchant cuando ya existe", async () => {
        const { service, inst } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "XXXXXX0814" }]),
        );

        expect(result.bankInstitutionId).toBe(inst.id);
    });

    it("un comercio cualquiera no funda un banco", async () => {
        const { service, institutions, accounts } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER,
            scan([{ type: "origen", account: "XXXXXX1234" }], { merchant: "FARMASHOP" }),
        );

        expect(result.bankInstitutionId).toBeNull();
        // Sin emisor no se puede fundar una cuenta.
        expect(result.bankSourceAccountId).toBeNull();
        expect(await institutions.findByOwnerId(USER)).toHaveLength(1);
        expect(await accounts.findByOwnerId(USER)).toHaveLength(0);
    });

    it("una cooperativa desconocida sí se crea, sin confirmar", async () => {
        const { service, institutions } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER,
            scan([{ type: "origen", account: "XXX5010" }], { merchant: "Coop Jardín Azuayo" }),
        );

        expect(result.bankInstitutionId).toBeTruthy();
        const creada = await institutions.findById(result.bankInstitutionId!);
        expect(creada).toMatchObject({ kind: "COOPERATIVE", isUnconfirmed: true });
    });
});

describe("resolveScannedAccounts — tarjetas", () => {
    it("con paidWithCredit sí crea la tarjeta de crédito", async () => {
        const { service, cards } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER,
            scan([{ type: "origen", account: "493176XXXXXX2780" }], { paidWithCredit: true }),
        );

        expect(result.bankCardId).toBeTruthy();
        expect(result.bankSourceAccountId).toBeNull();
        const created = await cards.findById(result.bankCardId!);
        expect(created).toMatchObject({
            bin: "493176", lastFour: "2780", cardType: "CREDIT", isUnconfirmed: true,
        });
    });

    it("SIN paidWithCredit no inventa una tarjeta", async () => {
        const { service, cards, accounts, observations } = await buildService();

        // 493176XXXXXX2780 es una Visa de DÉBITO del Austro. Crearla como
        // crédito mostraría una deuda que no existe.
        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "493176XXXXXX2780" }]),
        );

        expect(result.bankCardId).toBeNull();
        expect(await cards.findByOwnerId(USER)).toHaveLength(0);
        expect(await accounts.findByOwnerId(USER)).toHaveLength(0);
        expect((await observations.findByRaw(USER, "493176XXXXXX2780"))?.resolution).toBe("PENDING");
    });

    it("una tarjeta de débito ya registrada gasta de su cuenta", async () => {
        const { service, inst } = await buildService();
        const cuenta = await service.createAccount(USER, {
            institutionId: inst.id, name: "Ahorros", accountType: "SAVINGS", lastFour: "0814",
        });
        await service.createCard(USER, {
            institutionId: inst.id, accountId: cuenta.id, name: "Visa Débito",
            cardType: "DEBIT", bin: "493176", lastFour: "2780", prefixDigits: "493176",
        });

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "493176XXXXXX2780" }]),
        );

        expect(result.bankCardId).toBeTruthy();
        expect(result.bankSourceAccountId).toBe(cuenta.id);
    });
});

describe("resolveScannedAccounts — ambigüedad", () => {
    it("una cadena ambigua no crea nada y deja la transacción sin cuenta", async () => {
        const { service, inst, accounts, observations } = await buildService();
        await service.createAccount(USER, {
            institutionId: inst.id, name: "A", accountType: "SAVINGS", lastFour: "4058",
        });
        await service.createAccount(USER, {
            institutionId: inst.id, name: "B", accountType: "SAVINGS", lastFour: "9558",
        });

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "28XXX58" }]),
        );

        expect(result.bankSourceAccountId).toBeNull();
        expect((await observations.findByRaw(USER, "28XXX58"))?.resolution).toBe("PENDING");
        expect(await accounts.findByOwnerId(USER)).toHaveLength(2);
    });

    it("un sufijo de menos de 4 dígitos no funda nada", async () => {
        const { service, accounts } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "620" }]),
        );

        expect(result.bankSourceAccountId).toBeNull();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(0);
    });

    it("un escaneo sin cuentas no revienta", async () => {
        const { service } = await buildService();

        const result = await service.resolveScannedAccounts(USER, scan([]));

        expect(result.bankSourceAccountId).toBeNull();
        expect(result.bankCardId).toBeNull();
    });
});
