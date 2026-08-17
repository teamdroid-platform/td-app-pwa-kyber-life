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
 * Una transferencia recibida de la cooperativa: sale de `25XXX10` y entra a
 * `10XXXXXX11`. Ambos números son cortos —dos dígitos por lado— y el destino
 * es, en este caso, una cuenta del propio usuario.
 */
const TRANSFERENCIA = [
    { type: "origen", account: "25XXX10" },
    { type: "destino", account: "10XXXXXX11" },
];

const BASE = {
    merchant: "COAC Jardín Azuayo",
    currency: "USD",
    paidWithCredit: false,
    scannedAccounts: TRANSFERENCIA,
};

describe("de quién es cada cuenta", () => {
    it("sin declarar nada, supone por el lado: sale mía, entra de otro", async () => {
        const { service, accounts, observations } = build();

        const links = await service.syncTransactionBankLinks(USER, BASE);

        expect(links.bankSourceAccountId).toBeTruthy();
        expect(links.bankDestinationAccountId).toBeNull();
        expect(links.bankCounterpartyObservationId).toBeTruthy();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
        expect((await observations.findByRaw(USER, "10XXXXXX11"))?.resolution).toBe("EXTERNAL");
    });

    it("declarar el destino como mío lo registra en vez de descartarlo", async () => {
        const { service, accounts } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: { "10XXXXXX11": { ownership: "MINE" } },
        });

        expect(links.bankDestinationAccountId).toBeTruthy();
        expect(links.bankCounterpartyObservationId).toBeNull();
        // Las dos cuentas de una transferencia entre cuentas propias.
        expect(await accounts.findByOwnerId(USER)).toHaveLength(2);
    });

    it("declarar el origen como ajeno no lo funda, y lo guarda como contraparte", async () => {
        const { service, accounts, observations } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: { "25XXX10": { ownership: "EXTERNAL" }, "10XXXXXX11": { ownership: "MINE" } },
        });

        expect(links.bankSourceAccountId).toBeNull();
        expect(links.bankDestinationAccountId).toBeTruthy();
        // Quien te transfiere es tan tercero como aquel a quien le transfieres.
        expect(links.bankCounterpartyObservationId).toBeTruthy();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
        expect((await observations.findByRaw(USER, "25XXX10"))?.resolution).toBe("EXTERNAL");
    });

    it("una cuenta de dos dígitos por lado sí se registra: cuatro conocidos bastan", async () => {
        const { service, accounts } = build();

        await service.syncTransactionBankLinks(USER, BASE);

        const [cuenta] = await accounts.findByOwnerId(USER);
        expect(cuenta).toMatchObject({
            prefixDigits: "25",
            lastFour: "10",
            isUnconfirmed: true,
        });
    });

    it("y conserva el prefijo, que es lo que la distingue de otra terminada en 10", async () => {
        const { service } = build();

        await service.syncTransactionBankLinks(USER, BASE);

        // Un número con el mismo final pero otro principio no es esta cuenta.
        const otra = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            scannedAccounts: [{ type: "origen", account: "77XXX10" }],
        });
        const primera = await service.syncTransactionBankLinks(USER, BASE);

        expect(otra.bankSourceAccountId).not.toBe(primera.bankSourceAccountId);
    });

    it("lo declarado se respeta al reeditar, sin volver a preguntar", async () => {
        const { service, accounts } = build();

        const ownership = { "10XXXXXX11": { ownership: "MINE" as const } };
        const primera = await service.syncTransactionBankLinks(USER, { ...BASE, ownership });
        const segunda = await service.syncTransactionBankLinks(USER, { ...BASE, ownership });

        expect(segunda.bankDestinationAccountId).toBe(primera.bankDestinationAccountId);
        expect(await accounts.findByOwnerId(USER)).toHaveLength(2);
    });

    it("declararla mía después de haberla dado por ajena la recupera", async () => {
        const { service, accounts, observations } = build();

        // Primera confirmación: nadie preguntó, el destino se dio por ajeno.
        await service.syncTransactionBankLinks(USER, BASE);
        expect((await observations.findByRaw(USER, "10XXXXXX11"))?.resolution).toBe("EXTERNAL");

        // El usuario corrige: esa cuenta es suya.
        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: { "10XXXXXX11": { ownership: "MINE" } },
        });

        expect(links.bankDestinationAccountId).toBeTruthy();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(2);
    });

    it("corregirla no la deja fuera del movimiento", async () => {
        const { service } = build();

        await service.syncTransactionBankLinks(USER, BASE);
        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: { "10XXXXXX11": { ownership: "MINE" } },
        });

        // Antes se perdía: ni cuenta, ni contraparte, ni rastro en la fila.
        const vistas = await service.transactionAccounts(USER, links);
        expect(vistas.map(v => v.role)).toEqual(["SOURCE", "DESTINATION"]);
    });

    it("sin emisor conocido se registra igual, sin institución", async () => {
        const { service, accounts } = build();

        await service.syncTransactionBankLinks(USER, {
            ...BASE,
            merchant: "FARMASHOP",
            scannedAccounts: [{ type: "origen", account: "XXXXXX0814" }],
        });

        const [cuenta] = await accounts.findByOwnerId(USER);
        expect(cuenta.lastFour).toBe("0814");
        expect(cuenta.institutionId).toBeNull();
    });

    it("la vista devuelve lo declarado para que el control lo muestre", async () => {
        const { service } = build();

        const vistas = await service.previewScannedAccounts(
            USER, TRANSFERENCIA, { "10XXXXXX11": { ownership: "MINE" } },
        );

        expect(vistas.map(v => [v.raw, v.ownership])).toEqual([
            ["25XXX10", null],
            ["10XXXXXX11", "MINE"],
        ]);
    });
});

describe("corregir la cuenta antes de confirmar", () => {
    it("la crea con la institución que el usuario eligió", async () => {
        const { service, accounts } = build();
        const otro = await service.createInstitution(USER, { name: "Banco Pichincha", kind: "BANK" });

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: {
                "25XXX10": { ownership: "MINE", institutionId: otro.id },
            },
        });

        const cuenta = await accounts.findById(links.bankSourceAccountId!);
        // El escaneo decía Jardín Azuayo; manda lo que el usuario corrigió.
        expect(cuenta?.institutionId).toBe(otro.id);
    });

    it("crea el emisor que el usuario escribió, con el tipo que declaró", async () => {
        const { service, accounts, institutions } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: {
                "25XXX10": {
                    ownership: "MINE",
                    institutionName: "Mutualista Azuay",
                    institutionKind: "COOPERATIVE",
                },
            },
        });

        const cuenta = await accounts.findById(links.bankSourceAccountId!);
        const emisor = (await institutions.findByOwnerId(USER)).find(i => i.id === cuenta?.institutionId);
        expect(emisor).toMatchObject({ name: "Mutualista Azuay", kind: "COOPERATIVE" });
    });

    it("respeta que sea una tarjeta cuando el número no lo delataba", async () => {
        const { service, cards } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: {
                "25XXX10": { ownership: "MINE", kind: "CARD", cardType: "CREDIT" },
            },
        });

        expect(links.bankCardId).toBeTruthy();
        const [tarjeta] = await cards.findByOwnerId(USER);
        expect(tarjeta).toMatchObject({ cardType: "CREDIT", lastFour: "10" });
    });

    it("respeta el tipo de cuenta declarado", async () => {
        const { service, accounts } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: {
                "25XXX10": { ownership: "MINE", accountType: "CHECKING" },
            },
        });

        expect((await accounts.findById(links.bankSourceAccountId!))?.accountType).toBe("CHECKING");
    });

    it("guarda los dígitos corregidos, no los que leyó el escáner", async () => {
        const { service, accounts } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: {
                // El banco escribió 25XXX10; el número real es otro.
                "25XXX10": { ownership: "MINE", number: "2501234510" },
            },
        });

        const cuenta = await accounts.findById(links.bankSourceAccountId!);
        // Del número completo se guardan las dos partes que identifican: el
        // principio y los últimos cuatro. Nada de los dígitos que leyó el
        // escáner sobrevive.
        expect(cuenta).toMatchObject({ prefixDigits: "250123", lastFour: "4510" });
    });

    it("y ata la cadena original a lo creado, aunque ya no se parezcan", async () => {
        const { service, observations } = build();

        const links = await service.syncTransactionBankLinks(USER, {
            ...BASE,
            ownership: {
                "25XXX10": { ownership: "MINE", number: "9999888877" },
            },
        });

        // Sin fijar el vínculo, el emparejamiento no reconocería «25XXX10» en
        // una cuenta que ahora termina en otra cosa, y el escaneo siguiente
        // volvería a crearla.
        const observacion = await observations.findByRaw(USER, "25XXX10");
        expect(observacion?.accountId).toBe(links.bankSourceAccountId);
        expect(observacion?.resolution).toBe("MANUAL");
    });
});
