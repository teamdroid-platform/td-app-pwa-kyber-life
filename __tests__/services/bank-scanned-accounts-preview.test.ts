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

    return { service, identification, institutions, accounts, cards, observations };
}

/** El escenario real: una cuenta de ahorros y una tarjeta de crédito. */
async function withIdentities() {
    const ctx = build();
    const banco = await ctx.service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
    const cuenta = await ctx.service.createAccount(USER, {
        institutionId: banco.id, name: "Ahorros Principal",
        accountType: "SAVINGS", lastFour: "0814",
    });
    const tarjeta = await ctx.service.createCard(USER, {
        institutionId: banco.id, name: "Pacificard Mastercard",
        cardType: "CREDIT", lastFour: "8361", brand: "Mastercard",
    });
    return { ...ctx, banco, cuenta, tarjeta };
}

describe("previewScannedAccounts — no deja rastro", () => {
    it("no observa los números: la pantalla es una consulta, no una confirmación", async () => {
        const { service, observations } = await withIdentities();

        await service.previewScannedAccounts(USER, [
            { type: "origen", account: "AHO - XXXXXX0814" },
            { type: "destino", account: "XXXXXX1582" },
        ]);

        expect(await observations.findByOwnerId(USER)).toHaveLength(0);
    });

    it("no funda cuentas aunque el número dé para ello", async () => {
        const { service, accounts, cards } = await withIdentities();
        const antes = (await accounts.findByOwnerId(USER)).length;

        await service.previewScannedAccounts(USER, [
            { type: "origen", account: "XXXXXX9999" },
        ]);

        expect(await accounts.findByOwnerId(USER)).toHaveLength(antes);
        expect(await cards.findByOwnerId(USER)).toHaveLength(1);
    });
});

describe("previewScannedAccounts — qué muestra", () => {
    it("separa origen y destino tal como los nombra el escáner", async () => {
        const { service } = await withIdentities();

        const vistas = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "AHO - XXXXXX0814" },
            { type: "destino", account: "XXXXXX1582" },
        ]);

        expect(vistas.map(v => v.role)).toEqual(["SOURCE", "DESTINATION"]);
    });

    it("todo lo que no sea origen es destino", async () => {
        const { service } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "beneficiario", account: "XXXXXX1582" },
        ]);

        expect(vista.role).toBe("DESTINATION");
    });

    it("estandariza la cuenta con puntos y la tarjeta con equis", async () => {
        const { service } = await withIdentities();

        const [cuenta, tarjeta] = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "AHO - XXXXXX0814" },
            { type: "destino", account: "Mastercard-8361" },
        ]);

        expect(cuenta.display).toBe("••••0814");
        expect(cuenta.kind).toBe("ACCOUNT");
        expect(tarjeta.display).toBe("XXXX8361");
        expect(tarjeta.kind).toBe("CARD");
    });

    it("conserva el prefijo que el banco sí mostró", async () => {
        const { service } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "493176XXXXXX2780" },
        ]);

        // El BIN lo delata como tarjeta aunque el usuario no la tenga registrada.
        expect(vista.display).toBe("493176XXXX2780");
        expect(vista.kind).toBe("CARD");
    });

    it("un número sin BIN ni marca se muestra como cuenta, no se inventa una tarjeta", async () => {
        const { service } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "destino", account: "XXXXXX1582" },
        ]);

        expect(vista.kind).toBe("ACCOUNT");
        expect(vista.display).toBe("••••1582");
    });

    it("guarda intacta la cadena del banco como evidencia", async () => {
        const { service } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "  AHO - XXXXXX0814  " },
        ]);

        expect(vista.raw).toBe("AHO - XXXXXX0814");
    });
});

describe("previewScannedAccounts — a qué cuenta corresponde", () => {
    it("ata el número a la cuenta del usuario, con su institución", async () => {
        const { service, cuenta } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "AHO - XXXXXX0814" },
        ]);

        expect(vista.match).toEqual({
            id: cuenta.id,
            name: "Ahorros Principal",
            institutionName: "Banco del Austro",
        });
        expect(vista.resolution).toBe("EXACT");
    });

    it("ata también las tarjetas", async () => {
        const { service, tarjeta } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "Mastercard-8361" },
        ]);

        expect(vista.match?.id).toBe(tarjeta.id);
        expect(vista.kind).toBe("CARD");
    });

    it("deja sin atar lo que no es del usuario, en vez de forzar un parecido", async () => {
        const { service } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "destino", account: "XXXXXX1582" },
        ]);

        expect(vista.match).toBeNull();
        expect(vista.resolution).toBe("PENDING");
    });

    it("rescata el emisor que nombra el propio texto cuando no hay identidad", async () => {
        const { service } = await withIdentities();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "destino", account: "Pichincha XXXXXX1582" },
        ]);

        expect(vista.match).toBeNull();
        expect(vista.institutionHint).toBe("Pichincha");
    });
});

describe("transactionAccounts — lo mismo, ya confirmado", () => {
    it("muestra la cuenta de origen con su institución", async () => {
        const { service, cuenta } = await withIdentities();

        const [vista] = await service.transactionAccounts(USER, {
            bankSourceAccountId: cuenta.id,
        });

        expect(vista).toMatchObject({
            role: "SOURCE",
            display: "••••0814",
            kind: "ACCOUNT",
            resolution: "EXACT",
            match: { id: cuenta.id, name: "Ahorros Principal", institutionName: "Banco del Austro" },
        });
    });

    it("no arrastra evidencia: una cuenta elegida no tiene lectura que juzgar", async () => {
        const { service, cuenta } = await withIdentities();

        const [vista] = await service.transactionAccounts(USER, { bankSourceAccountId: cuenta.id });

        expect(vista.raw).toBe("");
    });

    it("la tarjeta describe el origen mejor que la cuenta de la que descuenta", async () => {
        const { service, banco, cuenta } = await withIdentities();
        const debito = await service.createCard(USER, {
            institutionId: banco.id, accountId: cuenta.id,
            name: "Visa Débito", cardType: "DEBIT", lastFour: "2780",
        });

        const vistas = await service.transactionAccounts(USER, {
            bankCardId: debito.id,
            bankSourceAccountId: cuenta.id,
        });

        expect(vistas).toHaveLength(1);
        expect(vistas[0].match?.id).toBe(debito.id);
        expect(vistas[0].display).toBe("XXXX2780");
    });

    it("muestra el destino cuando es una cuenta del usuario", async () => {
        const { service, banco } = await withIdentities();
        const otra = await service.createAccount(USER, {
            institutionId: banco.id, name: "Corriente", accountType: "CHECKING", lastFour: "9511",
        });

        const vistas = await service.transactionAccounts(USER, {
            bankDestinationAccountId: otra.id,
        });

        expect(vistas[0]).toMatchObject({ role: "DESTINATION", display: "••••9511" });
    });

    it("la contraparte de un tercero conserva la cadena del banco", async () => {
        const ctx = await withIdentities();
        const observacion = await ctx.identification.observe(USER, "XXXXXX1582");

        const [vista] = await ctx.service.transactionAccounts(USER, {
            bankCounterpartyObservationId: observacion.id,
        });

        expect(vista).toMatchObject({
            role: "DESTINATION",
            raw: "XXXXXX1582",
            display: "••••1582",
            match: null,
        });
    });

    it("una transacción sin vínculos no muestra nada", async () => {
        const { service } = await withIdentities();
        expect(await service.transactionAccounts(USER, {})).toEqual([]);
    });

    it("no muestra cuentas de otro dueño", async () => {
        const { service, cuenta } = await withIdentities();
        const OTRO = "22222222-2222-4222-8222-222222222222";

        expect(await service.transactionAccounts(OTRO, { bankSourceAccountId: cuenta.id }))
            .toEqual([]);
    });
});

describe("previewScannedAccounts — bordes", () => {
    it("sin cuentas escaneadas no muestra nada", async () => {
        const { service } = build();
        expect(await service.previewScannedAccounts(USER, [])).toEqual([]);
    });

    it("descarta las entradas vacías en vez de pintar filas en blanco", async () => {
        const { service } = build();

        const vistas = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "   " },
            { type: "destino", account: "" },
        ]);

        expect(vistas).toEqual([]);
    });

    it("sin ninguna identidad registrada sigue mostrando lo escaneado", async () => {
        const { service } = build();

        const [vista] = await service.previewScannedAccounts(USER, [
            { type: "origen", account: "AHO - XXXXXX0814" },
        ]);

        expect(vista.display).toBe("••••0814");
        expect(vista.match).toBeNull();
    });
});
