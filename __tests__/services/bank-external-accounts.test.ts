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
    return { service, identification, observations, accounts, cards, inst };
}

/** Un gasto cuyo origen es el número dado: el escaneo lo dará por propio. */
function gasto(raw: string, ownership?: Record<string, { ownership: "MINE" | "EXTERNAL" }>) {
    const accounts: ScannedAccountEntry[] = [{ type: "origen", account: raw }];
    return {
        accounts, merchant: "Banco del Austro", currency: "USD",
        paidWithCredit: false, ...(ownership ? { ownership } : {}),
    };
}

async function activeAccounts(accounts: InMemoryBankAccountRepository) {
    return (await accounts.findByOwnerId(USER)).filter(a => !a.isDeleted);
}

describe("una cuenta que el usuario declara ajena", () => {
    it("desaparece de Bancos aunque el escaneo ya la hubiera fundado", async () => {
        const { service, accounts } = await buildService();

        // El escaneo supone que el origen de un gasto es tuyo y funda la cuenta.
        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903"));
        expect(await activeAccounts(accounts)).toHaveLength(1);

        // El usuario la desmiente desde el movimiento.
        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903", { "XXXXXX7903": { ownership: "EXTERNAL" } }));

        expect(await activeAccounts(accounts)).toHaveLength(0);
    });

    it("sigue colgada del movimiento como referencia", async () => {
        const { service, observations } = await buildService();

        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903"));
        const links = await service.resolveScannedAccounts(USER, gasto("XXXXXX7903", { "XXXXXX7903": { ownership: "EXTERNAL" } }));

        // La transacción conserva a quién le pagaste; lo que se va es la
        // identidad falsa, no el dato.
        expect(links.bankCounterpartyObservationId).not.toBeNull();
        expect(links.bankSourceAccountId).toBeNull();

        const observacion = (await observations.findByOwnerId(USER))
            .find(o => o.raw === "XXXXXX7903");
        expect(observacion?.resolution).toBe("EXTERNAL");
        expect(observacion?.accountId).toBeNull();
    });

    it("no vuelve a la conciliación: ni pendiente ni resuelta", async () => {
        const { service, identification } = await buildService();

        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903"));
        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903", { "XXXXXX7903": { ownership: "EXTERNAL" } }));

        for (const resolution of ["PENDING", "EXACT", "INFERRED"] as const) {
            expect(await identification.groupsByResolution(USER, resolution)).toEqual([]);
        }
    });

    it("una re-lectura del mismo número no la resucita", async () => {
        const { service, accounts, identification } = await buildService();

        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903"));
        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903", { "XXXXXX7903": { ownership: "EXTERNAL" } }));

        // Otro movimiento con la misma cadena, sin que el usuario diga nada.
        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903"));

        expect(await activeAccounts(accounts)).toHaveLength(0);
        expect(await identification.groupsByResolution(USER, "PENDING")).toEqual([]);
    });
});

describe("qué no se archiva al declarar algo ajeno", () => {
    it("una cuenta dada de alta a mano sobrevive: es suya aunque el número no lo sea", async () => {
        const { service, identification, observations, accounts, inst } = await buildService();

        const mia = await service.createAccount(USER, {
            institutionId: inst.id, accountType: "SAVINGS", lastFour: "7903",
        });
        const observacion = await identification.observe(USER, "XXXXXX7903");
        await identification.assignObservation(USER, observacion.id, {
            kind: "ACCOUNT", targetId: mia.id,
        });

        await identification.markExternal(USER, observacion.id);

        expect((await accounts.findById(mia.id))?.isDeleted).toBe(false);
        expect((await observations.findById(observacion.id))?.resolution).toBe("EXTERNAL");
    });

    it("una identidad que otra observación sigue usando sobrevive", async () => {
        const { service, identification, accounts } = await buildService();

        await service.resolveScannedAccounts(USER, gasto("XXXXXX7903"));
        const cuenta = (await activeAccounts(accounts))[0];

        // Una segunda cadena del mismo número, ligada a la misma cuenta.
        const otra = await identification.observe(USER, "******7903");
        await identification.assignObservation(USER, otra.id, {
            kind: "ACCOUNT", targetId: cuenta.id,
        });

        const primera = (await identification.groupsByResolution(USER, "EXACT"))[0];
        await identification.markExternal(USER, primera.observationIds[0]);

        // Archivarla dejaría a la otra observación apuntando al vacío.
        expect(await activeAccounts(accounts)).toHaveLength(1);
    });
});
