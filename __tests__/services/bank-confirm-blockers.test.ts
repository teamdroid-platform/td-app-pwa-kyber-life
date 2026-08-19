import { randomUUID } from "crypto";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import type { BankAccount, BankCard } from "@/domain/entities/bank";

const USER = "11111111-1111-4111-8111-111111111111";

function stamps() {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, isDeleted: false };
}

async function build() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const observations = new InMemoryBankNumberObservationRepository();
    const service = new BankIdentificationService(observations, accounts, cards, institutions);

    const inst = await institutions.create({
        id: randomUUID(), ownerUserId: USER, name: "Banco del Austro",
        kind: "BANK", isUnconfirmed: false, ...stamps(),
    });

    /** Una cuenta sin revisar, con o sin emisor. */
    async function account(partial: Partial<BankAccount> = {}): Promise<BankAccount> {
        return accounts.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            accountType: "SAVINGS", lastFour: "0814", currency: "USD",
            status: "ACTIVE", isUnconfirmed: true, ...stamps(), ...partial,
        });
    }

    async function card(partial: Partial<BankCard> = {}): Promise<BankCard> {
        return cards.create({
            id: randomUUID(), ownerUserId: USER, institutionId: inst.id,
            cardType: "CREDIT", lastFour: "8361", currency: "USD",
            status: "ACTIVE", isUnconfirmed: true, ...stamps(), ...partial,
        });
    }

    /** Una observación ya resuelta contra la identidad dada. */
    async function resolved(target: { accountId?: string; cardId?: string }) {
        return observations.create({
            id: randomUUID(), ownerUserId: USER, raw: "******0814",
            prefixDigits: "", suffixDigits: "0814", totalLength: 10,
            bin: null, brand: null, accountTypeHint: null, institutionHint: null,
            isComplete: false, resolution: "EXACT", occurrences: 1,
            accountId: target.accountId ?? null, cardId: target.cardId ?? null,
            ...stamps(),
        });
    }

    return { service, accounts, cards, account, card, resolved };
}

describe("confirmResolvedIdentities", () => {
    it("confirma lo que tiene emisor", async () => {
        const { service, accounts, account, resolved } = await build();
        const cuenta = await account();
        await resolved({ accountId: cuenta.id });

        expect(await service.confirmResolvedIdentities(USER))
            .toEqual({ confirmed: 1, skipped: 0 });
        expect((await accounts.findById(cuenta.id))?.isUnconfirmed).toBe(false);
    });

    it("aparta la cuenta sin emisor en vez de reventar", async () => {
        const { service, accounts, account, resolved } = await build();
        // El caso real: dos cuentas nacidas de un escaneo que no dedujo el banco.
        // La tabla solo les permite existir mientras están sin revisar, así que
        // confirmarlas violaba el CHECK y tiraba la conciliación entera.
        const huerfana = await account({ institutionId: null, lastFour: "8729" });
        await resolved({ accountId: huerfana.id });

        expect(await service.confirmResolvedIdentities(USER))
            .toEqual({ confirmed: 0, skipped: 1 });
        expect((await accounts.findById(huerfana.id))?.isUnconfirmed).toBe(true);
    });

    it("una huérfana no impide confirmar las demás", async () => {
        const { service, accounts, account, resolved } = await build();
        const huerfana = await account({ institutionId: null, lastFour: "8729" });
        const buena = await account({ lastFour: "0814" });
        await resolved({ accountId: huerfana.id });
        await resolved({ accountId: buena.id });

        expect(await service.confirmResolvedIdentities(USER))
            .toEqual({ confirmed: 1, skipped: 1 });
        expect((await accounts.findById(buena.id))?.isUnconfirmed).toBe(false);
        expect((await accounts.findById(huerfana.id))?.isUnconfirmed).toBe(true);
    });

    it("el efectivo se confirma sin emisor: la tabla lo exige así", async () => {
        const { service, accounts, account, resolved } = await build();
        const efectivo = await account({ institutionId: null, accountType: "CASH", lastFour: null });
        await resolved({ accountId: efectivo.id });

        expect(await service.confirmResolvedIdentities(USER))
            .toEqual({ confirmed: 1, skipped: 0 });
        expect((await accounts.findById(efectivo.id))?.isUnconfirmed).toBe(false);
    });

    it("una tarjeta sin emisor también se aparta", async () => {
        const { service, cards, card, resolved } = await build();
        const huerfana = await card({ institutionId: null });
        await resolved({ cardId: huerfana.id });

        expect(await service.confirmResolvedIdentities(USER))
            .toEqual({ confirmed: 0, skipped: 1 });
        expect((await cards.findById(huerfana.id))?.isUnconfirmed).toBe(true);
    });

    it("una de débito sin cuenta se aparta aunque tenga emisor", async () => {
        const { service, cards, card, resolved } = await build();
        // Segunda regla que la base relaja mientras está sin revisar: un débito
        // confirmado tiene que decir de qué cuenta gasta.
        const debito = await card({ cardType: "DEBIT", accountId: null, lastFour: "2780" });
        await resolved({ cardId: debito.id });

        expect(await service.confirmResolvedIdentities(USER))
            .toEqual({ confirmed: 0, skipped: 1 });
        expect((await cards.findById(debito.id))?.isUnconfirmed).toBe(true);
    });

    it("una de débito con su cuenta sí se confirma", async () => {
        const { service, cards, account, card, resolved } = await build();
        const cuenta = await account();
        const debito = await card({ cardType: "DEBIT", accountId: cuenta.id, lastFour: "2780" });
        await resolved({ cardId: debito.id });

        expect((await service.confirmResolvedIdentities(USER)).confirmed).toBe(1);
        expect((await cards.findById(debito.id))?.isUnconfirmed).toBe(false);
    });

    it("una de crédito sin cuenta se confirma: la cuenta es cosa del débito", async () => {
        const { service, cards, card, resolved } = await build();
        const credito = await card({ cardType: "CREDIT", accountId: null });
        await resolved({ cardId: credito.id });

        expect((await service.confirmResolvedIdentities(USER)).confirmed).toBe(1);
        expect((await cards.findById(credito.id))?.isUnconfirmed).toBe(false);
    });
});

describe("identitiesBlockedFromConfirming", () => {
    it("nombra cada una con lo que le falta", async () => {
        const { service, account, card, resolved } = await build();
        const cuenta = await account({ institutionId: null, lastFour: "8729" });
        const sinEmisor = await card({ institutionId: null });
        const debito = await card({ cardType: "DEBIT", accountId: null, lastFour: "2780" });
        await account({ lastFour: "0814" });
        await resolved({ accountId: cuenta.id });
        await resolved({ cardId: sinEmisor.id });
        await resolved({ cardId: debito.id });

        const faltan = await service.identitiesBlockedFromConfirming(USER);

        expect(faltan.accounts).toEqual([{ account: expect.objectContaining({ id: cuenta.id }), reason: "ISSUER" }]);
        expect(faltan.cards).toEqual(expect.arrayContaining([
            { card: expect.objectContaining({ id: sinEmisor.id }), reason: "ISSUER" },
            { card: expect.objectContaining({ id: debito.id }), reason: "DEBIT_ACCOUNT" },
        ]));
    });

    it("el emisor va antes que la cuenta: sin banco no se puede elegir", async () => {
        const { service, card, resolved } = await build();
        // Una de débito a la que le faltan las dos cosas pide primero el emisor,
        // porque la cuenta tiene que ser de ese mismo banco.
        const ambas = await card({ cardType: "DEBIT", institutionId: null, accountId: null });
        await resolved({ cardId: ambas.id });

        expect((await service.identitiesBlockedFromConfirming(USER)).cards[0].reason).toBe("ISSUER");
    });

    it("lo que avisa y lo que hace no pueden discrepar", async () => {
        const { service, account, card, resolved } = await build();
        await resolved({ accountId: (await account({ institutionId: null })).id });
        await resolved({ cardId: (await card({ cardType: "DEBIT", accountId: null })).id });
        await resolved({ accountId: (await account()).id });

        const faltan = await service.identitiesBlockedFromConfirming(USER);
        const { skipped } = await service.confirmResolvedIdentities(USER);

        expect(skipped).toBe(faltan.accounts.length + faltan.cards.length);
    });

    it("sin nada pendiente no señala a nadie", async () => {
        const { service, account, resolved } = await build();
        await resolved({ accountId: (await account()).id });

        expect(await service.identitiesBlockedFromConfirming(USER))
            .toEqual({ accounts: [], cards: [] });
    });
});
