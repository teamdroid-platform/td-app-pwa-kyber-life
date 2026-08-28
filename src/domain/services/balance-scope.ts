import { UUID } from "../core";
import { BalanceScopeRule } from "../entities/balance";

/** Lo que existe hoy, para poder resolver la herencia banco → cuenta/tarjeta. */
export interface ScopeTargets {
    accounts: readonly { id: UUID; institutionId?: UUID | null }[];
    cards: readonly { id: UUID; institutionId?: UUID | null }[];
}

/** La parte de una transacción que decide si entra al balance. */
export interface ScopedTransaction {
    type: string;
    bankSourceAccountId?: UUID | null;
    bankDestinationAccountId?: UUID | null;
    bankCardId?: UUID | null;
}

export interface BalanceScope {
    /** `null`/`undefined` cuenta como incluido: una transacción huérfana entra. */
    isAccountIncluded(id?: UUID | null): boolean;
    isCardIncluded(id?: UUID | null): boolean;
    /**
     * Para todo lo que no sea TRANSFER: false si alguna de sus ligas apunta a
     * algo excluido. Las transferencias siempre pasan — que una punta esté
     * fuera cambia el signo del aporte, no lo descarta, y eso lo decide
     * `computeNetBalance`.
     */
    isTransactionIncluded(tx: ScopedTransaction): boolean;
    /** true cuando ninguna regla aplica: el scope no filtra nada. */
    readonly isUnrestricted: boolean;
}

/**
 * Resuelve las excepciones guardadas contra lo que existe hoy.
 *
 * Tres pasos: todo entra por defecto; una regla de institución saca el banco
 * entero; una regla de cuenta o tarjeta gana sobre la de su banco, en los dos
 * sentidos. Una regla cuyo objetivo ya no existe se ignora — no afecta a ningún
 * cálculo, y no justifica triggers de limpieza sobre tres tablas.
 */
export function resolveScope(
    rules: readonly BalanceScopeRule[],
    targets: ScopeTargets,
): BalanceScope {
    const byInstitution = new Map<UUID, boolean>();
    const explicit = new Map<UUID, boolean>();

    for (const rule of rules) {
        if (rule.isDeleted) continue;
        if (rule.targetType === "INSTITUTION") byInstitution.set(rule.targetId, rule.included);
        else explicit.set(rule.targetId, rule.included);
    }

    const included = new Map<UUID, boolean>();
    let restricted = false;

    const resolveOne = (id: UUID, institutionId?: UUID | null) => {
        const own = explicit.get(id);
        const inherited = institutionId ? byInstitution.get(institutionId) : undefined;
        const value = own ?? inherited ?? true;
        included.set(id, value);
        if (!value) restricted = true;
    };

    for (const account of targets.accounts) resolveOne(account.id, account.institutionId);
    for (const card of targets.cards) resolveOne(card.id, card.institutionId);

    const isIncluded = (id?: UUID | null): boolean => {
        if (!id) return true;
        return included.get(id) ?? true;
    };

    return {
        isAccountIncluded: isIncluded,
        isCardIncluded: isIncluded,
        isTransactionIncluded(tx) {
            if (tx.type === "TRANSFER") return true;
            return (
                isIncluded(tx.bankSourceAccountId) &&
                isIncluded(tx.bankDestinationAccountId) &&
                isIncluded(tx.bankCardId)
            );
        },
        get isUnrestricted() {
            return !restricted;
        },
    };
}
