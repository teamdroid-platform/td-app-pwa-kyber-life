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

const USER = "11111111-1111-4111-8111-111111111111";

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
    const scanner = new InMemoryFinancialScannerTransactionRepository();
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions,
        identification, scanner,
    );
    return { service, institutions };
}

function scan(merchant: string, accounts: ScannedAccountEntry[] = [{ type: "origen", account: "XXX5010" }]) {
    return {
        accounts,
        merchant,
        currency: "USD",
        amount: 25,
        date: "2026-09-21",
        description: "Transferencia",
    };
}

/** Todos los emisores del usuario, archivados incluidos. */
function todos(institutions: InMemoryBankInstitutionRepository) {
    return (institutions as unknown as { items: Map<string, { name: string }> }).items;
}

describe("resolveInstitution — un emisor archivado no se vuelve a crear", () => {
    it("reutiliza y revive el emisor que el usuario archivó, en vez de duplicarlo", async () => {
        const { service, institutions } = buildService();
        const original = await service.createInstitution(USER, {
            name: "Coop Jardín Azuayo", kind: "COOPERATIVE",
        });
        await service.deleteInstitution(USER, original.id);

        const result = await service.resolveScannedAccounts(USER, scan("Coop Jardín Azuayo"));

        // Sin esto, cada escaneo posterior a un borrado funda un emisor nuevo:
        // es lo que dejó nueve «Jardín Azuayo» en la base del usuario.
        expect(result.bankInstitutionId).toBe(original.id);
        expect(todos(institutions).size).toBe(1);
        expect(await institutions.findById(original.id)).not.toBeNull();
    });

    it("el emisor revivido conserva su id, así que conserva su regla de balance", async () => {
        const { service } = buildService();
        const original = await service.createInstitution(USER, {
            name: "Coop Jardín Azuayo", kind: "COOPERATIVE",
        });
        await service.deleteInstitution(USER, original.id);

        const primera = await service.resolveScannedAccounts(USER, scan("Coop Jardín Azuayo"));
        await service.deleteInstitution(USER, original.id);
        const segunda = await service.resolveScannedAccounts(USER, scan("Coop Jardín Azuayo"));

        // El id es la clave de financial_balance_scope_rules: un id nuevo nace
        // sin regla, o sea incluido en el balance, aunque el usuario hubiera
        // excluido ese banco.
        expect([primera.bankInstitutionId, segunda.bankInstitutionId])
            .toEqual([original.id, original.id]);
    });
});

describe("resolveInstitution — el nombre se compara como en el resto de la app", () => {
    it("reutiliza el emisor aunque el escaneo traiga otras mayúsculas y sin tildes", async () => {
        const { service, institutions } = buildService();
        const original = await service.createInstitution(USER, {
            name: "Coop Jardín Azuayo", kind: "COOPERATIVE",
        });

        const result = await service.resolveScannedAccounts(USER, scan("COOP JARDIN AZUAYO"));

        // El formulario ya compara con normalizeForMatch; el escaneo comparaba
        // con un ilike exacto, así que los dos caminos discrepaban sobre qué es
        // el mismo banco.
        expect(result.bankInstitutionId).toBe(original.id);
        expect(todos(institutions).size).toBe(1);
    });

    it("no confunde dos bancos distintos que comparten palabras", async () => {
        const { service } = buildService();
        const austro = await service.createInstitution(USER, {
            name: "Banco del Austro", kind: "BANK",
        });

        const result = await service.resolveScannedAccounts(USER, scan("Banco del Pacífico"));

        expect(result.bankInstitutionId).not.toBe(austro.id);
    });
});

describe("resolveInstitution — varios emisores homónimos", () => {
    it("reutiliza el más antiguo en vez de fundar uno más", async () => {
        const { service, institutions } = buildService();
        const primero = await service.createInstitution(USER, {
            name: "Coop Jardín Azuayo", kind: "COOPERATIVE",
        });
        await service.createInstitution(USER, {
            name: "Coop Jardín Azuayo", kind: "COOPERATIVE",
        });

        const result = await service.resolveScannedAccounts(USER, scan("Coop Jardín Azuayo"));

        // `.maybeSingle()` devuelve error con dos filas y el llamador lo trataba
        // como «no existe», creando una tercera en cada escaneo.
        expect(result.bankInstitutionId).toBe(primero.id);
        expect(todos(institutions).size).toBe(2);
    });
});
