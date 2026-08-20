import { randomUUID } from "crypto";
import type { UUID } from "@/domain/core";
import type {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement,
    BankNumberObservation,
} from "@/domain/entities/bank";
import type {
    FinancialTransaction, FinancialScannerTransaction,
} from "@/domain/entities/financial";
import type {
    IBankInstitutionRepository, IBankAccountRepository, IBankCardRepository,
    IBankAccountBalanceSnapshotRepository, IBankCardStatementRepository,
    IBankMovementRepository,
} from "@/domain/repositories/bank";
import type {
    IFinancialTransactionRepository, IFinancialScannerTransactionRepository,
} from "@/domain/repositories/financial";
import {
    computeAccountBalance, computeCardDebt, computeAvailableCredit,
    computeStatementDue, runningBalances, statementPeriodFor,
} from "@/domain/services/bank-balance";
import { ISSUER_NAME, inferInstitutionKind } from "@/lib/bank-institution-kind";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { resolveFingerprint, type Resolution } from "@/lib/bank-number-match";
import { formatBankNumber } from "@/lib/format-bank-number";
import { cardLabel, identityAcronym, identityTypeLabel } from "@/lib/bank-identity-label";
import { BankIdentificationService } from "./bank-identification-service";

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function stamps() {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, isDeleted: false };
}

/**
 * Pone el nombre del emisor sobre la cuenta o la tarjeta.
 *
 * `institutionName` no persiste —la tabla solo guarda el id— así que sin este
 * paso la identidad llega al cliente sabiendo de qué banco es sin poder
 * decirlo, y todo lo que lo muestra cae al texto de reserva en silencio.
 *
 * Se deja sin poner cuando no hay emisor: el efectivo no cuelga de ninguno, y
 * una cuenta que detectó un escaneo todavía puede no tenerlo. Quien la muestre
 * decide qué decir en ese hueco.
 */
function namedByInstitution<T extends { institutionId?: UUID | null }>(
    entity: T, institutions: readonly BankInstitution[],
): T {
    const name = institutions.find(i => i.id === entity.institutionId)?.name;
    return name ? { ...entity, institutionName: name } : entity;
}

export interface BankAccountWithBalance extends BankAccount {
    balance: number;
    lastSnapshotAt?: string | null;
}

export interface BankCardWithDebt extends BankCard {
    debt: number;
    availableCredit: number | null;
    openStatement?: BankCardStatement | null;
}

export interface BankOverview {
    institutions: BankInstitution[];
    accounts: BankAccountWithBalance[];
    cards: BankCardWithDebt[];
    /** Cuentas bancarias confirmadas y activas. El efectivo va aparte. */
    totalAvailable: number;
    totalDebt: number;
    totalAvailableCredit: number;
    cashBalance: number;
    nextDueDate: string | null;
    unconfirmedCount: number;
}

export interface BankAccountDetail {
    account: BankAccountWithBalance;
    snapshots: BankAccountBalanceSnapshot[];
    movements: BankMovement[];
    /** Paralelo a `movements`: el saldo que quedó tras cada uno. */
    running: number[];
}

export interface BankCardDetail {
    card: BankCardWithDebt;
    statements: BankCardStatement[];
    movements: BankMovement[];
    periodMovements: BankMovement[];
    /** Cuentas desde las que se puede pagar el estado. */
    payableAccounts: BankAccountWithBalance[];
}

export interface CreateInstitutionInput {
    name: string;
    kind?: BankInstitution["kind"];
    shortName?: string | null;
    logoUrl?: string | null;
    color?: string | null;
    country?: string | null;
    financialInstitutionId?: UUID | null;
}

export interface CreateAccountInput {
    institutionId?: UUID | null;
    accountType: BankAccount["accountType"];
    lastFour?: string | null;
    prefixDigits?: string | null;
    currency?: string;
    /** Detectada por un escaneo y aún sin revisar. */
    isUnconfirmed?: boolean;
}

/** Una entrada del jsonb `accounts` que produce el escáner. */
export interface ScannedAccountEntry {
    /** "origen" | "destino", tal cual lo escribe el escáner. */
    type: string;
    account: string;
}

/**
 * De quién es una cuenta del escaneo, cuando el usuario lo dice.
 *
 * Sin su palabra el sistema supone por el lado —lo que sale es tuyo, lo que
 * entra es de otro—, y esa suposición falla en cuanto transfieres entre cuentas
 * propias. `MINE` funda o ata la identidad; `EXTERNAL` la deja fuera de Bancos
 * para siempre.
 */
export type AccountOwnership = "MINE" | "EXTERNAL";

/**
 * Lo que el usuario corrigió sobre una cuenta del escaneo, antes de confirmar.
 *
 * El escáner solo da una cadena enmascarada; todo lo demás —si es cuenta o
 * tarjeta, de qué tipo, de qué banco, y hasta los dígitos si vinieron mal— lo
 * sabe el usuario y hasta ahora no tenía dónde decirlo. Lo que declara aquí
 * gana sobre cualquier inferencia y se guarda junto con la transacción.
 */
export interface ScannedAccountDecision {
    ownership: AccountOwnership;
    /** Cuenta o tarjeta. Sin decirlo, lo deduce el número. */
    kind?: "ACCOUNT" | "CARD" | null;
    accountType?: BankAccount["accountType"] | null;
    cardType?: BankCard["cardType"] | null;
    /** Emisor ya existente. */
    institutionId?: UUID | null;
    /** Emisor a crear, cuando el usuario escribe uno que no tiene. */
    institutionName?: string | null;
    institutionKind?: BankInstitution["kind"] | null;
    /** El número corregido, tal como el usuario lo escriba. */
    number?: string | null;
}

/** Qué dijo el usuario de cada número, indexado por la cadena cruda. */
export type OwnershipByRaw = Record<string, ScannedAccountDecision>;

export interface ScannedTransactionInput {
    accounts: ScannedAccountEntry[];
    merchant?: string | null;
    currency?: string | null;
    /** Única señal fiable de que el número con BIN es una tarjeta de crédito. */
    paidWithCredit?: boolean | null;
    /** Lo que el usuario declaró sobre cada cuenta del escaneo. */
    ownership?: OwnershipByRaw | null;
    /**
     * Tipo declarado por el usuario para el emisor, cuando lo dijo. Gana sobre
     * cualquier inferencia desde el nombre.
     */
    institutionKind?: BankInstitution["kind"] | null;
}

/** Lo que una escritura de transacción le da al módulo Bancos. */
export interface TransactionBankSyncInput {
    merchant?: string | null;
    currency?: string | null;
    paidWithCredit?: boolean | null;
    /** Tipo de emisor declarado por el usuario. Gana sobre la inferencia. */
    institutionKind?: BankInstitution["kind"] | null;
    /** Lo que el usuario eligió a mano. Nunca se pisa. */
    bankSourceAccountId?: UUID | null;
    bankDestinationAccountId?: UUID | null;
    bankCardId?: UUID | null;
    bankInstitutionId?: UUID | null;
    /** Números enmascarados. Solo llegan desde un escaneo. */
    scannedAccounts?: ScannedAccountEntry[] | null;
    /** De quién es cada uno, cuando el usuario lo declaró. */
    ownership?: OwnershipByRaw | null;
}

export interface ResolvedBankLinks {
    bankSourceAccountId: UUID | null;
    bankDestinationAccountId: UUID | null;
    bankCardId: UUID | null;
    bankInstitutionId: UUID | null;
    /** La cuenta del otro lado cuando no es del usuario. */
    bankCounterpartyObservationId: UUID | null;
}

/**
 * Si la entrada es el lado del que sale el dinero.
 *
 * El escáner escribe «origen» / «destino» en español y sin acentuar de forma
 * fiable, así que basta el prefijo. Todo lo que no sea origen es destino.
 */
function isOriginEntry(entry: ScannedAccountEntry): boolean {
    return entry.type?.toLowerCase().startsWith("orig") ?? false;
}

/**
 * La red de la tarjeta según el primer dígito de su BIN.
 *
 * No es una adivinanza: el primer dígito es el «major industry identifier» y
 * las redes tienen el suyo asignado. Solo se usa para ponerle nombre a una
 * tarjeta recién detectada cuyo texto no nombró la marca — el emparejamiento
 * sigue mirando únicamente lo que el banco escribió.
 */
function brandFromBin(bin: string | null): string | null {
    if (!bin) return null;
    if (bin.startsWith("4")) return "Visa";
    if (/^5[1-5]/.test(bin)) return "Mastercard";
    if (/^3[47]/.test(bin)) return "American Express";
    if (/^3(0[0-5]|[68])/.test(bin)) return "Diners Club";
    return null;
}

/** Un lado del movimiento, tal como se le muestra al usuario. */
export interface ScannedAccountView {
    role: "SOURCE" | "DESTINATION";
    /** La cadena tal cual la escribió el banco. Es la evidencia. */
    raw: string;
    /** El mismo número al estándar de la app: `••••` cuenta, `XXXX` tarjeta. */
    display: string;
    kind: "ACCOUNT" | "CARD";
    /** Qué tan segura es la lectura. `PENDING` = no se pudo atribuir. */
    resolution: Resolution;
    /** La cuenta o tarjeta del usuario, cuando el número corresponde a una. */
    match: {
        id: UUID;
        /**
         * «Ahorros», «Visa»… Lo que la identidad es, sin repetir el número que
         * la fila ya muestra al lado. No hay ningún nombre guardado.
         */
        typeLabel: string;
        /** El mismo tipo en tres letras: «AHO», «TCR». Lo que se lee primero. */
        typeAcronym: string;
        institutionName: string | null;
    } | null;
    /** El emisor que el propio texto nombra, cuando no hay identidad que consultar. */
    institutionHint: string | null;
    /** Lo que el usuario declaró sobre esta cuenta. `null` = no lo ha dicho. */
    ownership: AccountOwnership | null;
    /** Su corrección completa, para repintar el formulario tal como la dejó. */
    decision: ScannedAccountDecision | null;
}

/** Sufijo mínimo para fundar una identidad sin preguntar. */
const AUTOCREATE_MIN_SUFFIX = 4;

export interface CreateCardInput {
    institutionId?: UUID | null;
    accountId?: UUID | null;
    cardType: BankCard["cardType"];
    brand?: string | null;
    bin?: string | null;
    lastFour?: string | null;
    prefixDigits?: string | null;
    currency?: string;
    creditLimit?: number | null;
    statementDay?: number | null;
    dueDay?: number | null;
    /** Detectada por un escaneo y aún sin revisar. */
    isUnconfirmed?: boolean;
}

export class BankService {
    constructor(
        private readonly institutions: IBankInstitutionRepository,
        private readonly accounts: IBankAccountRepository,
        private readonly cards: IBankCardRepository,
        private readonly snapshots: IBankAccountBalanceSnapshotRepository,
        private readonly statements: IBankCardStatementRepository,
        private readonly movements: IBankMovementRepository,
        private readonly transactions: IFinancialTransactionRepository,
        private readonly identification: BankIdentificationService,
        /** Opcional: sin él, `relinkHistory` no tiene de dónde leer los escaneos. */
        private readonly scannerTransactions?: IFinancialScannerTransactionRepository,
    ) {}

    // ─── Sincronización desde la transacción ─────────────────

    /**
     * El punto único por el que pasa toda escritura de transacción — captura
     * manual, confirmación de escaneo y edición — para mantener el módulo
     * Bancos al día.
     *
     * Solo sincroniza **identidades y vínculos**. Los saldos y los movimientos
     * no se tocan nunca porque no se guardan: la vista `bank_movements` se
     * deriva de las transacciones y el saldo se calcula al leer, así que editar
     * o borrar una transacción los corrige sola.
     *
     * Dos reglas gobiernan el resultado:
     *
     *  - **Lo que el usuario eligió gana.** Si vino con cuenta o tarjeta, esta
     *    función no la pisa: él vio el movimiento, la heurística solo vio una
     *    cadena enmascarada.
     *  - **Solo un escaneo funda cuentas.** Sin números enmascarados no hay de
     *    dónde deducir una cuenta, así que una edición a lo sumo crea el emisor.
     *    Fundar cuentas al editar es la vía rápida a llenar el módulo de basura.
     */
    async syncTransactionBankLinks(
        userId: UUID, input: TransactionBankSyncInput,
    ): Promise<ResolvedBankLinks> {
        const chosen: ResolvedBankLinks = {
            bankSourceAccountId: input.bankSourceAccountId ?? null,
            bankDestinationAccountId: input.bankDestinationAccountId ?? null,
            bankCardId: input.bankCardId ?? null,
            bankInstitutionId: input.bankInstitutionId ?? null,
            bankCounterpartyObservationId: null,
        };

        const scan: ScannedTransactionInput = {
            accounts: input.scannedAccounts ?? [],
            merchant: input.merchant ?? null,
            currency: input.currency ?? "USD",
            paidWithCredit: input.paidWithCredit ?? false,
            institutionKind: input.institutionKind ?? null,
            ownership: input.ownership ?? null,
        };

        // Sin números que identificar, lo único que puede nacer es el emisor.
        if (scan.accounts.length === 0) {
            return {
                ...chosen,
                bankInstitutionId: chosen.bankInstitutionId
                    ?? await this.resolveInstitution(userId, scan),
            };
        }

        const resolved = await this.resolveScannedAccounts(userId, scan);

        return {
            bankSourceAccountId: chosen.bankSourceAccountId ?? resolved.bankSourceAccountId,
            bankDestinationAccountId: chosen.bankDestinationAccountId ?? resolved.bankDestinationAccountId,
            bankCardId: chosen.bankCardId ?? resolved.bankCardId,
            bankInstitutionId: chosen.bankInstitutionId ?? resolved.bankInstitutionId,
            bankCounterpartyObservationId: resolved.bankCounterpartyObservationId,
        };
    }

    // ─── Identificación desde un escaneo ─────────────────────

    /**
     * Resuelve a qué cuenta o tarjeta pertenece cada número de un escaneo,
     * creando las identidades que falten.
     *
     * La regla de propiedad manda: una cuenta se vuelve identidad propia solo
     * si aparece como **origen**, porque solo se puede enviar dinero desde una
     * cuenta propia. Las que solo salen como destino son de un tercero y quedan
     * como observación `EXTERNAL`, referenciada desde la transacción para que
     * el detalle pueda mostrar a dónde fue el dinero.
     */
    /**
     * Las cuentas de un escaneo, listas para mostrar. **No escribe nada.**
     *
     * Corre antes de confirmar, así que no puede dejar rastro: ni observaciones,
     * ni cuentas fundadas, ni saldos tocados. Solo lee las identidades que el
     * usuario ya tiene y contesta qué dice cada número.
     *
     * Lo que muestra de cada lado es el número del escaneo llevado al estándar
     * de la app, no el de la cuenta registrada: la sección responde «qué trajo
     * el banco», y el vínculo con la cuenta se enseña al lado.
     */
    async previewScannedAccounts(
        userId: UUID, entries: readonly ScannedAccountEntry[],
        ownership?: OwnershipByRaw | null,
    ): Promise<ScannedAccountView[]> {
        const usable = entries.filter(e => e.account?.trim());
        if (usable.length === 0) return [];

        const [candidates, accounts, cards, institutions] = await Promise.all([
            this.identification.identityCandidates(userId),
            this.accounts.findByOwnerId(userId),
            this.cards.findByOwnerId(userId),
            this.institutions.findByOwnerId(userId),
        ]);

        const institutionName = (id: UUID | null | undefined) =>
            institutions.find(i => i.id === id)?.name ?? null;

        return usable.map(entry => {
            const raw = entry.account.trim();
            const fingerprint = parseBankNumber(raw);
            const { resolution, targetId, targetKind } = resolveFingerprint(fingerprint, candidates);

            const account = targetKind === "ACCOUNT" ? accounts.find(a => a.id === targetId) : undefined;
            const card = targetKind === "CARD" ? cards.find(c => c.id === targetId) : undefined;

            // Sin identidad que lo diga, el BIN y la marca son lo único que
            // distingue una tarjeta de una cuenta. Un número sin ninguna de las
            // dos señales se muestra como cuenta: es el glifo neutro, y afirmar
            // «tarjeta» sin evidencia sería inventar.
            const kind: "ACCOUNT" | "CARD" = card
                ? "CARD"
                : account
                    ? "ACCOUNT"
                    : (fingerprint.bin || fingerprint.brand) ? "CARD" : "ACCOUNT";

            const matched = account ?? card;

            return {
                role: isOriginEntry(entry) ? "SOURCE" : "DESTINATION",
                raw,
                display: formatBankNumber(
                    { prefixDigits: fingerprint.prefixDigits, lastFour: fingerprint.suffixDigits },
                ) || raw,
                kind,
                resolution,
                match: matched
                    ? {
                        id: matched.id,
                        typeLabel: identityTypeLabel(matched, kind),
                        typeAcronym: identityAcronym(matched, kind),
                        institutionName: institutionName(matched.institutionId),
                    }
                    : null,
                institutionHint: fingerprint.institutionHint,
                ownership: ownership?.[raw]?.ownership ?? null,
                decision: ownership?.[raw] ?? null,
            };
        });
    }

    /**
     * Las cuentas de una transacción ya confirmada, con la misma forma que las
     * del escaneo para que se muestren en el mismo sitio y con el mismo panel.
     *
     * Salen de los vínculos, que son la verdad una vez confirmado: la cadena
     * del banco solo se conserva para la contraparte, que no tiene otra forma
     * de nombrarse. Por eso las filas propias no llevan evidencia — no hay una
     * lectura que juzgar, hay una cuenta elegida.
     */
    async transactionAccounts(
        userId: UUID, links: Partial<ResolvedBankLinks>,
    ): Promise<ScannedAccountView[]> {
        const views: ScannedAccountView[] = [];

        const institutions = await this.institutions.findByOwnerId(userId);
        const institutionName = (id: UUID | null | undefined) =>
            institutions.find(i => i.id === id)?.name ?? null;

        const own = async (
            id: UUID, kind: "ACCOUNT" | "CARD", role: ScannedAccountView["role"],
        ): Promise<ScannedAccountView | null> => {
            const entity = kind === "ACCOUNT"
                ? await this.accounts.findById(id)
                : await this.cards.findById(id);
            if (!entity || entity.ownerUserId !== userId) return null;

            return {
                role,
                raw: "",
                display: formatBankNumber(entity),
                kind,
                resolution: "EXACT",
                match: {
                    id: entity.id,
                    typeLabel: identityTypeLabel(entity, kind),
                    typeAcronym: identityAcronym(entity, kind),
                    institutionName: institutionName(entity.institutionId),
                },
                institutionHint: null,
                ownership: "MINE",
                decision: null,
            };
        };

        // La tarjeta describe el origen mejor que la cuenta de la que descuenta:
        // el usuario pagó con la tarjeta, y su cuenta ya sale nombrada dentro.
        if (links.bankCardId) {
            const view = await own(links.bankCardId, "CARD", "SOURCE");
            if (view) views.push(view);
        } else if (links.bankSourceAccountId) {
            const view = await own(links.bankSourceAccountId, "ACCOUNT", "SOURCE");
            if (view) views.push(view);
        }

        if (links.bankDestinationAccountId) {
            const view = await own(links.bankDestinationAccountId, "ACCOUNT", "DESTINATION");
            if (view) views.push(view);
        } else if (links.bankCounterpartyObservationId) {
            const observation = await this.identification.findObservation(
                userId, links.bankCounterpartyObservationId,
            );
            if (observation) {
                const fingerprint = parseBankNumber(observation.raw);
                const kind = (fingerprint.bin || fingerprint.brand) ? "CARD" as const : "ACCOUNT" as const;
                views.push({
                    role: "DESTINATION",
                    raw: observation.raw,
                    display: formatBankNumber(
                        { prefixDigits: fingerprint.prefixDigits, lastFour: fingerprint.suffixDigits },
                    ) || observation.raw,
                    kind,
                    resolution: "PENDING",
                    match: null,
                    institutionHint: fingerprint.institutionHint,
                    ownership: "EXTERNAL",
                    decision: null,
                });
            }
        }

        return views;
    }

    async resolveScannedAccounts(
        userId: UUID, scan: ScannedTransactionInput,
    ): Promise<ResolvedBankLinks> {
        const links: ResolvedBankLinks = {
            bankSourceAccountId: null, bankDestinationAccountId: null,
            bankCardId: null, bankInstitutionId: null,
            bankCounterpartyObservationId: null,
        };

        const institutionId = await this.resolveInstitution(userId, scan);
        links.bankInstitutionId = institutionId;

        for (const entry of scan.accounts ?? []) {
            const raw = entry.account?.trim();
            if (!raw) continue;

            let observation = await this.identification.observe(userId, raw);
            const isOrigin = isOriginEntry(entry);

            // De quién es la cuenta. Lo que el usuario declaró manda; a falta de
            // eso se supone por el lado, que acierta en una compra —de mi cuenta
            // al comercio— y falla en una transferencia entre cuentas propias.
            const decision = scan.ownership?.[raw] ?? null;
            const declared = decision?.ownership ?? null;
            const isMine = declared ? declared === "MINE" : isOrigin;

            // Declararla propia deshace un «de un tercero» anterior. Sin esto,
            // una cuenta marcada externa —a veces solo porque nadie preguntó—
            // no podía volver atrás: ni se creaba ni se guardaba, y el número
            // desaparecía del movimiento.
            if (declared === "MINE" && observation.resolution === "EXTERNAL") {
                observation = await this.identification.reopen(userId, observation.id);
            }

            if (isMine && await this.canAutoCreate(userId, observation)) {
                const createdId = await this.createIdentityFrom(
                    userId, observation, institutionId, scan, decision,
                );

                // Con el número corregido, la cadena original puede dejar de
                // encajar con lo que se acaba de crear. El vínculo lo fija la
                // decisión del usuario, no el emparejamiento.
                observation = decision?.number?.trim()
                    ? await this.identification.assignObservation(userId, observation.id, {
                        kind: decision.kind === "CARD" || (!decision.kind && !!(observation.bin || observation.brand))
                            ? "CARD" : "ACCOUNT",
                        targetId: createdId,
                    })
                    : await this.identification.reobserve(userId, raw);
            }

            // Decir «no es mía» sobre un número que el escaneo ya había fundado
            // como propio no hacía nada: la observación seguía ligada, así que
            // el flujo entraba por las ramas de abajo y la identidad se quedaba
            // en Bancos. La decisión del usuario tiene que poder deshacer la
            // suposición, no solo evitarla.
            if (declared === "EXTERNAL" && (observation.accountId || observation.cardId)) {
                observation = await this.identification.markExternal(userId, observation.id);
            }

            if (observation.cardId) {
                links.bankCardId = observation.cardId;
                // Una tarjeta de débito gasta de su cuenta; el crédito, de ninguna.
                const card = await this.cards.findById(observation.cardId);
                if (card?.cardType === "DEBIT" && card.accountId) {
                    links.bankSourceAccountId = card.accountId;
                }
                continue;
            }

            if (observation.accountId) {
                if (isOrigin) links.bankSourceAccountId = observation.accountId;
                else links.bankDestinationAccountId = observation.accountId;
                continue;
            }

            // Sin identidad y no es del usuario: es la cuenta del otro lado.
            // Vale para cualquier lado — quien te transfiere es tan tercero como
            // aquel a quien le transfieres.
            if (!isMine) {
                if (observation.resolution === "PENDING") {
                    observation = await this.identification.markExternal(userId, observation.id);
                }
                links.bankCounterpartyObservationId = observation.id;
            }
        }

        return links;
    }

    /**
     * Re-apunta las transacciones del historial contra las identidades ya
     * resueltas.
     *
     * El vínculo entre una transacción y su escaneo es
     * `origin_stats.originalExecutionId` más el monto: la transacción no guarda
     * el jsonb `accounts`, solo el escaneo lo tiene. Solo toca transacciones
     * que aún no tengan ninguna columna `bank_*`, para no pisar lo que el
     * usuario ya eligió a mano.
     */
    async relinkHistory(userId: UUID): Promise<number> {
        if (!this.scannerTransactions) return 0;

        const [transactions, scans] = await Promise.all([
            this.transactions.findByOwnerId(userId),
            this.scannerTransactions.findByOwnerId(userId),
        ]);

        const byExecution = new Map<string, FinancialScannerTransaction[]>();
        for (const scan of scans) {
            if (!scan.executionId) continue;
            const list = byExecution.get(scan.executionId) ?? [];
            list.push(scan);
            byExecution.set(scan.executionId, list);
        }

        let relinked = 0;

        for (const transaction of transactions) {
            const alreadyLinked = transaction.bankSourceAccountId
                || transaction.bankDestinationAccountId
                || transaction.bankCardId;
            if (alreadyLinked) continue;

            const executionId = (transaction.originStats as Record<string, unknown> | null)
                ?.originalExecutionId;
            if (typeof executionId !== "string") continue;

            const scan = (byExecution.get(executionId) ?? [])
                .find(s => Number(s.amount) === Number(transaction.amount));
            if (!scan?.accounts?.length) continue;

            const links = await this.resolveScannedAccounts(userId, {
                accounts: scan.accounts,
                merchant: transaction.merchant ?? scan.merchant ?? null,
                currency: transaction.currency,
                paidWithCredit: transaction.paidWithCredit ?? false,
            });

            const gotSomething = links.bankSourceAccountId
                || links.bankDestinationAccountId
                || links.bankCardId;
            if (!gotSomething) continue;

            await this.transactions.update({ ...transaction, ...links });
            relinked++;
        }

        return relinked;
    }

    /**
     * Si se puede fundar una identidad a partir de esta observación.
     *
     * Con BIN pero sin `paidWithCredit` no se crea nada: `493176XXXXXX2780` es
     * una Visa de **débito**, y crearla como crédito mostraría una deuda que no
     * existe — mientras que crearla como débito exige una cuenta que aquí no
     * se conoce. Sin señal, el tipo lo elige el usuario en conciliación.
     */
    /**
     * Si el número da para fundar una identidad sin preguntar.
     *
     * No exige conocer al emisor: en una compra el comercio es la tienda, no el
     * banco, así que exigirlo dejaba sin crear justo las tarjetas que más
     * aparecen. La identidad nace sin emisor y el usuario lo asigna después.
     *
     * Lo que sí se exige son dígitos suficientes, contando los del principio y
     * los del final: una cuenta de cooperativa llega como `25XXX10` —dos y dos—
     * y mirar solo el final la descartaba, aunque cuatro dígitos en posiciones
     * conocidas la distinguen igual de bien que los cuatro últimos.
     */
    private async canAutoCreate(
        userId: UUID, observation: BankNumberObservation,
    ): Promise<boolean> {
        if (observation.resolution !== "PENDING") return false;

        const known = observation.prefixDigits.length + observation.suffixDigits.length;
        if (known < AUTOCREATE_MIN_SUFFIX) return false;

        // Pendiente pero con candidatos es «podría ser una de estas», no «es
        // nueva». Fundar una tercera cuenta ahí duplicaría la que ya existe;
        // esa ambigüedad la resuelve la conciliación, no una heurística.
        const candidates = await this.identification.identityCandidates(userId);
        const { candidateIds } = resolveFingerprint(parseBankNumber(observation.raw), candidates);
        return candidateIds.length === 0;
    }

    /** Crea la cuenta o la tarjeta que la observación describe, sin confirmar. */
    private async createIdentityFrom(
        userId: UUID, observation: BankNumberObservation,
        institutionId: UUID | null, scan: ScannedTransactionInput,
        decision?: ScannedAccountDecision | null,
    ): Promise<UUID> {
        const currency = scan.currency ?? "USD";

        // Los dígitos que el usuario corrigió, si los corrigió. El escáner lee
        // lo que el banco escribió, y a veces lo escribe mal.
        const corrected = decision?.number?.trim() ? parseBankNumber(decision.number) : null;
        const common = {
            lastFour: corrected?.suffixDigits || observation.suffixDigits,
            prefixDigits: (corrected ? corrected.prefixDigits : observation.prefixDigits) || null,
            currency,
        };

        // El emisor que el usuario eligió, o el que escribió y hay que crear.
        const issuerId = decision?.institutionId
            ?? (decision?.institutionName?.trim()
                ? (await this.createInstitution(userId, {
                    name: decision.institutionName.trim(),
                    kind: decision.institutionKind ?? undefined,
                })).id
                : institutionId);

        // Tarjeta o cuenta: lo dice el usuario y, si calla, el BIN o la marca
        // que el propio texto nombra. «Mastercard-8361» no trae BIN y aun así
        // no hay duda — la misma regla que usa el panel del escaneo.
        const isCard = decision?.kind
            ? decision.kind === "CARD"
            : !!(observation.bin || observation.brand);

        if (isCard) {
            // Solo un gasto a crédito prueba que la tarjeta lo sea. Sin esa
            // señal nace como débito: es lo más frecuente y, sobre todo, es lo
            // que no inventa deuda.
            const cardType = decision?.cardType ?? (scan.paidWithCredit ? "CREDIT" : "DEBIT");
            const brand = observation.brand ?? brandFromBin(corrected?.bin ?? observation.bin ?? null);
            const card = await this.createCard(userId, {
                institutionId: issuerId,
                cardType,
                brand,
                bin: corrected?.bin ?? observation.bin,
                isUnconfirmed: true,
                ...common,
            });
            return card.id;
        }

        const accountType = decision?.accountType
            ?? (observation.accountTypeHint as BankAccount["accountType"])
            ?? "SAVINGS";
        const account = await this.createAccount(userId, {
            institutionId: issuerId,
            accountType,
            isUnconfirmed: true,
            ...common,
        });
        return account.id;
    }

    /**
     * El emisor del movimiento. Sale del merchant del escaneo; si no existe
     * todavía, se crea sin confirmar.
     */
    private async resolveInstitution(
        userId: UUID, scan: ScannedTransactionInput,
    ): Promise<UUID | null> {
        const name = scan.merchant?.trim();
        if (!name) return null;

        const existing = await this.institutions.findByName(userId, name);
        if (existing) return existing.id;

        // Solo se crea cuando el nombre suena a emisor: un escaneo de FARMASHOP
        // no debe fundar un banco llamado FARMASHOP.
        if (!ISSUER_NAME.test(name)) return null;

        const created = await this.createInstitution(userId, {
            name,
            kind: scan.institutionKind ?? inferInstitutionKind(name),
        });
        await this.institutions.update({ ...created, isUnconfirmed: true });
        return created.id;
    }

    // ─── Efectivo ────────────────────────────────────────────

    /**
     * La cuenta de efectivo del usuario, creándola si aún no existe. Es donde
     * aterriza el dinero de un retiro: baja del banco, sube aquí, el patrimonio
     * no cambia.
     */
    async ensureCashAccount(userId: UUID): Promise<BankAccount> {
        const existing = await this.accounts.findCashAccount(userId);
        if (existing) return existing;

        return this.accounts.create({
            id: randomUUID(),
            ownerUserId: userId,
            institutionId: null,
            accountType: "CASH",
            lastFour: null,
            prefixDigits: null,
            currency: "USD",
            status: "ACTIVE",
            isUnconfirmed: false,
            ...stamps(),
        });
    }

    // ─── Lecturas agregadas ──────────────────────────────────

    async getOverview(userId: UUID): Promise<BankOverview> {
        await this.closeDueStatements(userId, new Date());

        const [institutions, rawAccounts, rawCards, allMovements] = await Promise.all([
            this.institutions.findByOwnerId(userId),
            this.accounts.findByOwnerId(userId),
            this.cards.findByOwnerId(userId),
            this.movements.findAllForOwner(userId),
        ]);

        const accounts = await Promise.all(rawAccounts.map(async a =>
            namedByInstitution(await this.withBalance(a, allMovements), institutions)));
        const cards = await Promise.all(rawCards.map(async c =>
            namedByInstitution(await this.withDebt(c, allMovements), institutions)));

        const countable = accounts.filter(a => !a.isUnconfirmed && a.status === "ACTIVE");
        const countableCards = cards.filter(c => !c.isUnconfirmed && c.cardType === "CREDIT");

        const dueDates = countableCards
            .map(c => c.openStatement?.dueDate)
            .filter((d): d is string => Boolean(d))
            .sort();

        return {
            institutions,
            accounts,
            cards,
            totalAvailable: round2(countable
                .filter(a => a.accountType !== "CASH")
                .reduce((sum, a) => sum + a.balance, 0)),
            totalDebt: round2(countableCards.reduce((sum, c) => sum + c.debt, 0)),
            totalAvailableCredit: round2(countableCards
                .reduce((sum, c) => sum + (c.availableCredit ?? 0), 0)),
            cashBalance: countable.find(a => a.accountType === "CASH")?.balance ?? 0,
            nextDueDate: dueDates[0] ?? null,
            unconfirmedCount:
                accounts.filter(a => a.isUnconfirmed).length +
                cards.filter(c => c.isUnconfirmed).length,
        };
    }

    async getAccountDetail(userId: UUID, accountId: UUID): Promise<BankAccountDetail | null> {
        const account = await this.accounts.findById(accountId);
        if (!account || account.ownerUserId !== userId) return null;

        const [snapshots, movements, institutions] = await Promise.all([
            this.snapshots.findByAccountId(accountId),
            this.movements.find(userId, { accountId }),
            this.institutions.findByOwnerId(userId),
        ]);

        const withBalance = namedByInstitution(
            await this.withBalance(account, movements), institutions,
        );

        return {
            account: withBalance,
            snapshots,
            movements,
            running: runningBalances(withBalance.balance, movements),
        };
    }

    async getCardDetail(userId: UUID, cardId: UUID): Promise<BankCardDetail | null> {
        const card = await this.cards.findById(cardId);
        if (!card || card.ownerUserId !== userId) return null;

        await this.closeDueStatements(userId, new Date());

        const [statements, movements, allAccounts, allMovements, institutions] = await Promise.all([
            this.statements.findByCardId(cardId),
            this.movements.find(userId, { cardId }),
            this.accounts.findByOwnerId(userId),
            this.movements.findAllForOwner(userId),
            this.institutions.findByOwnerId(userId),
        ]);

        const withDebt = namedByInstitution(await this.withDebt(card, movements), institutions);
        const open = withDebt.openStatement;
        const periodMovements = open
            ? movements.filter(m =>
                m.date >= `${open.periodStart}T00:00:00Z` &&
                m.date <= `${open.periodEnd}T23:59:59Z`)
            : [];

        const payableAccounts = await Promise.all(
            allAccounts
                .filter(a => !a.isUnconfirmed && a.status === "ACTIVE")
                .map(async a => namedByInstitution(await this.withBalance(a, allMovements), institutions)),
        );

        return { card: withDebt, statements, movements, periodMovements, payableAccounts };
    }

    // ─── Cortes de saldo ─────────────────────────────────────

    async registerBalanceSnapshot(
        userId: UUID, accountId: UUID, balance: number, asOf: string, note?: string,
    ): Promise<BankAccountBalanceSnapshot> {
        return this.snapshots.create({
            id: randomUUID(),
            ownerUserId: userId,
            accountId,
            balance,
            asOf,
            source: "MANUAL",
            note: note ?? null,
            ...stamps(),
        });
    }

    // ─── Ciclo de facturación ────────────────────────────────

    /**
     * Cierre perezoso: al leer, cualquier estado cuyo período ya venció pasa a
     * CLOSED y se abre el período en curso. La app no tiene proceso programado,
     * así que la lectura es el disparador. Idempotente a propósito — corre en
     * cada `getOverview` y `getCardDetail`.
     */
    async closeDueStatements(userId: UUID, reference: Date): Promise<void> {
        const cards = (await this.cards.findByOwnerId(userId))
            .filter(c => c.cardType === "CREDIT" && c.statementDay && c.dueDay);

        for (const card of cards) {
            const period = statementPeriodFor(card.statementDay!, card.dueDay!, reference);

            const open = await this.statements.findOpenForCard(card.id);
            if (open && open.periodStart < period.periodStart) {
                await this.statements.update({ ...open, status: "CLOSED" });
            }

            const current = await this.statements.findByCardAndPeriodStart(card.id, period.periodStart);
            if (current) continue;

            const movements = await this.movements.find(userId, { cardId: card.id });
            const computed = movements
                .filter(m => m.direction === "CHARGE" &&
                    m.date >= `${period.periodStart}T00:00:00Z` &&
                    m.date <= `${period.periodEnd}T23:59:59Z`)
                .reduce((sum, m) => sum + m.amount, 0);

            await this.statements.create({
                id: randomUUID(),
                ownerUserId: userId,
                cardId: card.id,
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
                dueDate: period.dueDate,
                computedAmount: round2(computed),
                totalAmount: null,
                paidAmount: 0,
                status: "OPEN",
                ...stamps(),
            });
        }
    }

    /**
     * Paga un estado de cuenta. Crea una transacción de gasto **real** que sale
     * de la cuenta elegida y queda ligada al estado — es la única forma en que
     * la deuda de la tarjeta baja.
     *
     * `paidWithCredit` va en false a propósito: el pago no es un consumo
     * diferido, es dinero que sale hoy. Eso es lo que evita el doble conteo,
     * porque los consumos con la tarjeta ya se excluyeron del balance global
     * mientras estaban diferidos.
     */
    async payStatement(
        userId: UUID, statementId: UUID, sourceAccountId: UUID,
        amount: number, date: string,
    ): Promise<FinancialTransaction> {
        const statement = await this.statements.findById(statementId);
        if (!statement || statement.ownerUserId !== userId) {
            throw new Error("Estado de cuenta no encontrado");
        }
        const card = await this.cards.findById(statement.cardId);
        if (!card) throw new Error("Tarjeta no encontrada");

        const due = computeStatementDue(statement);

        const transaction = await this.transactions.create({
            id: randomUUID(),
            ownerUserId: userId,
            type: "PAYMENT",
            status: "MANUAL",
            amount,
            currency: card.currency,
            description: `Pago ${cardLabel(card)}`,
            merchant: card.institutionName ?? cardLabel(card),
            date,
            paidWithCredit: false,
            possibleDuplicate: false,
            bankSourceAccountId: sourceAccountId,
            bankCardStatementId: statementId,
            bankInstitutionId: card.institutionId,
            ...stamps(),
        } as FinancialTransaction);

        await this.statements.update({
            ...statement,
            paidAmount: round2(Number(statement.paidAmount) + amount),
            status: amount >= due ? "PAID" : statement.status,
        });

        return transaction;
    }

    /** Corrige el total de un estado con lo que declara el banco. */
    async setStatementTotal(userId: UUID, statementId: UUID, totalAmount: number): Promise<BankCardStatement> {
        const statement = await this.statements.findById(statementId);
        if (!statement || statement.ownerUserId !== userId) {
            throw new Error("Estado de cuenta no encontrado");
        }
        return this.statements.update({ ...statement, totalAmount });
    }

    // ─── CRUD ────────────────────────────────────────────────

    async createInstitution(userId: UUID, input: CreateInstitutionInput): Promise<BankInstitution> {
        return this.institutions.create({
            id: randomUUID(),
            ownerUserId: userId,
            name: input.name,
            shortName: input.shortName ?? null,
            kind: input.kind ?? "OTHER",
            logoUrl: input.logoUrl ?? null,
            color: input.color ?? null,
            country: input.country ?? "EC",
            financialInstitutionId: input.financialInstitutionId ?? null,
            isUnconfirmed: false,
            ...stamps(),
        });
    }

    async updateInstitution(userId: UUID, id: UUID, input: Partial<CreateInstitutionInput>): Promise<BankInstitution> {
        const existing = await this.requireInstitution(userId, id);
        return this.institutions.update({ ...existing, ...input, updatedAt: new Date().toISOString() });
    }

    async deleteInstitution(userId: UUID, id: UUID): Promise<void> {
        await this.requireInstitution(userId, id);
        return this.institutions.delete(id);
    }

    /**
     * Unifica varios emisores duplicados en uno.
     *
     * El caso que lo motiva: la misma cooperativa registrada tres veces —dos
     * nacidas de un escaneo que no supo emparejar el nombre—. Las cuentas y
     * tarjetas de cada origen pasan al destino y los orígenes se archivan, de
     * modo que la pantalla vuelve a tener un emisor por banco.
     *
     * Se comprueba la propiedad de todos antes de mover nada: a medio camino
     * dejaría cuentas repartidas entre un emisor vivo y otro archivado.
     */
    async mergeInstitutions(
        userId: UUID, sourceIds: UUID[], targetId: UUID,
    ): Promise<{ movedAccounts: number; movedCards: number; mergedInstitutions: number }> {
        const sources = sourceIds.filter(id => id !== targetId);
        if (sources.length === 0) {
            throw new Error("Elige al menos una institución distinta de la destino");
        }

        await this.requireInstitution(userId, targetId);
        for (const sourceId of sources) {
            await this.requireInstitution(userId, sourceId);
        }

        let movedAccounts = 0;
        let movedCards = 0;
        for (const sourceId of sources) {
            movedAccounts += await this.accounts.reassignInstitution(userId, sourceId, targetId);
            movedCards += await this.cards.reassignInstitution(userId, sourceId, targetId);
            await this.institutions.delete(sourceId);
        }

        return { movedAccounts, movedCards, mergedInstitutions: sources.length };
    }

    async createAccount(userId: UUID, input: CreateAccountInput): Promise<BankAccount> {
        return this.accounts.create({
            id: randomUUID(),
            ownerUserId: userId,
            institutionId: input.institutionId ?? null,
            accountType: input.accountType,
            lastFour: input.lastFour ?? null,
            prefixDigits: input.prefixDigits ?? null,
            currency: input.currency ?? "USD",
            status: "ACTIVE",
            isUnconfirmed: input.isUnconfirmed ?? false,
            ...stamps(),
        });
    }

    async updateAccount(userId: UUID, id: UUID, input: Partial<CreateAccountInput>): Promise<BankAccount> {
        const existing = await this.requireAccount(userId, id);
        return this.accounts.update({ ...existing, ...input, updatedAt: new Date().toISOString() });
    }

    async deleteAccount(userId: UUID, id: UUID): Promise<void> {
        await this.requireAccount(userId, id);
        return this.accounts.delete(id);
    }

    /**
     * Alta de tarjeta. `isUnconfirmed` viaja en la creación y no en un update
     * posterior: una tarjeta de débito sin cuenta solo es válida mientras está
     * sin confirmar, así que nacer confirmada y corregirse después violaría el
     * CHECK de la tabla a mitad de camino.
     */
    async createCard(userId: UUID, input: CreateCardInput): Promise<BankCard> {
        const isCredit = input.cardType === "CREDIT";
        return this.cards.create({
            id: randomUUID(),
            ownerUserId: userId,
            institutionId: input.institutionId ?? null,
            // Los mismos invariantes que los CHECK de la tabla, para fallar
            // antes de llegar a Postgres con un estado imposible.
            accountId: isCredit ? null : (input.accountId ?? null),
            cardType: input.cardType,
            brand: input.brand ?? null,
            bin: input.bin ?? null,
            lastFour: input.lastFour ?? null,
            prefixDigits: input.prefixDigits ?? null,
            currency: input.currency ?? "USD",
            creditLimit: isCredit ? (input.creditLimit ?? null) : null,
            statementDay: isCredit ? (input.statementDay ?? null) : null,
            dueDay: isCredit ? (input.dueDay ?? null) : null,
            status: "ACTIVE",
            isUnconfirmed: input.isUnconfirmed ?? false,
            ...stamps(),
        });
    }

    async updateCard(userId: UUID, id: UUID, input: Partial<CreateCardInput>): Promise<BankCard> {
        const existing = await this.requireCard(userId, id);
        return this.cards.update({ ...existing, ...input, updatedAt: new Date().toISOString() });
    }

    async deleteCard(userId: UUID, id: UUID): Promise<void> {
        await this.requireCard(userId, id);
        return this.cards.delete(id);
    }

    /**
     * Marca una cuenta como sin confirmar. La usa la conciliación del historial;
     * mientras lo esté, la cuenta no suma a ningún agregado.
     */
    async markUnconfirmed(accountId: UUID): Promise<BankAccount> {
        const account = await this.accounts.findById(accountId);
        if (!account) throw new Error("Cuenta no encontrada");
        return this.accounts.update({ ...account, isUnconfirmed: true });
    }

    // ─── Privados ────────────────────────────────────────────

    private async requireInstitution(userId: UUID, id: UUID): Promise<BankInstitution> {
        const found = await this.institutions.findById(id);
        if (!found || found.ownerUserId !== userId) throw new Error("Institución no encontrada");
        return found;
    }

    private async requireAccount(userId: UUID, id: UUID): Promise<BankAccount> {
        const found = await this.accounts.findById(id);
        if (!found || found.ownerUserId !== userId) throw new Error("Cuenta no encontrada");
        return found;
    }

    private async requireCard(userId: UUID, id: UUID): Promise<BankCard> {
        const found = await this.cards.findById(id);
        if (!found || found.ownerUserId !== userId) throw new Error("Tarjeta no encontrada");
        return found;
    }

    private async withBalance(
        account: BankAccount, movements: readonly BankMovement[],
    ): Promise<BankAccountWithBalance> {
        const own = movements.filter(m => m.accountId === account.id);
        const snapshot = await this.snapshots.findLatestForAccount(account.id, new Date().toISOString());
        return {
            ...account,
            balance: computeAccountBalance(snapshot, own),
            lastSnapshotAt: snapshot?.asOf ?? null,
        };
    }

    private async withDebt(
        card: BankCard, movements: readonly BankMovement[],
    ): Promise<BankCardWithDebt> {
        const own = movements.filter(m => m.cardId === card.id);
        const debt = computeCardDebt(own);
        const openStatement = card.cardType === "CREDIT"
            ? await this.statements.findOpenForCard(card.id)
            : null;
        return {
            ...card,
            debt,
            availableCredit: computeAvailableCredit(card.creditLimit, debt),
            openStatement,
        };
    }
}
