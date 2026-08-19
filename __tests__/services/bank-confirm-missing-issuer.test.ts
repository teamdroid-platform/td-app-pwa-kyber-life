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
});

describe("identitiesMissingIssuer", () => {
    it("nombra exactamente las que la confirmación va a apartar", async () => {
        const { service, account, card, resolved } = await build();
        const cuenta = await account({ institutionId: null, lastFour: "8729" });
        const tarjeta = await card({ institutionId: null });
        await account({ lastFour: "0814" });
        await resolved({ accountId: cuenta.id });
        await resolved({ cardId: tarjeta.id });

        const faltan = await service.identitiesMissingIssuer(USER);

        expect(faltan.accounts.map(a => a.id)).toEqual([cuenta.id]);
        expect(faltan.cards.map(c => c.id)).toEqual([tarjeta.id]);
    });

    it("lo que avisa y lo que hace no pueden discrepar", async () => {
        const { service, account, resolved } = await build();
        await resolved({ accountId: (await account({ institutionId: null })).id });
        await resolved({ accountId: (await account()).id });

        const faltan = await service.identitiesMissingIssuer(USER);
        const { skipped } = await service.confirmResolvedIdentities(USER);

        expect(skipped).toBe(faltan.accounts.length + faltan.cards.length);
    });

    it("sin nada pendiente no señala a nadie", async () => {
        const { service, account, resolved } = await build();
        await resolved({ accountId: (await account()).id });

        expect(await service.identitiesMissingIssuer(USER))
            .toEqual({ accounts: [], cards: [] });
    });
});
