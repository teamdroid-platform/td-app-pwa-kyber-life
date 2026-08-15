import { BankService, type ScannedAccountEntry } from "@/application/services/bank-service";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import {
    InMemoryFinancialTransactionRepository,
    InMemoryFinancialScannerTransactionRepository,
} from "@/infrastructure/repositories/implementations";
import type { FinancialTransaction, FinancialScannerTransaction } from "@/domain/entities/financial";

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
    const scanner = new InMemoryFinancialScannerTransactionRepository();
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions,
        identification, scanner,
    );

    const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
    return { service, identification, observations, accounts, cards, institutions, transactions, scanner, inst };
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
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        const destino = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "CHECKING", lastFour: "9511",
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
        const { service, institutions } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER,
            scan([{ type: "origen", account: "XXXXXX1234" }], { merchant: "FARMASHOP" }),
        );

        expect(result.bankInstitutionId).toBeNull();
        // La institución de partida y ninguna más: FARMASHOP no es un emisor.
        expect(await institutions.findByOwnerId(USER)).toHaveLength(1);
    });

    it("la cuenta de una compra sí nace, aunque no se sepa de qué banco es", async () => {
        const { service, accounts } = await buildService();

        // En una compra el comercio es la tienda, no el banco. Exigir emisor
        // dejaba sin crear justo las identidades que más aparecen.
        const result = await service.resolveScannedAccounts(
            USER,
            scan([{ type: "origen", account: "XXXXXX1234" }], { merchant: "FARMASHOP" }),
        );

        expect(result.bankSourceAccountId).toBeTruthy();
        const creada = await accounts.findById(result.bankSourceAccountId!);
        expect(creada).toMatchObject({
            lastFour: "1234",
            institutionId: null,
            isUnconfirmed: true,
        });
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

    it("SIN paidWithCredit la crea como débito, que es lo que no inventa deuda", async () => {
        const { service, cards } = await buildService();

        // 493176XXXXXX2780 es una Visa de DÉBITO del Austro, y así llega en un
        // retiro de cajero. Crearla como crédito mostraría una deuda que no
        // existe; no crearla dejaba el número repitiéndose para siempre.
        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "493176XXXXXX2780" }]),
        );

        expect(result.bankCardId).toBeTruthy();
        const created = await cards.findById(result.bankCardId!);
        expect(created).toMatchObject({
            bin: "493176", lastFour: "2780", cardType: "DEBIT", isUnconfirmed: true,
        });
    });

    it("la tarjeta detectada nace sin cuenta, para que el usuario la ate después", async () => {
        const { service, cards } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "493176XXXXXX2780" }]),
        );

        const created = await cards.findById(result.bankCardId!);
        expect(created?.accountId ?? null).toBeNull();
        // Sin cuenta atada no hay de dónde descontar: no se afirma un origen.
        expect(result.bankSourceAccountId).toBeNull();
    });

    it("una tarjeta de crédito detectada no arrastra cupo ni ciclo inventados", async () => {
        const { service, cards } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER,
            scan([{ type: "origen", account: "493176XXXXXX2780" }], { paidWithCredit: true }),
        );

        const created = await cards.findById(result.bankCardId!);
        expect(created).toMatchObject({ creditLimit: null, statementDay: null, dueDay: null });
    });

    it("una tarjeta de débito ya registrada gasta de su cuenta", async () => {
        const { service, inst } = await buildService();
        const cuenta = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        await service.createCard(USER, {
            institutionId: inst.id, accountId: cuenta.id,             cardType: "DEBIT", bin: "493176", lastFour: "2780", prefixDigits: "493176",
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
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "4058",
        });
        await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "9558",
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

// ─── relinkHistory ───────────────────────────────────────────

const NOW = "2026-08-12T00:00:00Z";
const STAMPS = { createdAt: NOW, updatedAt: NOW, isDeleted: false };

function scannerRow(partial: Partial<FinancialScannerTransaction>): FinancialScannerTransaction {
    return {
        id: crypto.randomUUID(), ownerUserId: USER, status: "PROCESSED",
        currency: "USD", date: NOW, ...STAMPS, ...partial,
    } as FinancialScannerTransaction;
}

function txRow(partial: Partial<FinancialTransaction>): FinancialTransaction {
    return {
        id: crypto.randomUUID(), ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED",
        amount: 0, currency: "USD", date: NOW, description: "test",
        possibleDuplicate: false, ...STAMPS, ...partial,
    } as FinancialTransaction;
}

describe("relinkHistory", () => {
    it("re-apunta una transacción del historial contra su cuenta", async () => {
        const { service, transactions, scanner, inst } = await buildService();
        const cuenta = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        await scanner.create(scannerRow({
            executionId: "prod_abc_1", amount: 74.19, merchant: "FARMASHOP",
            accounts: [{ type: "origen", account: "XXXXXX0814" }],
        }));
        const tx = await transactions.create(txRow({
            amount: 74.19, merchant: "FARMASHOP",
            originStats: { originalExecutionId: "prod_abc_1" },
        }));

        const relinked = await service.relinkHistory(USER);

        expect(relinked).toBe(1);
        expect((await transactions.findById(tx.id))?.bankSourceAccountId).toBe(cuenta.id);
    });

    it("no pisa una transacción que ya tiene cuenta", async () => {
        const { service, transactions, scanner, inst } = await buildService();
        const elegida = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "9511",
        });
        await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        await scanner.create(scannerRow({
            executionId: "prod_abc_2", amount: 10,
            accounts: [{ type: "origen", account: "XXXXXX0814" }],
        }));
        const tx = await transactions.create(txRow({
            amount: 10, bankSourceAccountId: elegida.id,
            originStats: { originalExecutionId: "prod_abc_2" },
        }));

        await service.relinkHistory(USER);

        expect((await transactions.findById(tx.id))?.bankSourceAccountId).toBe(elegida.id);
    });

    it("el monto desempata cuando una ejecución trae varias transacciones", async () => {
        const { service, transactions, scanner, inst } = await buildService();
        const a = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "0814",
        });
        const b = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "9511",
        });
        await scanner.create(scannerRow({
            executionId: "prod_abc_3", amount: 10,
            accounts: [{ type: "origen", account: "XXXXXX0814" }],
        }));
        await scanner.create(scannerRow({
            executionId: "prod_abc_3", amount: 20,
            accounts: [{ type: "origen", account: "XXXXXX9511" }],
        }));
        const tx = await transactions.create(txRow({
            amount: 20, originStats: { originalExecutionId: "prod_abc_3" },
        }));

        await service.relinkHistory(USER);

        expect((await transactions.findById(tx.id))?.bankSourceAccountId).toBe(b.id);
        expect(a.id).not.toBe(b.id);
    });

    it("una transacción sin originalExecutionId se queda como está", async () => {
        const { service, transactions } = await buildService();
        const tx = await transactions.create(txRow({ amount: 5, originStats: null }));

        expect(await service.relinkHistory(USER)).toBe(0);
        expect((await transactions.findById(tx.id))?.bankSourceAccountId).toBeUndefined();
    });
});
