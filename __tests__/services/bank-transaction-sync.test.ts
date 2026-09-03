import { BankService } from "@/application/services/bank-service";
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

const USER = "11111111-1111-4111-8111-111111111111";

function build() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const observations = new InMemoryBankNumberObservationRepository();
    const scanner = new InMemoryFinancialScannerTransactionRepository();

    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions,
        identification, scanner,
    );

    return { service, institutions, accounts, cards, observations };
}

describe("tipo de institución", () => {
    it("por defecto es genérico, no banco", async () => {
        const { service } = build();
        const inst = await service.createInstitution(USER, { name: "Lo que sea" });

        expect(inst.kind).toBe("OTHER");
    });

    it("el tipo que declara el usuario manda sobre cualquier inferencia", async () => {
        const { service, institutions } = build();

        await service.syncTransactionBankLinks(USER, {
            merchant: "Banco del Austro",
            institutionKind: "COOPERATIVE",
        });

        const [creada] = await institutions.findByOwnerId(USER);
        expect(creada.kind).toBe("COOPERATIVE");
    });

    it("infiere solo cuando el nombre lo dice sin ambigüedad", async () => {
        const casos: [string, string][] = [
            ["Banco del Austro", "BANK"],
            ["Coop Jardín Azuayo", "COOPERATIVE"],
            ["Billetera Deuna", "WALLET"],
            // Producto, no institución: queda genérico para que el usuario lo diga.
            ["PACIFICARD", "OTHER"],
            ["Mutualista Pichincha", "OTHER"],
        ];

        for (const [merchant, esperado] of casos) {
            const { service, institutions } = build();
            await service.syncTransactionBankLinks(USER, { merchant });
            const [creada] = await institutions.findByOwnerId(USER);
            expect([merchant, creada?.kind]).toEqual([merchant, esperado]);
        }
    });
});

describe("syncTransactionBankLinks — sin números enmascarados", () => {
    it("un merchant que es banco crea el emisor", async () => {
        const { service, institutions } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: "Banco del Austro",
        });

        expect(links.bankInstitutionId).toBeTruthy();
        expect(await institutions.findByOwnerId(USER)).toHaveLength(1);
    });

    it("un comercio cualquiera no crea nada", async () => {
        const { service, institutions } = build();

        const links = await service.syncTransactionBankLinks(USER, { merchant: "FARMASHOP" });

        expect(links.bankInstitutionId).toBeNull();
        expect(await institutions.findByOwnerId(USER)).toHaveLength(0);
    });

    it("NUNCA funda cuentas sin escaneo, aunque el emisor exista", async () => {
        const { service, accounts, cards } = build();

        await service.syncTransactionBankLinks(USER, { merchant: "Banco del Austro" });

        expect(await accounts.findByOwnerId(USER)).toHaveLength(0);
        expect(await cards.findByOwnerId(USER)).toHaveLength(0);
    });

    it("conserva la cuenta que el usuario eligió a mano", async () => {
        const { service } = build();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const cuenta = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS",
        });

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: "Banco del Austro",
            bankSourceAccountId: cuenta.id,
        });

        expect(links.bankSourceAccountId).toBe(cuenta.id);
    });

    it("es idempotente: no duplica el emisor al reeditar", async () => {
        const { service, institutions } = build();

        await service.syncTransactionBankLinks(USER, { merchant: "Banco del Austro" });
        await service.syncTransactionBankLinks(USER, { merchant: "Banco del Austro" });

        expect(await institutions.findByOwnerId(USER)).toHaveLength(1);
    });
});

describe("syncTransactionBankLinks — con números enmascarados", () => {
    it("con escaneo sí identifica y funda la cuenta de origen", async () => {
        const { service, accounts } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: "Banco del Austro",
            scannedAccounts: [{ type: "origen", account: "AHO - XXXXXX0814" }],
        });

        expect(links.bankSourceAccountId).toBeTruthy();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("lo elegido a mano gana sobre lo que resolvió el escaneo", async () => {
        const { service } = build();
        const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
        const elegida = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "9511",
        });

        const links = await service.syncTransactionBankLinks(USER, {
            merchant: "Banco del Austro",
            bankSourceAccountId: elegida.id,
            scannedAccounts: [{ type: "origen", account: "XXXXXX0814" }],
        });

        expect(links.bankSourceAccountId).toBe(elegida.id);
    });
});

describe("de qué lado queda la cuenta, según el tipo", () => {
    // El escáner marca como «origen» la cuenta protagonista del comprobante,
    // también en uno de ingreso. Guardada así, la cuenta entregaba el dinero
    // que en realidad recibió y su saldo se movía al revés.
    it("un ingreso guarda su cuenta en el destino, aunque llegue como origen", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            type: "INCOME",
            merchant: "Banco Pichincha",
            bankSourceAccountId: "acc-1",
        });

        expect(links.bankDestinationAccountId).toBe("acc-1");
        expect(links.bankSourceAccountId).toBeNull();
    });

    it("un gasto no se toca: su cuenta entrega el dinero", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            type: "EXPENSE",
            merchant: "Banco Pichincha",
            bankSourceAccountId: "acc-1",
        });

        expect(links.bankSourceAccountId).toBe("acc-1");
        expect(links.bankDestinationAccountId).toBeNull();
    });

    it("con las dos puntas puestas, manda lo que eligió el usuario", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            type: "DEPOSIT",
            bankSourceAccountId: "acc-1",
            bankDestinationAccountId: "acc-2",
        });

        expect(links.bankSourceAccountId).toBe("acc-1");
        expect(links.bankDestinationAccountId).toBe("acc-2");
    });

    it("sin tipo declarado, nada se mueve", async () => {
        const { service } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            bankSourceAccountId: "acc-1",
        });

        expect(links.bankSourceAccountId).toBe("acc-1");
    });
});
