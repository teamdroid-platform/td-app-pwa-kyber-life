import { randomUUID } from "crypto";
import type { UUID } from "@/domain/core";
import type {
    BankNumberObservation, BankNumberResolution, BankAccount, BankCard,
} from "@/domain/entities/bank";
import type {
    IBankNumberObservationRepository, IBankAccountRepository,
    IBankCardRepository, IBankInstitutionRepository,
} from "@/domain/repositories/bank";
import { parseBankNumber, type NumberFingerprint } from "@/lib/bank-number-fingerprint";
import {
    resolveFingerprint, mergeFingerprints, type IdentityCandidate,
} from "@/lib/bank-number-match";

/** Un grupo de observaciones sin resolver, tal como lo ve la conciliación. */
export interface PendingGroup {
    prefixDigits: string;
    suffixDigits: string;
    occurrences: number;
    /** Las cadenas crudas del grupo, como evidencia para el usuario. */
    samples: string[];
    observationIds: UUID[];
    /** Identidades compatibles. Con más de una, el grupo es ambiguo. */
    candidateIds: UUID[];
    institutionHint: string | null;
    brand: string | null;
    accountTypeHint: string | null;
    /** La identidad a la que ya apunta el grupo, si alguna. */
    accountId: UUID | null;
    cardId: UUID | null;
}

/**
 * Lo que le falta a una identidad para poder confirmarse.
 *
 * Son las tres reglas que la base relaja mientras algo está sin revisar y
 * vuelve a exigir en cuanto se confirma. Están enumeradas, no adivinadas: son
 * los únicos CHECK de las migraciones con un `OR is_unconfirmed`.
 */
export type ConfirmBlocker =
    /** Cuenta o tarjeta sin emisor. El efectivo queda fuera: nunca tiene. */
    | "ISSUER"
    /** Tarjeta de débito sin la cuenta de la que gasta. */
    | "DEBIT_ACCOUNT";

export interface BlockedAccount {
    account: BankAccount;
    reason: ConfirmBlocker;
}

export interface BlockedCard {
    card: BankCard;
    reason: ConfirmBlocker;
}

/** Lo que la confirmación va a apartar, y por qué. */
export interface ConfirmBlockers {
    accounts: BlockedAccount[];
    cards: BlockedCard[];
}

export interface ConfirmResult {
    confirmed: number;
    /** Apartadas por incompletas. Sin esto el usuario no sabría que faltan. */
    skipped: number;
}

/**
 * Qué le impide a una cuenta confirmarse, o null si nada.
 *
 * El efectivo es la excepción escrita en la propia tabla: no cuelga de ningún
 * banco y aun así se confirma.
 */
function blockerForAccount(account: BankAccount): ConfirmBlocker | null {
    if (account.accountType === "CASH") return null;
    return account.institutionId ? null : "ISSUER";
}

/**
 * Lo mismo para una tarjeta. El emisor va primero: sin él no se puede ni
 * elegir la cuenta, que tiene que ser del mismo banco.
 */
function blockerForCard(card: BankCard): ConfirmBlocker | null {
    if (!card.institutionId) return "ISSUER";
    if (card.cardType === "DEBIT" && !card.accountId) return "DEBIT_ACCOUNT";
    return null;
}

/** Las decisiones del usuario; nunca las pisa una re-resolución automática. */
const USER_DECIDED = ["MANUAL", "EXTERNAL"] as const;

function stamps() {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, isDeleted: false };
}

/**
 * Decide a qué cuenta o tarjeta pertenece un número enmascarado, y recuerda
 * cada forma en que lo ha visto escrito.
 *
 * El aprendizaje está en `observe`: la primera vez que aparece una máscara se
 * resuelve —sola o, si es ambigua, en conciliación— y a partir de ahí el
 * emparejamiento de esa cadena exacta es una lectura directa.
 */
export class BankIdentificationService {
    constructor(
        private readonly observations: IBankNumberObservationRepository,
        private readonly accounts: IBankAccountRepository,
        private readonly cards: IBankCardRepository,
        private readonly institutions: IBankInstitutionRepository,
    ) {}

    /**
     * Registra una cadena vista y la liga a su identidad si puede.
     *
     * Si el `raw` exacto ya se vio, solo incrementa el contador y conserva el
     * vínculo: cada máscara se aprende una sola vez.
     */
    async observe(userId: UUID, raw: string): Promise<BankNumberObservation> {
        const existing = await this.observations.findByRaw(userId, raw);
        if (existing) {
            return this.observations.update({
                ...existing,
                occurrences: existing.occurrences + 1,
                updatedAt: new Date().toISOString(),
            });
        }

        const fingerprint = parseBankNumber(raw);
        const resolved = resolveFingerprint(fingerprint, await this.identityCandidates(userId));

        return this.observations.create({
            id: randomUUID(),
            ownerUserId: userId,
            raw,
            prefixDigits: fingerprint.prefixDigits,
            suffixDigits: fingerprint.suffixDigits,
            totalLength: fingerprint.totalLength,
            bin: fingerprint.bin,
            brand: fingerprint.brand,
            accountTypeHint: fingerprint.accountTypeHint,
            institutionHint: fingerprint.institutionHint,
            isComplete: fingerprint.isComplete,
            accountId: resolved.targetKind === "ACCOUNT" ? resolved.targetId : null,
            cardId: resolved.targetKind === "CARD" ? resolved.targetId : null,
            resolution: resolved.resolution,
            occurrences: 1,
            ...stamps(),
        });
    }

    /**
     * Vuelve a resolver una observación ya registrada contra las identidades
     * que existen ahora. Lo que el usuario decidió a mano se respeta.
     */
    async reobserve(userId: UUID, raw: string): Promise<BankNumberObservation> {
        const observation = await this.observations.findByRaw(userId, raw);
        if (!observation) return this.observe(userId, raw);
        if ((USER_DECIDED as readonly string[]).includes(observation.resolution)) {
            return observation;
        }

        return this.applyResolution(observation, await this.identityCandidates(userId));
    }

    /**
     * Re-parsea y re-resuelve todo el historial del usuario. La usa el backfill,
     * que deja las observaciones con solo `raw` y `occurrences`.
     *
     * Idempotente: correrla dos veces da el mismo resultado, y no toca las que
     * el usuario ya decidió.
     */
    async reparseAll(userId: UUID): Promise<number> {
        const all = await this.observations.findByOwnerId(userId);
        const candidates = await this.identityCandidates(userId);
        let touched = 0;

        for (const observation of all) {
            if ((USER_DECIDED as readonly string[]).includes(observation.resolution)) continue;
            await this.applyResolution(observation, candidates);
            touched++;
        }

        return touched;
    }

    /** Una observación concreta del usuario, o `null` si no es suya. */
    async findObservation(userId: UUID, id: UUID): Promise<BankNumberObservation | null> {
        const observation = await this.observations.findById(id);
        return observation?.ownerUserId === userId ? observation : null;
    }

    /**
     * Las identidades del usuario con su huella acumulada: lo que cada cuenta o
     * tarjeta declara de sí misma en su alta, más todo lo que aportaron sus
     * observaciones ya resueltas.
     */
    async identityCandidates(userId: UUID): Promise<IdentityCandidate[]> {
        const [accounts, cards, resolved] = await Promise.all([
            this.accounts.findByOwnerId(userId),
            this.cards.findByOwnerId(userId),
            this.observations.findResolved(userId),
        ]);

        const build = (
            id: UUID, kind: "ACCOUNT" | "CARD", declared: NumberFingerprint,
        ): IdentityCandidate => {
            const own = resolved
                .filter(o => (kind === "ACCOUNT" ? o.accountId : o.cardId) === id)
                .map(o => parseBankNumber(o.raw));
            return { id, kind, fingerprint: mergeFingerprints([declared, ...own]) };
        };

        return [
            ...accounts.map(a => build(a.id, "ACCOUNT", declaredFingerprint(a))),
            ...cards.map(c => build(c.id, "CARD", declaredFingerprint(c))),
        ];
    }

    /** Los grupos sin resolver, de más a menos frecuentes. */
    async pendingGroups(userId: UUID): Promise<PendingGroup[]> {
        return this.groupsByResolution(userId, "PENDING");
    }

    /**
     * Los grupos de una resolución concreta. La conciliación los pide para las
     * tres secciones: lo resuelto exacto, lo inferido y lo pendiente.
     */
    async groupsByResolution(
        userId: UUID, resolution: BankNumberResolution,
    ): Promise<PendingGroup[]> {
        const [matching, candidates] = await Promise.all([
            this.observations.findByResolution(userId, resolution),
            this.identityCandidates(userId),
        ]);

        const byKey = new Map<string, PendingGroup>();

        for (const observation of matching) {
            // Prefijo y sufijo juntos: es lo que el usuario reconoce de un vistazo.
            const key = `${observation.prefixDigits}|${observation.suffixDigits}`;
            const group = byKey.get(key) ?? {
                suffixDigits: observation.suffixDigits,
                prefixDigits: observation.prefixDigits,
                occurrences: 0, samples: [], observationIds: [], candidateIds: [],
                institutionHint: null, brand: null, accountTypeHint: null,
                accountId: observation.accountId ?? null,
                cardId: observation.cardId ?? null,
            };

            group.occurrences += observation.occurrences;
            group.samples.push(observation.raw);
            group.observationIds.push(observation.id);
            group.institutionHint ??= observation.institutionHint ?? null;
            group.brand ??= observation.brand ?? null;
            group.accountTypeHint ??= observation.accountTypeHint ?? null;

            const compatible = resolveFingerprint(parseBankNumber(observation.raw), candidates);
            for (const id of compatible.candidateIds) {
                if (!group.candidateIds.includes(id)) group.candidateIds.push(id);
            }

            byKey.set(key, group);
        }

        return [...byKey.values()].sort((a, b) => b.occurrences - a.occurrences);
    }

    /** El usuario dice a qué identidad pertenece. Gana sobre cualquier inferencia. */
    async assignObservation(
        userId: UUID, observationId: UUID,
        target: { kind: "ACCOUNT" | "CARD"; targetId: UUID },
    ): Promise<BankNumberObservation> {
        const observation = await this.requireObservation(userId, observationId);
        return this.observations.update({
            ...observation,
            accountId: target.kind === "ACCOUNT" ? target.targetId : null,
            cardId: target.kind === "CARD" ? target.targetId : null,
            resolution: "MANUAL",
            updatedAt: new Date().toISOString(),
        });
    }

    /**
     * La cuenta es de un tercero. Se conserva la observación —el detalle de la
     * transacción muestra a dónde fue el dinero— pero no le corresponde una
     * identidad, así que no suma a ningún saldo.
     */
    /**
     * Devuelve una observación a «sin decidir», para que pueda volver a
     * identificarse o fundar una cuenta.
     *
     * `EXTERNAL` es una decisión, no un hecho, y el usuario cambia de opinión:
     * un destino que se marcó de un tercero —a veces solo porque nadie preguntó—
     * tiene que poder pasar a ser suyo. Sin esta vuelta atrás, declararlo propio
     * no hacía nada y el número desaparecía del movimiento.
     */
    async reopen(userId: UUID, observationId: UUID): Promise<BankNumberObservation> {
        const observation = await this.requireObservation(userId, observationId);
        if (observation.resolution === "PENDING") return observation;

        return this.observations.update({
            ...observation,
            accountId: null, cardId: null,
            resolution: "PENDING",
            updatedAt: new Date().toISOString(),
        });
    }

    /**
     * Declara que el número es de otra persona.
     *
     * La observación se desliga y se queda: sigue colgada del movimiento, que es
     * donde tiene sentido saber a qué cuenta le transferiste. Lo que no puede
     * quedarse es la identidad que se hubiera fundado suponiendo que era tuya
     * —el escaneo la crea cuando el número sale como origen de un gasto—, porque
     * ahí seguiría en Bancos y en la conciliación como si fuera del usuario.
     */
    async markExternal(userId: UUID, observationId: UUID): Promise<BankNumberObservation> {
        const observation = await this.requireObservation(userId, observationId);

        const updated = await this.observations.update({
            ...observation,
            accountId: null, cardId: null,
            resolution: "EXTERNAL",
            updatedAt: new Date().toISOString(),
        });

        await this.archiveIfOrphanGuess(
            userId, observation.accountId ?? null, observation.cardId ?? null,
        );
        return updated;
    }

    /**
     * Archiva la identidad que solo existía por la suposición que el usuario
     * acaba de desmentir.
     *
     * Con dos guardas, porque archivar es destructivo: solo lo que nació de un
     * escaneo y nadie ha revisado —una que el usuario dio de alta a mano es
     * suya aunque este número no lo sea—, y solo si ninguna otra observación
     * sigue apuntándola.
     */
    private async archiveIfOrphanGuess(
        userId: UUID, accountId: UUID | null, cardId: UUID | null,
    ): Promise<void> {
        const stillReferenced = async (predicate: (o: BankNumberObservation) => boolean) =>
            (await this.observations.findByOwnerId(userId)).some(predicate);

        if (accountId) {
            const account = await this.accounts.findById(accountId);
            if (account?.ownerUserId === userId && account.isUnconfirmed
                && !(await stillReferenced(o => o.accountId === accountId))) {
                await this.accounts.delete(accountId);
            }
        }

        if (cardId) {
            const card = await this.cards.findById(cardId);
            if (card?.ownerUserId === userId && card.isUnconfirmed
                && !(await stillReferenced(o => o.cardId === cardId))) {
                await this.cards.delete(cardId);
            }
        }
    }

    /**
     * Mueve a una tarjeta las observaciones que identificaban a una cuenta.
     *
     * Va con la conversión: sin esto el número se quedaría apuntando a una
     * cuenta archivada y volvería a la conciliación como si nadie lo hubiera
     * decidido nunca.
     */
    async relinkAccountToCard(userId: UUID, fromAccountId: UUID, toCardId: UUID): Promise<number> {
        const own = await this.observations.findByOwnerId(userId);
        const affected = own.filter(o => o.accountId === fromAccountId);

        for (const observation of affected) {
            await this.observations.update({
                ...observation,
                accountId: null,
                cardId: toCardId,
                updatedAt: new Date().toISOString(),
            });
        }
        return affected.length;
    }

    /**
     * Liga todas las observaciones de un grupo a la misma identidad de una vez.
     * Es lo que hace el botón de conciliación cuando el usuario nombra un grupo.
     */
    async assignGroup(
        userId: UUID, observationIds: readonly UUID[],
        target: { kind: "ACCOUNT" | "CARD"; targetId: UUID },
    ): Promise<number> {
        for (const id of observationIds) {
            await this.assignObservation(userId, id, target);
        }
        return observationIds.length;
    }

    /**
     * Quita `isUnconfirmed` de las identidades que ya tienen al menos una
     * observación resuelta. Hasta ese momento no suman a ningún saldo; después
     * de confirmarlas, sí.
     */
    async confirmResolvedIdentities(userId: UUID): Promise<ConfirmResult> {
        const { ready, blocked } = await this.splitConfirmable(userId);
        let confirmed = 0;

        for (const account of ready.accounts) {
            await this.accounts.update({ ...account, isUnconfirmed: false });
            confirmed++;
        }
        for (const card of ready.cards) {
            await this.cards.update({ ...card, isUnconfirmed: false });
            confirmed++;
        }

        return { confirmed, skipped: blocked.accounts.length + blocked.cards.length };
    }

    /**
     * Las identidades que la confirmación dejaría fuera, con lo que les falta.
     *
     * La pantalla las pide antes de confirmar. Se calcula con el mismo reparto
     * que usa {@link confirmResolvedIdentities}, para que lo que avisa y lo que
     * hace no puedan discrepar.
     */
    async identitiesBlockedFromConfirming(userId: UUID): Promise<ConfirmBlockers> {
        return (await this.splitConfirmable(userId)).blocked;
    }

    /**
     * Reparte lo confirmable de lo que no lo es.
     *
     * Confirmar no es solo poner una bandera: es prometerle a la base que la
     * fila cumple lo que solo se le exige a una identidad revisada. Sin ese
     * reparto, la primera incompleta lanzaba y —como el bucle guarda una por
     * una— las anteriores ya estaban escritas: la conciliación quedaba a medias
     * sin decir por qué.
     */
    private async splitConfirmable(
        userId: UUID,
    ): Promise<{ ready: { accounts: BankAccount[]; cards: BankCard[] }; blocked: ConfirmBlockers }> {
        const resolved = await this.observations.findResolved(userId);
        const accountIds = new Set(resolved.map(o => o.accountId).filter(Boolean) as UUID[]);
        const cardIds = new Set(resolved.map(o => o.cardId).filter(Boolean) as UUID[]);

        const ready: { accounts: BankAccount[]; cards: BankCard[] } = { accounts: [], cards: [] };
        const blocked: ConfirmBlockers = { accounts: [], cards: [] };

        for (const id of accountIds) {
            const account = await this.accounts.findById(id);
            if (!account?.isUnconfirmed) continue;

            const reason = blockerForAccount(account);
            if (reason) blocked.accounts.push({ account, reason });
            else ready.accounts.push(account);
        }
        for (const id of cardIds) {
            const card = await this.cards.findById(id);
            if (!card?.isUnconfirmed) continue;

            const reason = blockerForCard(card);
            if (reason) blocked.cards.push({ card, reason });
            else ready.cards.push(card);
        }

        return { ready, blocked };
    }

    // ─── Privados ────────────────────────────────────────────

    /** Re-parsea la cadena cruda y persiste el resultado de resolverla. */
    private async applyResolution(
        observation: BankNumberObservation, candidates: readonly IdentityCandidate[],
    ): Promise<BankNumberObservation> {
        const fingerprint = parseBankNumber(observation.raw);
        const resolved = resolveFingerprint(fingerprint, candidates);

        return this.observations.update({
            ...observation,
            prefixDigits: fingerprint.prefixDigits,
            suffixDigits: fingerprint.suffixDigits,
            totalLength: fingerprint.totalLength,
            bin: fingerprint.bin,
            brand: fingerprint.brand,
            accountTypeHint: fingerprint.accountTypeHint,
            institutionHint: fingerprint.institutionHint,
            isComplete: fingerprint.isComplete,
            accountId: resolved.targetKind === "ACCOUNT" ? resolved.targetId : null,
            cardId: resolved.targetKind === "CARD" ? resolved.targetId : null,
            resolution: resolved.resolution,
            updatedAt: new Date().toISOString(),
        });
    }

    private async requireObservation(userId: UUID, id: UUID): Promise<BankNumberObservation> {
        const found = await this.observations.findById(id);
        if (!found || found.ownerUserId !== userId) throw new Error("Observación no encontrada");
        return found;
    }
}

/** Lo que la identidad declara de sí misma en su alta. */
function declaredFingerprint(entity: BankAccount | BankCard): NumberFingerprint {
    const bin = "bin" in entity ? entity.bin ?? null : null;
    const brand = "brand" in entity ? entity.brand ?? null : null;
    return {
        raw: "",
        prefixDigits: entity.prefixDigits ?? bin ?? "",
        suffixDigits: entity.lastFour ?? "",
        totalLength: 0,
        bin,
        brand,
        accountTypeHint: null,
        institutionHint: null,
        isComplete: false,
    };
}
