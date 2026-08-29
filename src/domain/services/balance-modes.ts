import { UUID } from "../core";

/** Una cuenta ya resuelta a saldo, lista para entrar (o no) al total. */
export interface TotalBalanceAccount {
    id: UUID;
    name: string;
    balance: number;
    /** Si nunca se declaró un saldo, el "balance" es solo la suma de movimientos. */
    hasSnapshot: boolean;
    status: string;
    isUnconfirmed: boolean;
    isDeleted: boolean;
}

export interface TotalBalanceResult {
    value: number;
    accountsCounted: number;
    /** Contables pero sin saldo declarado: quedan fuera y hay que avisarlo. */
    accountsWithoutSnapshot: { id: UUID; name: string }[];
}

/**
 * Cuánto dinero hay, sumando el saldo de cada cuenta contable.
 *
 * Una cuenta sin snapshot queda fuera a propósito: `computeAccountBalance` la
 * calcula como "cero más movimientos", que en una cuenta con gastos y sin
 * ingresos registrados produce un negativo falso. Se reporta aparte para que la
 * interfaz pueda pedir que se declare el saldo, en vez de mentir en silencio.
 *
 * No aplica el scope de configuración ni depende del rango: es un hecho sobre
 * cuánto se tiene, no una decisión de presupuesto.
 */
export function computeTotalBalance(
    accounts: readonly TotalBalanceAccount[],
): TotalBalanceResult {
    let value = 0;
    let accountsCounted = 0;
    const accountsWithoutSnapshot: { id: UUID; name: string }[] = [];

    for (const account of accounts) {
        if (account.isDeleted || account.isUnconfirmed || account.status !== "ACTIVE") continue;

        if (!account.hasSnapshot) {
            accountsWithoutSnapshot.push({ id: account.id, name: account.name });
            continue;
        }

        value += Number(account.balance);
        accountsCounted += 1;
    }

    return {
        value: Math.round(value * 100) / 100,
        accountsCounted,
        accountsWithoutSnapshot,
    };
}
