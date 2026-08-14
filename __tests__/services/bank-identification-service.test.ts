import { randomUUID } from "crypto";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";

const USER = "11111111-1111-4111-8111-111111111111";

function stamps() {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, isDeleted: false };
}

async function buildService() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const observations = new InMemoryBankNumberObservationRepository();
    const service = new BankIdentificationService(observations, accounts, cards, institutions);

    const inst = await institutions.create({
        id: randomUUID(), ownerUserId: USER, name: "Banco del Austro",
        kind: "BANK", isUnconfirmed: false, ...stamps(),
    });
    const cuenta = await accounts.create({
        id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
        name: "Ahorros Principal", accountType: "SAVINGS", lastFour: "0814",
        currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...stamps(),
    });

    return { service, observations, accounts, cards, institutions, inst, cuenta };
}

describe("observe", () => {
    it("liga una cadena de 4 dígitos a la cuenta existente como EXACT", async () => {
        const { service, cuenta } = await buildService();
        const result = await service.observe(USER, "******0814");

        expect(result.resolution).toBe("EXACT");
        expect(result.accountId).toBe(cuenta.id);
    });

    it("la misma cadena dos veces no duplica la observación", async () => {
        const { service, observations } = await buildService();
        await service.observe(USER, "******0814");
        await service.observe(USER, "******0814");

        const all = await observations.findByOwnerId(USER);
        expect(all).toHaveLength(1);
        expect(all[0].occurrences).toBe(2);
    });

    it("una máscara nueva del mismo número se liga sola", async () => {
        const { service, cuenta } = await buildService();
        await service.observe(USER, "******0814");
        const otra = await service.observe(USER, "AHO - XXXXXX0814");

        expect(otra.accountId).toBe(cuenta.id);
    });

    it("guarda las partes parseadas de la huella", async () => {
        const { service } = await buildService();
        const result = await service.observe(USER, "493176XXXXXX2780");

        expect(result).toMatchObject({
            prefixDigits: "493176", suffixDigits: "2780", bin: "493176",
            brand: null, isComplete: false, totalLength: 16,
        });
    });

    it("una cadena sin candidato queda PENDING y no inventa cuenta", async () => {
        const { service, accounts } = await buildService();
        const result = await service.observe(USER, "22XXXXXX99");

        expect(result.resolution).toBe("PENDING");
        expect(result.accountId).toBeNull();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("el guard de prefijo evita ligar 25XXX61 a la Mastercard", async () => {
        const { service, cards, inst } = await buildService();
        await cards.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            name: "Pacificard", cardType: "CREDIT", bin: "542258", lastFour: "8361",
            prefixDigits: "542258", currency: "USD", status: "ACTIVE",
            isUnconfirmed: false, ...stamps(),
        });

        const result = await service.observe(USER, "25XXX61");
        expect(result.resolution).toBe("PENDING");
        expect(result.cardId).toBeNull();
    });

    it("una observación resuelta enseña la identidad para la siguiente máscara", async () => {
        const { service, cards, inst } = await buildService();
        const card = await cards.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            name: "Pacificard", cardType: "CREDIT", lastFour: "8361",
            currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...stamps(),
        });
        // La tarjeta declara solo los 4 últimos; esta observación aporta el BIN.
        await service.observe(USER, "542258XXXXXXX361");

        const result = await service.observe(USER, "PACIFICARD 542258XXXXXXX361");
        expect(result.cardId).toBe(card.id);
    });
});

describe("pendingGroups", () => {
    it("agrupa las pendientes por prefijo y sufijo, y suma sus ocurrencias", async () => {
        const { service } = await buildService();
        await service.observe(USER, "22XXXXXX99");
        await service.observe(USER, "22XXXXXX99");
        await service.observe(USER, "00XXXXXX23");

        const groups = await service.pendingGroups(USER);
        const g99 = groups.find(g => g.suffixDigits === "99");

        expect(g99?.occurrences).toBe(2);
        expect(g99?.samples).toContain("22XXXXXX99");
        expect(groups).toHaveLength(2);
    });

    it("ordena de más a menos frecuente", async () => {
        const { service } = await buildService();
        await service.observe(USER, "00XXXXXX23");
        await service.observe(USER, "22XXXXXX99");
        await service.observe(USER, "22XXXXXX99");

        const groups = await service.pendingGroups(USER);
        expect(groups[0].suffixDigits).toBe("99");
    });

    it("una pendiente ambigua lista sus candidatos", async () => {
        const { service, accounts, inst } = await buildService();
        await accounts.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            name: "B", accountType: "SAVINGS", lastFour: "9558",
            currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...stamps(),
        });
        await accounts.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            name: "C", accountType: "SAVINGS", lastFour: "4058",
            currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...stamps(),
        });

        await service.observe(USER, "28XXX58");
        const groups = await service.pendingGroups(USER);
        const grupo = groups.find(g => g.suffixDigits === "58");

        expect(grupo?.candidateIds).toHaveLength(2);
    });
});

describe("assignObservation", () => {
    it("asignar a mano marca MANUAL y liga la identidad", async () => {
        const { service, observations, cuenta } = await buildService();
        const pending = await service.observe(USER, "22XXXXXX99");

        const updated = await service.assignObservation(USER, pending.id, {
            kind: "ACCOUNT", targetId: cuenta.id,
        });

        expect(updated.resolution).toBe("MANUAL");
        expect(updated.accountId).toBe(cuenta.id);
        expect((await observations.findByRaw(USER, "22XXXXXX99"))?.accountId).toBe(cuenta.id);
    });

    it("marcar como ajena no crea ninguna identidad", async () => {
        const { service, accounts } = await buildService();
        const pending = await service.observe(USER, "XXXXXX6655");

        const updated = await service.markExternal(USER, pending.id);

        expect(updated.resolution).toBe("EXTERNAL");
        expect(updated.accountId).toBeNull();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("no toca observaciones de otro usuario", async () => {
        const { service, cuenta } = await buildService();
        const pending = await service.observe(USER, "22XXXXXX99");

        await expect(
            service.assignObservation("99999999-9999-4999-8999-999999999999", pending.id, {
                kind: "ACCOUNT", targetId: cuenta.id,
            }),
        ).rejects.toThrow(/no encontrada/i);
    });
});

describe("reobserve", () => {
    it("re-resuelve una pendiente contra las identidades de ahora", async () => {
        const { service, accounts, inst } = await buildService();
        const pending = await service.observe(USER, "XXXXXX9511");
        expect(pending.resolution).toBe("PENDING");

        const nueva = await accounts.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            name: "Corriente", accountType: "CHECKING", lastFour: "9511",
            currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...stamps(),
        });

        const result = await service.reobserve(USER, "XXXXXX9511");
        expect(result.resolution).toBe("EXACT");
        expect(result.accountId).toBe(nueva.id);
    });

    it("no pisa lo que el usuario decidió a mano", async () => {
        const { service, cuenta } = await buildService();
        const pending = await service.observe(USER, "22XXXXXX99");
        await service.assignObservation(USER, pending.id, {
            kind: "ACCOUNT", targetId: cuenta.id,
        });

        const result = await service.reobserve(USER, "22XXXXXX99");
        expect(result.resolution).toBe("MANUAL");
        expect(result.accountId).toBe(cuenta.id);
    });

    it("tampoco pisa una marcada como ajena", async () => {
        const { service } = await buildService();
        const pending = await service.observe(USER, "XXXXXX6655");
        await service.markExternal(USER, pending.id);

        const result = await service.reobserve(USER, "XXXXXX6655");
        expect(result.resolution).toBe("EXTERNAL");
    });
});

describe("reparseAll", () => {
    it("rellena las partes de las observaciones que llegaron sin parsear", async () => {
        const { service, observations } = await buildService();
        // Como las deja el backfill: raw y occurrences, nada más.
        await observations.create({
            id: randomUUID(), ownerUserId: USER, raw: "493176XXXXXX2780",
            prefixDigits: "", suffixDigits: "", isComplete: false,
            resolution: "PENDING", occurrences: 97, ...stamps(),
        });

        await service.reparseAll(USER);

        const updated = await observations.findByRaw(USER, "493176XXXXXX2780");
        expect(updated).toMatchObject({
            prefixDigits: "493176", suffixDigits: "2780", bin: "493176",
        });
        expect(updated?.occurrences).toBe(97);
    });

    it("no pisa lo que el usuario ya asignó a mano", async () => {
        const { service, observations, cuenta } = await buildService();
        const obs = await service.observe(USER, "22XXXXXX99");
        await service.assignObservation(USER, obs.id, { kind: "ACCOUNT", targetId: cuenta.id });

        await service.reparseAll(USER);

        const after = await observations.findByRaw(USER, "22XXXXXX99");
        expect(after?.resolution).toBe("MANUAL");
        expect(after?.accountId).toBe(cuenta.id);
    });

    it("es idempotente", async () => {
        const { service, observations } = await buildService();
        await service.observe(USER, "******0814");

        await service.reparseAll(USER);
        const primera = await observations.findByRaw(USER, "******0814");
        await service.reparseAll(USER);
        const segunda = await observations.findByRaw(USER, "******0814");

        expect(segunda?.resolution).toBe(primera?.resolution);
        expect(segunda?.accountId).toBe(primera?.accountId);
        expect(await observations.findByOwnerId(USER)).toHaveLength(1);
    });
});
