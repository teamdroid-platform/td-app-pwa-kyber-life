# Balances configurables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ofrecer tres balances (total por saldos de cuentas, presupuesto del rango, y presupuesto con tarjetas), configurables por banco/cuenta/tarjeta desde ajustes, con un selector y explicación en cada pantalla que muestre un balance.

**Architecture:** Un `BalanceService` nuevo compone `FinancialDashboardService` (transacciones del rango) con los repositorios de Bancos (cuentas, tarjetas, movimientos, snapshots) y devuelve los tres balances en una sola llamada. El filtro por cuenta/tarjeta se resuelve con funciones puras en `domain/services/balance-scope.ts` y entra como parámetro opcional en `computeNetBalance`, que sigue siendo la única definición del balance del periodo.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind v4, shadcn/ui, Supabase (Postgres + RLS), Zod 4, Jest.

**Spec:** `docs/superpowers/specs/2026-08-27-balances-configurables-design.md`

## Global Constraints

- Proyecto Supabase: **KyberLife** (`xywkuwmhnfcdksamuypk`, us-east-2). Todo DDL se aplica con el MCP de Supabase (`apply_migration`), nunca ad-hoc, y queda además como archivo en `supabase/migrations/`.
- TypeScript estricto. Nada de `any` salvo necesidad real.
- Commits locales permitidos con Conventional Commits. **Nunca `push`, PR, merge ni deploy sin permiso explícito del usuario.**
- Diseño mobile-first obligatorio; los cambios visuales preservan la estética actual.
- Los tres modos son exactamente `'TOTAL' | 'PERIOD' | 'PERIOD_WITH_CREDIT'`. El modo por defecto sin configurar es `'PERIOD'`.
- Categorías con significado fijo, ya definidas en `src/domain/services/financial-balance.ts`: `SAVINGS_CATEGORY_NAME = "Ahorros e Inversiones"`, `FUNDING_CATEGORY_NAME = "Fondeo ingresos"`.
- Estados contables de una transacción: `DASHBOARD_ACTIVE_STATUSES = ['CONFIRMED','REVIEWED','MANUAL']`.
- Tests con Jest. Los `.ts` corren con cualquiera de las dos configuraciones; los `.tsx` necesitan la de jsdom (`jest.config.js`, la de por defecto).
- Acotar búsquedas a `src/` o `__tests__/`: una búsqueda desde la raíz del repo agota el tiempo por `node_modules/`, `.next/` y `.agent/`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/domain/entities/balance.ts` | Tipos: `BalanceMode`, `BalanceScopeRule`, `BalanceSettings` |
| `src/domain/services/balance-scope.ts` | `resolveScope` — herencia banco→cuenta/tarjeta y excepciones |
| `src/domain/services/balance-modes.ts` | `computeTotalBalance` — el total por saldos |
| `src/domain/services/financial-balance.ts` | (modificado) `computeNetBalance` y `sumCreditExpenses` aceptan scope |
| `src/domain/repositories/balance.ts` | `IBalanceSettingsRepository` |
| `src/infrastructure/repositories/supabase/supabase-balance-settings-repository.ts` | Implementación Supabase |
| `src/infrastructure/repositories/implementations.ts` | (modificado) implementación en memoria |
| `src/application/services/balance-service.ts` | Compone el `BalanceSet` |
| `src/app/actions/balance.ts` | Server actions |
| `src/lib/validators/balance-schemas.ts` | Esquemas Zod |
| `src/presentation/financial/components/BalanceModeSwitch.tsx` | Selector compartido |
| `src/presentation/financial/components/settings/BalanceScopeManager.tsx` | Árbol de configuración |
| `supabase/migrations/20260827120000_balance_settings.sql` | Esquema |

---

### Task 1: Tipos y resolución del scope

**Files:**
- Create: `src/domain/entities/balance.ts`
- Create: `src/domain/services/balance-scope.ts`
- Test: `__tests__/domain/balance-scope.test.ts`

**Interfaces:**
- Consumes: `BaseEntity`, `UUID` de `src/domain/core.ts`.
- Produces: `BalanceMode`, `BalanceScopeTargetType`, `BalanceScopeRule`, `BalanceSettings`, `DEFAULT_BALANCE_MODE`, `resolveScope(rules, targets): BalanceScope`, y las interfaces `BalanceScope`, `ScopeTargets`, `ScopedTransaction`.

- [ ] **Step 1: Crear los tipos de dominio**

Crea `src/domain/entities/balance.ts`:

```ts
import { BaseEntity, UUID } from "../core";

/** Los tres balances que la app sabe calcular. */
export type BalanceMode = 'TOTAL' | 'PERIOD' | 'PERIOD_WITH_CREDIT';

export const BALANCE_MODES: readonly BalanceMode[] = ['TOTAL', 'PERIOD', 'PERIOD_WITH_CREDIT'] as const;

/** El que se usa mientras el usuario no configure otro. */
export const DEFAULT_BALANCE_MODE: BalanceMode = 'PERIOD';

export type BalanceScopeTargetType = 'INSTITUTION' | 'ACCOUNT' | 'CARD';

/**
 * Una excepción a "todo entra al balance". Solo se guardan las excepciones:
 * un banco sin regla está incluido, y una cuenta sin regla hereda la de su
 * banco. Así una cuenta que el escáner cree mañana entra sola.
 */
export interface BalanceScopeRule extends BaseEntity {
    ownerUserId: UUID;
    targetType: BalanceScopeTargetType;
    targetId: UUID;
    included: boolean;
}

export interface BalanceSettings {
    ownerUserId: UUID;
    defaultMode: BalanceMode;
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `__tests__/domain/balance-scope.test.ts`:

```ts
import { resolveScope } from "@/domain/services/balance-scope";
import type { BalanceScopeRule } from "@/domain/entities/balance";

describe("resolveScope", () => {
    const targets = {
        accounts: [
            { id: "acc-pichincha-1", institutionId: "inst-pichincha" },
            { id: "acc-pichincha-2", institutionId: "inst-pichincha" },
            { id: "acc-austro-1", institutionId: "inst-austro" },
            { id: "acc-cash", institutionId: null },
        ],
        cards: [
            { id: "card-pichincha", institutionId: "inst-pichincha" },
            { id: "card-austro", institutionId: "inst-austro" },
        ],
    };

    function rule(
        targetType: BalanceScopeRule["targetType"],
        targetId: string,
        included: boolean,
    ): BalanceScopeRule {
        return {
            id: `rule-${targetType}-${targetId}`,
            ownerUserId: "user-1",
            targetType,
            targetId,
            included,
            createdAt: "2026-08-27T00:00:00Z",
            updatedAt: "2026-08-27T00:00:00Z",
            isDeleted: false,
        };
    }

    it("incluye todo cuando no hay reglas", () => {
        const scope = resolveScope([], targets);

        expect(scope.isUnrestricted).toBe(true);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
        expect(scope.isCardIncluded("card-austro")).toBe(true);
    });

    it("excluir un banco saca sus cuentas y sus tarjetas", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isUnrestricted).toBe(false);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(false);
        expect(scope.isAccountIncluded("acc-pichincha-2")).toBe(false);
        expect(scope.isCardIncluded("card-pichincha")).toBe(false);
        expect(scope.isAccountIncluded("acc-austro-1")).toBe(true);
    });

    it("una cuenta nueva del banco excluido también queda fuera", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], {
            ...targets,
            accounts: [...targets.accounts, { id: "acc-nueva", institutionId: "inst-pichincha" }],
        });

        expect(scope.isAccountIncluded("acc-nueva")).toBe(false);
    });

    it("una regla de cuenta rescata una cuenta de un banco excluido", () => {
        const scope = resolveScope(
            [rule("INSTITUTION", "inst-pichincha", false), rule("ACCOUNT", "acc-pichincha-1", true)],
            targets,
        );

        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
        expect(scope.isAccountIncluded("acc-pichincha-2")).toBe(false);
    });

    it("una regla de cuenta saca una cuenta de un banco incluido", () => {
        const scope = resolveScope([rule("ACCOUNT", "acc-austro-1", false)], targets);

        expect(scope.isAccountIncluded("acc-austro-1")).toBe(false);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
    });

    it("ignora reglas que apuntan a algo que ya no existe", () => {
        const scope = resolveScope([rule("ACCOUNT", "acc-borrada", false)], targets);

        expect(scope.isUnrestricted).toBe(true);
        expect(scope.isAccountIncluded("acc-pichincha-1")).toBe(true);
    });

    it("una transacción sin ninguna cuenta ligada siempre entra", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isTransactionIncluded({ type: "EXPENSE" })).toBe(true);
        expect(scope.isTransactionIncluded({
            type: "EXPENSE",
            bankSourceAccountId: null,
            bankCardId: null,
        })).toBe(true);
    });

    it("una transacción ligada a algo excluido queda fuera", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isTransactionIncluded({
            type: "EXPENSE",
            bankSourceAccountId: "acc-pichincha-1",
        })).toBe(false);
        expect(scope.isTransactionIncluded({
            type: "EXPENSE",
            bankCardId: "card-pichincha",
        })).toBe(false);
        expect(scope.isTransactionIncluded({
            type: "INCOME",
            bankDestinationAccountId: "acc-pichincha-2",
        })).toBe(false);
    });

    it("las transferencias nunca se descartan: su signo lo decide computeNetBalance", () => {
        const scope = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);

        expect(scope.isTransactionIncluded({
            type: "TRANSFER",
            bankSourceAccountId: "acc-austro-1",
            bankDestinationAccountId: "acc-pichincha-1",
        })).toBe(true);
    });

    it("una cuenta sin banco (efectivo) solo se excluye con su propia regla", () => {
        const porBanco = resolveScope([rule("INSTITUTION", "inst-pichincha", false)], targets);
        expect(porBanco.isAccountIncluded("acc-cash")).toBe(true);

        const propia = resolveScope([rule("ACCOUNT", "acc-cash", false)], targets);
        expect(propia.isAccountIncluded("acc-cash")).toBe(false);
    });
});
```

- [ ] **Step 2b: Correrlo para verificar que falla**

Run: `npx jest __tests__/domain/balance-scope.test.ts`
Expected: FAIL — `Cannot find module '@/domain/services/balance-scope'`

- [ ] **Step 3: Implementar `resolveScope`**

Crea `src/domain/services/balance-scope.ts`:

```ts
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
```

- [ ] **Step 4: Correr el test**

Run: `npx jest __tests__/domain/balance-scope.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/domain/entities/balance.ts src/domain/services/balance-scope.ts __tests__/domain/balance-scope.test.ts
git commit -m "feat(financial): add balance scope resolution with bank-to-account inheritance"
```

---

### Task 2: El scope entra en `computeNetBalance` y `sumCreditExpenses`

**Files:**
- Modify: `src/domain/services/financial-balance.ts`
- Test: `__tests__/domain/balance-modes.test.ts`

**Interfaces:**
- Consumes: `BalanceScope` y `resolveScope` de la Task 1.
- Produces: `computeNetBalance(transactions, categoryNameById?, scope?)` y `sumCreditExpenses(transactions, scope?)`, ambas retrocompatibles sin el parámetro nuevo.

La firma vieja debe seguir funcionando: hay tests y llamadas existentes que la usan con uno y dos argumentos. Un `computeNetBalance` paralelo NO es aceptable — el bug de balances distintos del 2026-08-26 vino de tener dos definiciones de la misma regla.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/domain/balance-modes.test.ts`:

```ts
import { computeNetBalance, sumCreditExpenses } from "@/domain/services/financial-balance";
import { resolveScope } from "@/domain/services/balance-scope";
import type { BalanceScopeRule } from "@/domain/entities/balance";

describe("computeNetBalance con scope", () => {
    const targets = {
        accounts: [
            { id: "acc-in", institutionId: "inst-in" },
            { id: "acc-out", institutionId: "inst-out" },
        ],
        cards: [
            { id: "card-in", institutionId: "inst-in" },
            { id: "card-out", institutionId: "inst-out" },
        ],
    };

    const excluirInstOut: BalanceScopeRule[] = [{
        id: "r1",
        ownerUserId: "user-1",
        targetType: "INSTITUTION",
        targetId: "inst-out",
        included: false,
        createdAt: "2026-08-27T00:00:00Z",
        updatedAt: "2026-08-27T00:00:00Z",
        isDeleted: false,
    }];

    const scope = resolveScope(excluirInstOut, targets);

    it("sin scope se comporta igual que antes", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null, bankDestinationAccountId: "acc-out" },
            { type: "EXPENSE" as const, amount: 300, categoryId: null, bankSourceAccountId: "acc-out" },
        ];

        expect(computeNetBalance(txs)).toBe(700);
    });

    it("ignora las transacciones ligadas a algo excluido", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null, bankDestinationAccountId: "acc-in" },
            { type: "INCOME" as const, amount: 500, categoryId: null, bankDestinationAccountId: "acc-out" },
            { type: "EXPENSE" as const, amount: 300, categoryId: null, bankSourceAccountId: "acc-in" },
            { type: "EXPENSE" as const, amount: 200, categoryId: null, bankSourceAccountId: "acc-out" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(700);
    });

    it("cuenta las transacciones huérfanas aunque el scope filtre", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null },
            { type: "EXPENSE" as const, amount: 250, categoryId: null },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(750);
    });

    it("una transferencia hacia una cuenta excluida sale del balance", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-in", bankDestinationAccountId: "acc-out" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(-400);
    });

    it("una transferencia desde una cuenta excluida entra al balance", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-out", bankDestinationAccountId: "acc-in" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(400);
    });

    it("una transferencia entre dos cuentas incluidas es neutra", () => {
        const txs = [
            { type: "TRANSFER" as const, amount: 400, categoryId: null, bankSourceAccountId: "acc-in", bankDestinationAccountId: "acc-in" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(0);
    });

    it("la categoría manda sobre el scope: ahorros resta una sola vez", () => {
        const txs = [
            {
                type: "TRANSFER" as const,
                amount: 400,
                categoryId: null,
                categoryName: "Ahorros e Inversiones",
                bankSourceAccountId: "acc-in",
                bankDestinationAccountId: "acc-out",
            },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(-400);
    });

    it("un consumo con tarjeta excluida no aparece por ningún lado", () => {
        const txs = [
            { type: "INCOME" as const, amount: 1000, categoryId: null },
            { type: "EXPENSE" as const, amount: 50, categoryId: null, paidWithCredit: true, bankCardId: "card-in" },
            { type: "EXPENSE" as const, amount: 80, categoryId: null, paidWithCredit: true, bankCardId: "card-out" },
        ];

        expect(computeNetBalance(txs, undefined, scope)).toBe(1000);
        expect(sumCreditExpenses(txs, scope)).toBe(50);
    });

    it("sumCreditExpenses sin scope cuenta todos los consumos", () => {
        const txs = [
            { type: "EXPENSE" as const, amount: 50, categoryId: null, paidWithCredit: true, bankCardId: "card-in" },
            { type: "EXPENSE" as const, amount: 80, categoryId: null, paidWithCredit: true, bankCardId: "card-out" },
        ];

        expect(sumCreditExpenses(txs)).toBe(130);
    });
});
```

- [ ] **Step 2: Correrlo para verificar que falla**

Run: `npx jest __tests__/domain/balance-modes.test.ts`
Expected: FAIL — los tests con `scope` fallan porque el tercer parámetro se ignora.

- [ ] **Step 3: Extender el tipo `BalanceTransaction`**

En `src/domain/services/financial-balance.ts`, añade el import y amplía el tipo local:

```ts
import { BalanceScope } from "./balance-scope";
```

```ts
type BalanceTransaction = Pick<
    FinancialTransaction,
    "type" | "amount" | "categoryId" | "categoryName" | "paidWithCredit"
> & Partial<Pick<
    FinancialTransaction,
    "bankSourceAccountId" | "bankDestinationAccountId" | "bankCardId"
>>;
```

- [ ] **Step 4: Reescribir el cuerpo de `computeNetBalance`**

Reemplaza la firma y el bucle. El orden de las ramas conserva el comportamiento actual, incluido que `OTHER` cae en la rama final y resta como gasto:

```ts
export function computeNetBalance(
    transactions: readonly BalanceTransaction[],
    categoryNameById?: ReadonlyMap<string, string>,
    scope?: BalanceScope,
): number {
    let balance = 0;

    for (const t of transactions) {
        const amount = Number(t.amount);

        if (t.type === "TRANSFER") {
            // La categoría manda sobre el scope: una transferencia marcada como
            // ahorro resta una sola vez, aunque su destino esté además excluido.
            if (isSavingsTransfer(t, categoryNameById)) { balance -= amount; continue; }
            if (isFundingTransfer(t, categoryNameById)) { balance += amount; continue; }
            if (scope) {
                const fromIn = scope.isAccountIncluded(t.bankSourceAccountId);
                const toIn = scope.isAccountIncluded(t.bankDestinationAccountId);
                // Mover dinero a una cuenta que no presupuestas es sacarlo del
                // bolsillo; traerlo de vuelta es meterlo.
                if (fromIn && !toIn) { balance -= amount; continue; }
                if (!fromIn && toIn) { balance += amount; continue; }
            }
            continue;
        }

        if (scope && !scope.isTransactionIncluded(t)) continue;

        if (isIncomeType(t.type)) {
            balance += amount;
        } else if (isWithdrawalType(t.type)) {
            // no-op: cash changes form, still available
        } else if (!t.paidWithCredit) {
            balance -= amount;
        }
    }

    return Math.round(balance * 100) / 100;
}
```

Actualiza el bloque de documentación de la función para mencionar el parámetro `scope` y las dos reglas de transferencia.

- [ ] **Step 5: Añadir el scope a `sumCreditExpenses`**

```ts
export function sumCreditExpenses(
    transactions: readonly BalanceTransaction[],
    scope?: BalanceScope,
): number {
    let sum = 0;
    for (const t of transactions) {
        if (
            t.paidWithCredit &&
            !isIncomeType(t.type) &&
            !isWithdrawalType(t.type) &&
            t.type !== "TRANSFER" &&
            (!scope || scope.isCardIncluded(t.bankCardId))
        ) {
            sum += Number(t.amount);
        }
    }
    return Math.round(sum * 100) / 100;
}
```

- [ ] **Step 6: Correr los tests nuevos y los de regresión**

Run: `npx jest __tests__/domain __tests__/services/financial-dashboard-service.test.ts __tests__/integration/financial-balance-parity.test.ts`
Expected: PASS — todo verde. Si algún test viejo falla, el cambio rompió el comportamiento sin scope: arréglalo, no ajustes el test.

- [ ] **Step 7: Commit**

```bash
git add src/domain/services/financial-balance.ts __tests__/domain/balance-modes.test.ts
git commit -m "feat(financial): accept an optional account scope in computeNetBalance"
```

---

### Task 3: El balance total por saldos de cuentas

**Files:**
- Create: `src/domain/services/balance-modes.ts`
- Test: `__tests__/domain/balance-total.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `computeTotalBalance(accounts): TotalBalanceResult`, y los tipos `TotalBalanceAccount` y `TotalBalanceResult`.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/domain/balance-total.test.ts`:

```ts
import { computeTotalBalance } from "@/domain/services/balance-modes";

describe("computeTotalBalance", () => {
    const base = {
        status: "ACTIVE" as const,
        isUnconfirmed: false,
        isDeleted: false,
        hasSnapshot: true,
    };

    it("suma los saldos de las cuentas contables", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Pichincha Ahorros", balance: 1200.5 },
            { ...base, id: "b", name: "Austro Corriente", balance: 300.25 },
        ]);

        expect(result.value).toBe(1500.75);
        expect(result.accountsCounted).toBe(2);
        expect(result.accountsWithoutSnapshot).toEqual([]);
    });

    it("incluye la cuenta de efectivo", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Pichincha Ahorros", balance: 1000 },
            { ...base, id: "cash", name: "Efectivo", balance: 60 },
        ]);

        expect(result.value).toBe(1060);
    });

    it("deja fuera las cuentas sin saldo declarado y las reporta", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Pichincha Ahorros", balance: 1000 },
            { ...base, id: "b", name: "Austro Corriente", balance: -450, hasSnapshot: false },
        ]);

        expect(result.value).toBe(1000);
        expect(result.accountsCounted).toBe(1);
        expect(result.accountsWithoutSnapshot).toEqual([{ id: "b", name: "Austro Corriente" }]);
    });

    it("deja fuera las cerradas, las borradas y las sin confirmar", () => {
        const result = computeTotalBalance([
            { ...base, id: "a", name: "Contable", balance: 1000 },
            { ...base, id: "b", name: "Cerrada", balance: 500, status: "CLOSED" },
            { ...base, id: "c", name: "Borrada", balance: 500, isDeleted: true },
            { ...base, id: "d", name: "Sin confirmar", balance: 500, isUnconfirmed: true },
        ]);

        expect(result.value).toBe(1000);
        expect(result.accountsCounted).toBe(1);
    });

    it("una cuenta sin snapshot que además está cerrada no se reporta como pendiente", () => {
        const result = computeTotalBalance([
            { ...base, id: "b", name: "Cerrada", balance: 0, status: "CLOSED", hasSnapshot: false },
        ]);

        expect(result.accountsWithoutSnapshot).toEqual([]);
    });

    it("con cero cuentas devuelve cero, no NaN", () => {
        const result = computeTotalBalance([]);

        expect(result.value).toBe(0);
        expect(result.accountsCounted).toBe(0);
    });
});
```

- [ ] **Step 2: Correrlo para verificar que falla**

Run: `npx jest __tests__/domain/balance-total.test.ts`
Expected: FAIL — `Cannot find module '@/domain/services/balance-modes'`

- [ ] **Step 3: Implementar**

Crea `src/domain/services/balance-modes.ts`:

```ts
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
```

- [ ] **Step 4: Correr el test**

Run: `npx jest __tests__/domain/balance-total.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/balance-modes.ts __tests__/domain/balance-total.test.ts
git commit -m "feat(financial): add total balance from declared account snapshots"
```

---

### Task 4: Esquema, repositorios y cableado

**Files:**
- Create: `supabase/migrations/20260827120000_balance_settings.sql`
- Create: `src/domain/repositories/balance.ts`
- Create: `src/infrastructure/repositories/supabase/supabase-balance-settings-repository.ts`
- Modify: `src/infrastructure/repositories/implementations.ts`
- Modify: `src/infrastructure/container.ts`
- Test: `__tests__/services/balance-settings-repository.test.ts`

**Interfaces:**
- Consumes: `BalanceMode`, `BalanceScopeRule`, `BalanceSettings`, `DEFAULT_BALANCE_MODE` de la Task 1.
- Produces: `IBalanceSettingsRepository` con `getSettings`, `setDefaultMode`, `getRules`, `setRule`, `clearRules`, `clearRulesForInstitution`; y los singletons `balanceSettingsRepository` exportados desde `container.ts`.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/20260827120000_balance_settings.sql`:

```sql
-- Configuración de balances: qué balance se muestra por defecto y qué bancos,
-- cuentas y tarjetas alimentan los dos balances de periodo.
--
-- Solo se guardan las EXCEPCIONES. Sin ninguna fila el usuario tiene el
-- comportamiento por defecto: modo PERIOD y todo incluido. Esa es la razón de
-- que una cuenta creada mañana por el escáner entre sola al balance de su banco.

CREATE TABLE financial_balance_settings (
    owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    default_mode  TEXT NOT NULL DEFAULT 'PERIOD'
                  CHECK (default_mode IN ('TOTAL', 'PERIOD', 'PERIOD_WITH_CREDIT')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE financial_balance_scope_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_type   TEXT NOT NULL CHECK (target_type IN ('INSTITUTION', 'ACCOUNT', 'CARD')),
    -- Sin FK a propósito: apunta a bank_institutions, bank_accounts o
    -- bank_cards según target_type. Una regla que quede apuntando a algo
    -- borrado se ignora al resolver, y no afecta a ningún cálculo.
    target_id     UUID NOT NULL,
    included      BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT financial_balance_scope_rules_target_uq
        UNIQUE (owner_user_id, target_type, target_id)
);

CREATE INDEX financial_balance_scope_rules_owner_idx
    ON financial_balance_scope_rules (owner_user_id);

ALTER TABLE financial_balance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own financial_balance_settings"   ON financial_balance_settings FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own financial_balance_settings" ON financial_balance_settings FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own financial_balance_settings" ON financial_balance_settings FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own financial_balance_settings" ON financial_balance_settings FOR DELETE USING (auth.uid() = owner_user_id);

ALTER TABLE financial_balance_scope_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own financial_balance_scope_rules"   ON financial_balance_scope_rules FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own financial_balance_scope_rules" ON financial_balance_scope_rules FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own financial_balance_scope_rules" ON financial_balance_scope_rules FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own financial_balance_scope_rules" ON financial_balance_scope_rules FOR DELETE USING (auth.uid() = owner_user_id);
```

- [ ] **Step 2: Aplicar la migración**

Aplícala con el MCP de Supabase, `apply_migration`, sobre el proyecto `xywkuwmhnfcdksamuypk`, con nombre `balance_settings` y el cuerpo del archivo anterior. Verifica después con `list_tables` que las dos tablas existen.

- [ ] **Step 3: Definir la interfaz del repositorio**

Crea `src/domain/repositories/balance.ts`:

```ts
import { UUID } from "../core";
import { BalanceMode, BalanceScopeRule, BalanceSettings, BalanceScopeTargetType } from "../entities/balance";

/**
 * Guarda solo lo que el usuario cambió: el modo por defecto y las excepciones
 * de alcance. Sin filas, el comportamiento por defecto aplica entero.
 */
export interface IBalanceSettingsRepository {
    /** Null cuando el usuario nunca configuró nada. */
    getSettings(userId: UUID): Promise<BalanceSettings | null>;
    setDefaultMode(userId: UUID, mode: BalanceMode): Promise<BalanceSettings>;
    getRules(userId: UUID): Promise<BalanceScopeRule[]>;
    /** Crea o actualiza la regla de ese objetivo. */
    setRule(userId: UUID, targetType: BalanceScopeTargetType, targetId: UUID, included: boolean): Promise<BalanceScopeRule>;
    /**
     * Borra las reglas de una lista de objetivos, que vuelven a heredar de su
     * banco. Con un solo id sirve además para quitar una excepción suelta.
     */
    clearRulesForTargets(userId: UUID, targetIds: readonly UUID[]): Promise<void>;
    /** Borra todas las reglas del usuario. */
    clearRules(userId: UUID): Promise<void>;
}
```

- [ ] **Step 4: Escribir el test de la implementación en memoria**

Crea `__tests__/services/balance-settings-repository.test.ts`:

```ts
import { InMemoryBalanceSettingsRepository } from "@/infrastructure/repositories/implementations";

describe("InMemoryBalanceSettingsRepository", () => {
    const userId = "user-1";
    let repo: InMemoryBalanceSettingsRepository;

    beforeEach(() => {
        repo = new InMemoryBalanceSettingsRepository();
    });

    it("devuelve null mientras el usuario no configure nada", async () => {
        expect(await repo.getSettings(userId)).toBeNull();
        expect(await repo.getRules(userId)).toEqual([]);
    });

    it("guarda el modo por defecto", async () => {
        const saved = await repo.setDefaultMode(userId, "PERIOD_WITH_CREDIT");

        expect(saved.defaultMode).toBe("PERIOD_WITH_CREDIT");
        expect((await repo.getSettings(userId))?.defaultMode).toBe("PERIOD_WITH_CREDIT");
    });

    it("una segunda regla sobre el mismo objetivo la reemplaza", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);
        await repo.setRule(userId, "ACCOUNT", "acc-1", true);

        const rules = await repo.getRules(userId);
        expect(rules).toHaveLength(1);
        expect(rules[0].included).toBe(true);
    });

    it("distingue objetivos del mismo id pero distinto tipo", async () => {
        await repo.setRule(userId, "ACCOUNT", "same-id", false);
        await repo.setRule(userId, "CARD", "same-id", true);

        expect(await repo.getRules(userId)).toHaveLength(2);
    });

    it("borra la regla de un objetivo suelto", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);
        await repo.clearRulesForTargets(userId, ["acc-1"]);

        expect(await repo.getRules(userId)).toEqual([]);
    });

    it("limpia las reglas de una lista de objetivos", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);
        await repo.setRule(userId, "CARD", "card-1", false);
        await repo.setRule(userId, "ACCOUNT", "acc-otro-banco", false);

        await repo.clearRulesForTargets(userId, ["acc-1", "card-1"]);

        const rules = await repo.getRules(userId);
        expect(rules.map(r => r.targetId)).toEqual(["acc-otro-banco"]);
    });

    it("no mezcla usuarios", async () => {
        await repo.setRule(userId, "ACCOUNT", "acc-1", false);

        expect(await repo.getRules("otro-user")).toEqual([]);
    });
});
```

- [ ] **Step 5: Correrlo para verificar que falla**

Run: `npx jest __tests__/services/balance-settings-repository.test.ts`
Expected: FAIL — `InMemoryBalanceSettingsRepository` no está exportado.

- [ ] **Step 6: Implementar la versión en memoria**

Añade al final de `src/infrastructure/repositories/implementations.ts`:

```ts
export class InMemoryBalanceSettingsRepository implements IBalanceSettingsRepository {
    private settings = new Map<UUID, BalanceSettings>();
    private rules = new Map<UUID, BalanceScopeRule[]>();

    async getSettings(userId: UUID): Promise<BalanceSettings | null> {
        return this.settings.get(userId) ?? null;
    }

    async setDefaultMode(userId: UUID, mode: BalanceMode): Promise<BalanceSettings> {
        const saved: BalanceSettings = { ownerUserId: userId, defaultMode: mode };
        this.settings.set(userId, saved);
        return saved;
    }

    async getRules(userId: UUID): Promise<BalanceScopeRule[]> {
        return [...(this.rules.get(userId) ?? [])];
    }

    async setRule(
        userId: UUID,
        targetType: BalanceScopeTargetType,
        targetId: UUID,
        included: boolean,
    ): Promise<BalanceScopeRule> {
        const now = new Date().toISOString();
        const existing = this.rules.get(userId) ?? [];
        const previous = existing.find(r => r.targetType === targetType && r.targetId === targetId);

        const rule: BalanceScopeRule = {
            id: previous?.id ?? `${targetType}:${targetId}`,
            ownerUserId: userId,
            targetType,
            targetId,
            included,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
            isDeleted: false,
        };

        this.rules.set(userId, [
            ...existing.filter(r => !(r.targetType === targetType && r.targetId === targetId)),
            rule,
        ]);
        return rule;
    }

    async clearRulesForTargets(userId: UUID, targetIds: readonly UUID[]): Promise<void> {
        const drop = new Set(targetIds);
        const existing = this.rules.get(userId) ?? [];
        this.rules.set(userId, existing.filter(r => !drop.has(r.targetId)));
    }

    async clearRules(userId: UUID): Promise<void> {
        this.rules.delete(userId);
    }
}
```

Añade los imports que falten en la cabecera del archivo: `IBalanceSettingsRepository` de `@/domain/repositories/balance` y `BalanceMode`, `BalanceScopeRule`, `BalanceScopeTargetType`, `BalanceSettings` de `@/domain/entities/balance`, siguiendo el estilo de import ya usado en ese archivo.

- [ ] **Step 7: Correr el test**

Run: `npx jest __tests__/services/balance-settings-repository.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 8: Implementar la versión Supabase**

Crea `src/infrastructure/repositories/supabase/supabase-balance-settings-repository.ts`:

```ts
import type { IBalanceSettingsRepository } from "@/domain/repositories/balance";
import type {
    BalanceMode, BalanceScopeRule, BalanceScopeTargetType, BalanceSettings,
} from "@/domain/entities/balance";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

interface ScopeRuleRow {
    id: string;
    owner_user_id: string;
    target_type: BalanceScopeTargetType;
    target_id: string;
    included: boolean;
    created_at: string;
    updated_at: string;
}

function mapRule(row: ScopeRuleRow): BalanceScopeRule {
    return {
        id: row.id,
        ownerUserId: row.owner_user_id,
        targetType: row.target_type,
        targetId: row.target_id,
        included: row.included,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isDeleted: false,
    };
}

export class SupabaseBalanceSettingsRepository implements IBalanceSettingsRepository {
    async getSettings(userId: UUID): Promise<BalanceSettings | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_settings')
            .select('*')
            .eq('owner_user_id', userId)
            .maybeSingle();

        if (error) throw new Error(`Error loading balance settings: ${error.message}`);
        if (!data) return null;
        return { ownerUserId: data.owner_user_id, defaultMode: data.default_mode as BalanceMode };
    }

    async setDefaultMode(userId: UUID, mode: BalanceMode): Promise<BalanceSettings> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_settings')
            .upsert(
                { owner_user_id: userId, default_mode: mode, updated_at: new Date().toISOString() },
                { onConflict: 'owner_user_id' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving balance settings: ${error.message}`);
        return { ownerUserId: data.owner_user_id, defaultMode: data.default_mode as BalanceMode };
    }

    async getRules(userId: UUID): Promise<BalanceScopeRule[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_scope_rules')
            .select('*')
            .eq('owner_user_id', userId);

        if (error) throw new Error(`Error loading balance scope rules: ${error.message}`);
        return (data ?? []).map(mapRule);
    }

    async setRule(
        userId: UUID,
        targetType: BalanceScopeTargetType,
        targetId: UUID,
        included: boolean,
    ): Promise<BalanceScopeRule> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('financial_balance_scope_rules')
            .upsert(
                {
                    owner_user_id: userId,
                    target_type: targetType,
                    target_id: targetId,
                    included,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'owner_user_id,target_type,target_id' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving balance scope rule: ${error.message}`);
        return mapRule(data);
    }

    async clearRulesForTargets(userId: UUID, targetIds: readonly UUID[]): Promise<void> {
        if (targetIds.length === 0) return;
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_balance_scope_rules')
            .delete()
            .eq('owner_user_id', userId)
            .in('target_id', targetIds as string[]);

        if (error) throw new Error(`Error clearing balance scope rules: ${error.message}`);
    }

    async clearRules(userId: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from('financial_balance_scope_rules')
            .delete()
            .eq('owner_user_id', userId);

        if (error) throw new Error(`Error clearing balance scope rules: ${error.message}`);
    }
}
```

- [ ] **Step 9: Cablear en el contenedor**

En `src/infrastructure/container.ts`, junto a los demás repositorios (cerca de `bankCardRepository`, alrededor de la línea 124), añade:

```ts
export const balanceSettingsRepository = singleton("balanceSettingsRepo", () =>
    isSupabase ? new SupabaseBalanceSettingsRepository() : new InMemoryBalanceSettingsRepository());
```

Añade los dos imports correspondientes en los bloques de import que ya existen para repositorios Supabase y en memoria.

- [ ] **Step 10: Verificar tipos y commitear**

Run: `npx tsc --noEmit 2>&1 | grep "^src/"`
Expected: sin salida.

```bash
git add supabase/migrations/20260827120000_balance_settings.sql src/domain/repositories/balance.ts src/infrastructure/repositories/supabase/supabase-balance-settings-repository.ts src/infrastructure/repositories/implementations.ts src/infrastructure/container.ts __tests__/services/balance-settings-repository.test.ts
git commit -m "feat(financial): add balance settings schema and repositories"
```

---

### Task 5: `BalanceService`

**Files:**
- Create: `src/application/services/balance-service.ts`
- Modify: `src/infrastructure/container.ts`
- Test: `__tests__/services/balance-service.test.ts`

**Interfaces:**
- Consumes: `resolveScope` (Task 1), `computeNetBalance` y `sumCreditExpenses` con scope (Task 2), `computeTotalBalance` (Task 3), `balanceSettingsRepository` (Task 4), `computeAccountBalance` de `src/domain/services/bank-balance.ts`, `isTransactionPaidWithCredit` y `creditCardIdSet` de `src/lib/financial-utils.ts`.
- Produces: `BalanceService` con `getBalanceSet(userId, range)`, y el tipo `BalanceSet`. Exporta el singleton `balanceService`.

`BalanceService` **no** llama a `BankService.getOverview`: ese método cierra estados de cuenta vencidos como efecto secundario, y este servicio se invoca desde tres pantallas en cada carga.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/services/balance-service.test.ts`:

```ts
import { BalanceService } from "@/application/services/balance-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

describe("BalanceService", () => {
    const userId = "user-1";

    const baseTx: Omit<FinancialTransaction, "id"> = {
        ownerUserId: userId,
        amount: 0,
        currency: "USD",
        date: "2026-08-23T10:00:00Z",
        type: "EXPENSE",
        status: "CONFIRMED",
        categoryId: null,
        institutionId: null,
        merchant: "Test",
        description: "Test",
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: "2026-08-23T10:00:00Z",
        updatedAt: "2026-08-23T10:00:00Z",
    };

    const transactions: FinancialTransaction[] = [
        { ...baseTx, id: "1", type: "INCOME", amount: 5000, bankDestinationAccountId: "acc-in" },
        { ...baseTx, id: "2", amount: 200, bankSourceAccountId: "acc-in" },
        { ...baseTx, id: "3", amount: 100, bankSourceAccountId: "acc-out" },
        { ...baseTx, id: "4", amount: 50, paidWithCredit: true, bankCardId: "card-in" },
    ];

    const accounts = [
        { id: "acc-in", institutionId: "inst-in", accountType: "SAVINGS", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "", institutionName: "Banco A" },
        { id: "acc-out", institutionId: "inst-out", accountType: "SAVINGS", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "", institutionName: "Banco B" },
    ];

    const cards = [
        { id: "card-in", institutionId: "inst-in", cardType: "CREDIT", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" },
    ];

    function buildService(rules: unknown[] = []) {
        const transactionRepo = {
            findForDashboard: jest.fn().mockResolvedValue(transactions),
        } as any;
        const accountRepo = { findByOwnerId: jest.fn().mockResolvedValue(accounts) } as any;
        const cardRepo = { findByOwnerId: jest.fn().mockResolvedValue(cards) } as any;
        const movementRepo = { findAllForOwner: jest.fn().mockResolvedValue([]) } as any;
        const snapshotRepo = {
            findLatestForAccount: jest.fn().mockImplementation(async (accountId: string) =>
                accountId === "acc-in"
                    ? { id: "s1", accountId, balance: 1200, asOf: "2026-08-01T00:00:00Z" }
                    : null),
        } as any;
        const categoryRepo = { findAllBaseAndUser: jest.fn().mockResolvedValue([]) } as any;
        const settingsRepo = {
            getSettings: jest.fn().mockResolvedValue(null),
            getRules: jest.fn().mockResolvedValue(rules),
        } as any;

        return new BalanceService(
            transactionRepo, accountRepo, cardRepo, movementRepo, snapshotRepo, categoryRepo, settingsRepo,
        );
    }

    it("devuelve los tres balances sin configuración", async () => {
        const set = await buildService().getBalanceSet(userId, {});

        // 5000 − 200 − 100; el consumo con tarjeta queda diferido.
        expect(set.period.value).toBe(4700);
        expect(set.withCredit.value).toBe(4650);
        expect(set.withCredit.creditDeferred).toBe(50);
        expect(set.defaultMode).toBe("PERIOD");
    });

    it("el total solo suma cuentas con saldo declarado y reporta las demás", async () => {
        const set = await buildService().getBalanceSet(userId, {});

        expect(set.total.value).toBe(1200);
        expect(set.total.accountsCounted).toBe(1);
        expect(set.total.accountsWithoutSnapshot).toEqual([{ id: "acc-out", name: "Banco B" }]);
    });

    it("el scope filtra los balances de periodo pero no el total", async () => {
        const rules = [{
            id: "r1", ownerUserId: userId, targetType: "INSTITUTION", targetId: "inst-out",
            included: false, createdAt: "", updatedAt: "", isDeleted: false,
        }];

        const set = await buildService(rules).getBalanceSet(userId, {});

        // El gasto de 100 en el banco excluido ya no resta.
        expect(set.period.value).toBe(4800);
        // El total sigue mirando todas las cuentas.
        expect(set.total.value).toBe(1200);
        expect(set.period.excludedCount).toBe(1);
    });

    it("respeta el modo por defecto guardado", async () => {
        const service = buildService();
        (service as any).settingsRepo.getSettings.mockResolvedValue({
            ownerUserId: userId, defaultMode: "TOTAL",
        });

        expect((await service.getBalanceSet(userId, {})).defaultMode).toBe("TOTAL");
    });
});
```

- [ ] **Step 2: Correrlo para verificar que falla**

Run: `npx jest __tests__/services/balance-service.test.ts`
Expected: FAIL — `Cannot find module '@/application/services/balance-service'`

- [ ] **Step 3: Implementar el servicio**

Crea `src/application/services/balance-service.ts`:

```ts
import { UUID } from "../../domain/core";
import { FinancialTransaction } from "../../domain/entities/financial";
import { BalanceMode, DEFAULT_BALANCE_MODE } from "../../domain/entities/balance";
import {
    IFinancialTransactionRepository, IFinancialCategoryRepository,
} from "../../domain/repositories/financial";
import {
    IBankAccountRepository, IBankCardRepository, IBankMovementRepository,
    IBankAccountBalanceSnapshotRepository,
} from "../../domain/repositories/bank";
import { IBalanceSettingsRepository } from "../../domain/repositories/balance";
import { computeNetBalance, sumCreditExpenses, isIncomeType, isWithdrawalType } from "../../domain/services/financial-balance";
import { computeTotalBalance, TotalBalanceAccount } from "../../domain/services/balance-modes";
import { computeAccountBalance, computeCardDebt } from "../../domain/services/bank-balance";
import { resolveScope, BalanceScope } from "../../domain/services/balance-scope";
import { isTransactionPaidWithCredit, creditCardIdSet } from "../../lib/financial-utils";

export interface BalanceSet {
    defaultMode: BalanceMode;
    currency: string;
    total: {
        value: number;
        accountsCounted: number;
        accountsWithoutSnapshot: { id: UUID; name: string }[];
        creditDebt: number;
    };
    period: {
        value: number;
        income: number;
        expenses: number;
        savings: number;
        funding: number;
        excludedCount: number;
    };
    withCredit: {
        value: number;
        creditDeferred: number;
    };
}

/**
 * Los tres balances de una sola lectura, para que el selector de la interfaz
 * pueda cambiar de modo sin volver al servidor.
 *
 * Lee de los repositorios directamente, no de `BankService.getOverview`: ese
 * método cierra estados de cuenta vencidos como efecto secundario, y este
 * servicio se invoca desde tres pantallas en cada carga.
 */
export class BalanceService {
    constructor(
        private transactionRepo: IFinancialTransactionRepository,
        private accountRepo: IBankAccountRepository,
        private cardRepo: IBankCardRepository,
        private movementRepo: IBankMovementRepository,
        private snapshotRepo: IBankAccountBalanceSnapshotRepository,
        private categoryRepo: IFinancialCategoryRepository,
        private settingsRepo: IBalanceSettingsRepository,
    ) {}

    async getBalanceSet(
        userId: UUID,
        range: { startDate?: Date; endDate?: Date },
    ): Promise<BalanceSet> {
        const [rawTransactions, accounts, cards, movements, categories, settings, rules] =
            await Promise.all([
                this.transactionRepo.findForDashboard(userId, range),
                this.accountRepo.findByOwnerId(userId),
                this.cardRepo.findByOwnerId(userId),
                this.movementRepo.findAllForOwner(userId),
                this.categoryRepo.findAllBaseAndUser(userId),
                this.settingsRepo.getSettings(userId),
                this.settingsRepo.getRules(userId),
            ]);

        const creditCardIds = creditCardIdSet(cards);
        const transactions: FinancialTransaction[] = rawTransactions.map(t => ({
            ...t,
            paidWithCredit: isTransactionPaidWithCredit(t, creditCardIds),
        }));

        const scope = resolveScope(rules, { accounts, cards });
        const categoryNameById = new Map(categories.map(c => [c.id!, c.name]));

        return {
            defaultMode: settings?.defaultMode ?? DEFAULT_BALANCE_MODE,
            currency: "USD",
            total: await this.buildTotal(accounts, cards, movements),
            period: this.buildPeriod(transactions, categoryNameById, scope),
            withCredit: this.buildWithCredit(transactions, categoryNameById, scope),
        };
    }

    private async buildTotal(
        accounts: Awaited<ReturnType<IBankAccountRepository["findByOwnerId"]>>,
        cards: Awaited<ReturnType<IBankCardRepository["findByOwnerId"]>>,
        movements: Awaited<ReturnType<IBankMovementRepository["findAllForOwner"]>>,
    ): Promise<BalanceSet["total"]> {
        const now = new Date().toISOString();

        const resolved: TotalBalanceAccount[] = await Promise.all(accounts.map(async account => {
            const own = movements.filter(m => m.accountId === account.id);
            const snapshot = await this.snapshotRepo.findLatestForAccount(account.id, now);
            return {
                id: account.id,
                name: account.institutionName ?? account.lastFour ?? account.id,
                balance: computeAccountBalance(snapshot, own),
                hasSnapshot: snapshot !== null,
                status: account.status,
                isUnconfirmed: account.isUnconfirmed,
                isDeleted: account.isDeleted,
            };
        }));

        const total = computeTotalBalance(resolved);

        const creditDebt = cards
            .filter(c => c.cardType === "CREDIT" && !c.isUnconfirmed && !c.isDeleted)
            .reduce((sum, c) => sum + computeCardDebt(movements.filter(m => m.cardId === c.id)), 0);

        return { ...total, creditDebt: Math.round(creditDebt * 100) / 100 };
    }

    private buildPeriod(
        transactions: readonly FinancialTransaction[],
        categoryNameById: ReadonlyMap<string, string>,
        scope: BalanceScope,
    ): BalanceSet["period"] {
        const inScope = transactions.filter(t =>
            t.type === "TRANSFER" || scope.isTransactionIncluded(t));

        const income = inScope
            .filter(t => isIncomeType(t.type))
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const expenses = inScope
            .filter(t => !isIncomeType(t.type) && !isWithdrawalType(t.type) && t.type !== "TRANSFER")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const savings = inScope
            .filter(t => t.type === "TRANSFER"
                && categoryName(t, categoryNameById) === "Ahorros e Inversiones")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        const funding = inScope
            .filter(t => t.type === "TRANSFER"
                && categoryName(t, categoryNameById) === "Fondeo ingresos")
            .reduce((sum, t) => sum + Number(t.amount), 0);

        return {
            value: computeNetBalance(transactions, categoryNameById, scope),
            income: round2(income),
            expenses: round2(expenses),
            savings: round2(savings),
            funding: round2(funding),
            excludedCount: transactions.length - inScope.length,
        };
    }

    private buildWithCredit(
        transactions: readonly FinancialTransaction[],
        categoryNameById: ReadonlyMap<string, string>,
        scope: BalanceScope,
    ): BalanceSet["withCredit"] {
        const period = computeNetBalance(transactions, categoryNameById, scope);
        const creditDeferred = sumCreditExpenses(transactions, scope);
        return {
            value: round2(period - creditDeferred),
            creditDeferred,
        };
    }
}

function categoryName(
    t: FinancialTransaction,
    categoryNameById: ReadonlyMap<string, string>,
): string | undefined {
    return t.categoryName ?? (t.categoryId ? categoryNameById.get(t.categoryId) : undefined);
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}
```

- [ ] **Step 4: Correr el test**

Run: `npx jest __tests__/services/balance-service.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Cablear el singleton**

En `src/infrastructure/container.ts`, junto a `financialDashboardService`, añade:

```ts
export const balanceService = new BalanceService(
    financialTransactionRepository,
    bankAccountRepository,
    bankCardRepository,
    bankMovementRepository,
    bankSnapshotRepository,
    financialCategoryRepository,
    balanceSettingsRepository,
);
```

Con su import de `@/application/services/balance-service`. Usa los nombres de singleton ya existentes en el archivo; si alguno difiere (por ejemplo `bankSnapshotRepository`), respeta el que esté declarado.

- [ ] **Step 6: Verificar tipos y commitear**

Run: `npx tsc --noEmit 2>&1 | grep "^src/"`
Expected: sin salida.

```bash
git add src/application/services/balance-service.ts src/infrastructure/container.ts __tests__/services/balance-service.test.ts
git commit -m "feat(financial): add BalanceService composing the three balance modes"
```

---

### Task 6: Server actions

**Files:**
- Create: `src/app/actions/balance.ts`
- Create: `src/lib/validators/balance-schemas.ts`
- Test: `__tests__/services/balance-actions.test.ts`

**Interfaces:**
- Consumes: `balanceService` y `balanceSettingsRepository` del contenedor (Tasks 4 y 5).
- Produces: `getBalanceSetAction`, `getBalanceScopeAction`, `setBalanceDefaultModeAction`, `setBalanceScopeRuleAction`, `clearBalanceScopeAction`. Todas devuelven `{ success: true, data }` o `{ success: false, error }`, nunca lanzan al cliente.

- [ ] **Step 1: Crear los esquemas Zod**

Crea `src/lib/validators/balance-schemas.ts`:

```ts
import { z } from "zod";

export const balanceModeSchema = z.enum(['TOTAL', 'PERIOD', 'PERIOD_WITH_CREDIT']);

export const balanceRangeSchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const balanceScopeRuleSchema = z.object({
    targetType: z.enum(['INSTITUTION', 'ACCOUNT', 'CARD']),
    targetId: z.string().uuid(),
    included: z.boolean(),
    /** Ids de cuentas y tarjetas del banco, para limpiar sus excepciones. */
    clearTargetIds: z.array(z.string().uuid()).optional(),
});
```

- [ ] **Step 2: Escribir el test que falla**

Crea `__tests__/services/balance-actions.test.ts`:

```ts
jest.mock("@/infrastructure/supabase/auth-user", () => ({
    requireUserId: jest.fn().mockResolvedValue("user-1"),
}));

jest.mock("@/infrastructure/container", () => ({
    balanceService: { getBalanceSet: jest.fn() },
    balanceSettingsRepository: {
        setDefaultMode: jest.fn(),
        setRule: jest.fn(),
        clearRulesForTargets: jest.fn(),
        clearRules: jest.fn(),
        getRules: jest.fn(),
        getSettings: jest.fn(),
    },
}));

import { balanceService, balanceSettingsRepository } from "@/infrastructure/container";
import {
    getBalanceSetAction, setBalanceDefaultModeAction, setBalanceScopeRuleAction,
} from "@/app/actions/balance";

describe("balance actions", () => {
    beforeEach(() => jest.clearAllMocks());

    it("devuelve el conjunto de balances", async () => {
        (balanceService.getBalanceSet as jest.Mock).mockResolvedValue({ defaultMode: "PERIOD" });

        const result = await getBalanceSetAction();

        expect(result).toEqual({ success: true, data: { defaultMode: "PERIOD" } });
    });

    it("no lanza al cliente cuando el servicio falla", async () => {
        (balanceService.getBalanceSet as jest.Mock).mockRejectedValue(new Error("boom"));

        const result = await getBalanceSetAction();

        expect(result.success).toBe(false);
        expect(result).toHaveProperty("error", "boom");
    });

    it("rechaza un modo inválido", async () => {
        const result = await setBalanceDefaultModeAction("NOPE");

        expect(result.success).toBe(false);
        expect(balanceSettingsRepository.setDefaultMode).not.toHaveBeenCalled();
    });

    it("guarda el modo por defecto válido", async () => {
        (balanceSettingsRepository.setDefaultMode as jest.Mock).mockResolvedValue({
            ownerUserId: "user-1", defaultMode: "TOTAL",
        });

        const result = await setBalanceDefaultModeAction("TOTAL");

        expect(result.success).toBe(true);
        expect(balanceSettingsRepository.setDefaultMode).toHaveBeenCalledWith("user-1", "TOTAL");
    });

    it("al guardar la regla de un banco limpia las excepciones de dentro", async () => {
        (balanceSettingsRepository.setRule as jest.Mock).mockResolvedValue({});

        await setBalanceScopeRuleAction({
            targetType: "INSTITUTION",
            targetId: "11111111-1111-4111-8111-111111111111",
            included: false,
            clearTargetIds: ["22222222-2222-4222-8222-222222222222"],
        });

        expect(balanceSettingsRepository.clearRulesForTargets).toHaveBeenCalledWith(
            "user-1", ["22222222-2222-4222-8222-222222222222"],
        );
    });
});
```

- [ ] **Step 3: Correrlo para verificar que falla**

Run: `npx jest __tests__/services/balance-actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/actions/balance'`

- [ ] **Step 4: Implementar las actions**

Crea `src/app/actions/balance.ts`:

```ts
"use server";

import { z } from "zod";
import { balanceService, balanceSettingsRepository } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import {
    balanceModeSchema, balanceRangeSchema, balanceScopeRuleSchema,
} from "@/lib/validators/balance-schemas";

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

function fail(error: unknown) {
    if (error instanceof z.ZodError) {
        return { success: false as const, error: `Validation failed: ${formatZodError(error)}` };
    }
    return { success: false as const, error: (error as Error).message };
}

/** Los tres balances de una sola vez: el selector no vuelve al servidor. */
export async function getBalanceSetAction(startDate?: string, endDate?: string) {
    try {
        const range = balanceRangeSchema.parse({ startDate, endDate });
        const userId = await requireUserId();

        const data = await balanceService.getBalanceSet(userId, {
            startDate: range.startDate ? new Date(range.startDate) : undefined,
            endDate: range.endDate ? new Date(range.endDate) : undefined,
        });
        return { success: true as const, data };
    } catch (error) {
        console.error("Error fetching balance set:", error);
        return fail(error);
    }
}

/** Modo por defecto y excepciones guardadas, para la pantalla de ajustes. */
export async function getBalanceScopeAction() {
    try {
        const userId = await requireUserId();
        const [settings, rules] = await Promise.all([
            balanceSettingsRepository.getSettings(userId),
            balanceSettingsRepository.getRules(userId),
        ]);
        return { success: true as const, data: { settings, rules } };
    } catch (error) {
        console.error("Error fetching balance scope:", error);
        return fail(error);
    }
}

export async function setBalanceDefaultModeAction(mode: string) {
    try {
        const validated = balanceModeSchema.parse(mode);
        const userId = await requireUserId();
        const data = await balanceSettingsRepository.setDefaultMode(userId, validated);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error saving default balance mode:", error);
        return fail(error);
    }
}

/**
 * Guarda una excepción. Al alternar un banco entero, `clearTargetIds` trae los
 * ids de sus cuentas y tarjetas: sus excepciones se borran para que el banco
 * quede limpio. Si no, arrastraría excepciones que la interfaz ya no muestra.
 */
export async function setBalanceScopeRuleAction(input: unknown) {
    try {
        const validated = balanceScopeRuleSchema.parse(input);
        const userId = await requireUserId();

        if (validated.clearTargetIds?.length) {
            await balanceSettingsRepository.clearRulesForTargets(userId, validated.clearTargetIds);
        }

        const data = await balanceSettingsRepository.setRule(
            userId, validated.targetType, validated.targetId, validated.included,
        );
        return { success: true as const, data };
    } catch (error) {
        console.error("Error saving balance scope rule:", error);
        return fail(error);
    }
}

export async function clearBalanceScopeAction() {
    try {
        const userId = await requireUserId();
        await balanceSettingsRepository.clearRules(userId);
        return { success: true as const, data: null };
    } catch (error) {
        console.error("Error clearing balance scope:", error);
        return fail(error);
    }
}
```

- [ ] **Step 5: Correr el test**

Run: `npx jest __tests__/services/balance-actions.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/balance.ts src/lib/validators/balance-schemas.ts __tests__/services/balance-actions.test.ts
git commit -m "feat(financial): add balance server actions"
```

---

### Task 7: El selector `BalanceModeSwitch`

**Files:**
- Create: `src/presentation/financial/components/BalanceModeSwitch.tsx`
- Test: `__tests__/components/balance-mode-switch.test.tsx`

**Interfaces:**
- Consumes: `BalanceSet` de `@/application/services/balance-service`, `BalanceMode` de `@/domain/entities/balance`.
- Produces: `<BalanceModeSwitch balances mode onModeChange size currency />`, y la función pura `balanceModeCopy(mode, balances, rangeLabel)` que produce el título y la explicación de cada modo.

El componente es controlado: recibe `mode` y `onModeChange`. Quien lo usa arranca su estado en `balances.defaultMode`.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/components/balance-mode-switch.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { BalanceModeSwitch } from "@/presentation/financial/components/BalanceModeSwitch";
import type { BalanceSet } from "@/application/services/balance-service";
import type { BalanceMode } from "@/domain/entities/balance";

const balances: BalanceSet = {
    defaultMode: "PERIOD",
    currency: "USD",
    total: { value: 4812.3, accountsCounted: 6, accountsWithoutSnapshot: [{ id: "a", name: "Austro" }], creditDebt: 371.26 },
    period: { value: 4709.46, income: 5000, expenses: 290.54, savings: 0, funding: 0, excludedCount: 0 },
    withCredit: { value: 4510.77, creditDeferred: 198.69 },
};

function Harness({ initial = "PERIOD" as BalanceMode }) {
    const [mode, setMode] = useState<BalanceMode>(initial);
    return (
        <BalanceModeSwitch
            balances={balances}
            mode={mode}
            onModeChange={setMode}
            rangeLabel="22 ago – 21 sep"
        />
    );
}

describe("BalanceModeSwitch", () => {
    it("muestra la etiqueta del modo activo", () => {
        render(<Harness />);

        expect(screen.getByRole("button", { name: /balance del periodo/i })).toBeInTheDocument();
    });

    it("al abrirlo lista los tres balances con su valor", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: /balance del periodo/i }));

        expect(screen.getByText("$4.812,30")).toBeInTheDocument();
        expect(screen.getByText("$4.709,46")).toBeInTheDocument();
        expect(screen.getByText("$4.510,77")).toBeInTheDocument();
    });

    it("explica cada cálculo", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: /balance del periodo/i }));

        expect(screen.getByText(/6 cuentas con saldo declarado/i)).toBeInTheDocument();
        expect(screen.getByText(/22 ago – 21 sep/i)).toBeInTheDocument();
        expect(screen.getByText(/\$198,69/)).toBeInTheDocument();
    });

    it("elegir otro modo lo comunica y cierra el panel", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: /balance del periodo/i }));
        fireEvent.click(screen.getByRole("menuitemradio", { name: /con tarjetas/i }));

        expect(screen.getByRole("button", { name: /balance con tarjetas/i })).toBeInTheDocument();
    });

    it("en modo total avisa de las cuentas sin saldo declarado", () => {
        render(<Harness initial="TOTAL" />);

        expect(screen.getByText(/1 cuenta sin saldo declarado/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correrlo para verificar que falla**

Run: `npx jest __tests__/components/balance-mode-switch.test.tsx`
Expected: FAIL — `Cannot find module '@/presentation/financial/components/BalanceModeSwitch'`

- [ ] **Step 3: Implementar el componente**

Crea `src/presentation/financial/components/BalanceModeSwitch.tsx`. Usa `DropdownMenu` de `@/components/ui/dropdown-menu` con `DropdownMenuRadioGroup` y `DropdownMenuRadioItem` (dan el rol `menuitemradio` que el test espera). Si ese primitivo no existe todavía en `src/components/ui/`, añádelo con `npx shadcn@latest add dropdown-menu` antes de seguir.

```tsx
"use client";

import { ChevronDown, AlertCircle } from "lucide-react";
import type { BalanceSet } from "@/application/services/balance-service";
import { type BalanceMode, BALANCE_MODES } from "@/domain/entities/balance";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
    DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat("es-EC", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

const MODE_LABEL: Record<BalanceMode, string> = {
    TOTAL: "Balance total",
    PERIOD: "Balance del periodo",
    PERIOD_WITH_CREDIT: "Balance con tarjetas",
};

const MODE_SHORT: Record<BalanceMode, string> = {
    TOTAL: "Total",
    PERIOD: "Del periodo",
    PERIOD_WITH_CREDIT: "Con tarjetas",
};

/** El valor que le toca a cada modo, para pintarlo y para el resumen. */
export function balanceValue(balances: BalanceSet, mode: BalanceMode): number {
    if (mode === "TOTAL") return balances.total.value;
    if (mode === "PERIOD_WITH_CREDIT") return balances.withCredit.value;
    return balances.period.value;
}

/** La línea que explica de dónde sale el número de cada modo. */
export function balanceModeCopy(
    mode: BalanceMode,
    balances: BalanceSet,
    rangeLabel: string,
): string {
    const money = (v: number) => formatCurrency(v, balances.currency);

    if (mode === "TOTAL") {
        return `Suma de los saldos de tus ${balances.total.accountsCounted} cuentas con saldo declarado. No depende del rango ni de tu configuración.`;
    }
    if (mode === "PERIOD") {
        return `Ingresos menos gastos reales del ${rangeLabel}, restando ahorros y sumando fondeos. Los consumos con tarjeta no cuentan hasta que pagas.`;
    }
    return `Igual que el del periodo, restando además ${money(balances.withCredit.creditDeferred)} de consumos con tarjeta del ${rangeLabel}.`;
}

interface BalanceModeSwitchProps {
    balances: BalanceSet;
    mode: BalanceMode;
    onModeChange: (mode: BalanceMode) => void;
    /** Etiqueta legible del rango activo, p. ej. "22 ago – 21 sep". */
    rangeLabel: string;
    size?: "hero" | "compact";
    className?: string;
}

/**
 * La etiqueta del balance ES el control. Un solo gesto cubre las tres cosas:
 * cambiar de balance, explicar el cálculo, y ver los tres números a la vez —
 * que es lo que uno quiere cuando duda de una cifra.
 */
export function BalanceModeSwitch({
    balances, mode, onModeChange, rangeLabel, size = "hero", className,
}: BalanceModeSwitchProps) {
    const missing = balances.total.accountsWithoutSnapshot.length;

    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger
                    className={cn(
                        "flex w-fit items-center gap-1 rounded-lg font-medium transition-colors hover:text-text-primary",
                        size === "hero" ? "text-sm text-white/85" : "text-xs text-text-secondary",
                    )}
                >
                    {MODE_LABEL[mode]}
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(next) => onModeChange(next as BalanceMode)}
                    >
                        {BALANCE_MODES.map((option) => (
                            <DropdownMenuRadioItem
                                key={option}
                                value={option}
                                className="flex-col items-start gap-1 py-2.5"
                            >
                                <span className="flex w-full items-baseline justify-between gap-3">
                                    <span className="font-medium">{MODE_SHORT[option]}</span>
                                    <span className="tabular-nums font-semibold">
                                        {formatCurrency(balanceValue(balances, option), balances.currency)}
                                    </span>
                                </span>
                                <span className="text-xs leading-snug text-text-secondary">
                                    {balanceModeCopy(option, balances, rangeLabel)}
                                </span>
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>

            {mode === "TOTAL" && missing > 0 && (
                <a
                    href="/financial/balances"
                    className="flex w-fit items-center gap-1.5 text-[11px] font-medium text-amber-500 hover:underline"
                >
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {missing === 1
                        ? "1 cuenta sin saldo declarado"
                        : `${missing} cuentas sin saldo declarado`}
                </a>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Correr el test**

Run: `npx jest __tests__/components/balance-mode-switch.test.tsx`
Expected: PASS — 5 tests

Si el formato de moneda no coincide, comprueba el valor real con
`node -e "console.log(new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(4812.3))"` y ajusta el **test**, no el componente: el formato lo decide el entorno.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/financial/components/BalanceModeSwitch.tsx __tests__/components/balance-mode-switch.test.tsx
git commit -m "feat(financial): add balance mode switch with per-mode explanations"
```

---

### Task 8: Conectar el selector a las tres pantallas

**Files:**
- Modify: `src/presentation/financial/components/BalanceHeroCard.tsx`
- Modify: `src/presentation/financial/components/FinancialDashboard.tsx`
- Modify: `src/presentation/financial/components/TransactionSummary.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/presentation/components/dashboard/HomeDesktop.tsx`
- Modify: `src/presentation/components/dashboard/HomeMobile.tsx`
- Test: `__tests__/components/transaction-summary.test.tsx` (ampliar)

**Interfaces:**
- Consumes: `BalanceModeSwitch`, `balanceValue` (Task 7); `getBalanceSetAction` (Task 6).
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Cargar el `BalanceSet` en el resumen financiero**

En `FinancialDashboard.tsx`, junto a `useFinancialDashboard`, añade estado para los balances y el modo:

```tsx
const [balances, setBalances] = useState<BalanceSet | null>(null);
const [balanceMode, setBalanceMode] = useState<BalanceMode | null>(null);

useEffect(() => {
    let cancelled = false;
    getBalanceSetAction(startDate, endDate).then((result) => {
        if (cancelled || !result.success) return;
        setBalances(result.data);
        // Arranca siempre en el modo por defecto de ajustes: la elección no se
        // recuerda entre cargas, a propósito.
        setBalanceMode((current) => current ?? result.data.defaultMode);
    });
    return () => { cancelled = true; };
}, [startDate, endDate]);
```

El `refresh` de tiempo real ya existente debe volver a pedir los balances: añade la misma llamada dentro del `onChange` de `useFinancialRealtime`.

- [ ] **Step 2: Pasar el balance elegido al hero**

`BalanceHeroCard` deja de recibir `value` y `negative` calculados desde `kpis` y pasa a recibir el nodo del selector. Cambia su interfaz:

```tsx
interface BalanceHeroCardProps {
    value: string;
    negative: boolean;
    creditSpent: number;
    onDetails?: () => void;
    /** El selector de balance; sustituye al rótulo fijo "Balance actual". */
    modeSwitch?: React.ReactNode;
}
```

Dentro, reemplaza el párrafo fijo:

```tsx
<p className="text-sm font-medium text-white/85">
    Balance actual
</p>
```

por:

```tsx
{modeSwitch ?? <p className="text-sm font-medium text-white/85">Balance actual</p>}
```

Y en `FinancialDashboard.tsx`, al renderizarlo:

```tsx
<BalanceHeroCard
    value={`${activeBalance >= 0 ? "+" : "-"}${formatCurrency(activeBalance)}`}
    negative={activeBalance < 0}
    creditSpent={balances?.total.creditDebt ?? 0}
    onDetails={rawKpis ? () => setOpenKpiModal("balance") : undefined}
    modeSwitch={balances && balanceMode ? (
        <BalanceModeSwitch
            balances={balances}
            mode={balanceMode}
            onModeChange={setBalanceMode}
            rangeLabel={formatRangeLabel(filterType, startDate, endDate)}
            size="hero"
        />
    ) : undefined}
/>
```

donde `activeBalance` se calcula con:

```tsx
const activeBalance = balances && balanceMode
    ? balanceValue(balances, balanceMode)
    : (kpis?.netBalance ?? 0);
```

Mientras los balances aún no han cargado se sigue mostrando `netBalance`, así que no hay parpadeo de "0,00".

- [ ] **Step 3: Añadir el selector al resumen del listado**

`TransactionSummary` recibe hoy solo `transactions`. Amplía sus props:

```tsx
interface TransactionSummaryProps {
    transactions: FinancialTransaction[];
    balances?: BalanceSet | null;
    rangeLabel?: string;
}
```

Cuando `balances` viene, el chip "Balance" muestra `balanceValue(balances, mode)` y la etiqueta del chip pasa a ser el `BalanceModeSwitch` en tamaño `compact`; cuando no viene, se conserva el cálculo local actual. El estado del modo vive en el componente y arranca en `balances.defaultMode`.

La página `src/app/financial/transactions/page.tsx` pasa el `BalanceSet` obtenido con `getBalanceSetAction(dateFrom, dateTo)` junto a las transacciones.

- [ ] **Step 4: Ampliar el test del resumen del listado**

Añade a `__tests__/components/transaction-summary.test.tsx`:

```tsx
it("sin balances sigue calculando el balance localmente", () => {
    render(<TransactionSummary transactions={[
        { ...base, id: "1", type: "INCOME", amount: 1000, status: "CONFIRMED" },
        { ...base, id: "2", amount: 100, status: "MANUAL" },
    ]} />);

    expect(screen.getAllByText("+$900,00").length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Sustituir las dos tarjetas del home por una con selector**

En `src/app/dashboard/page.tsx`, añade el `BalanceSet` a las métricas que devuelve el cargador y retira `totalBalance` de lo que consumen `HomeDesktop` y `HomeMobile`. La tarjeta que hoy pinta `monthNet` pasa a pintar el balance elegido y lleva el `BalanceModeSwitch` en tamaño `compact` como etiqueta. La tarjeta de `totalBalance` se elimina: el Total ya es una de las tres opciones y tenerlo dos veces en la misma pantalla se contradice.

- [ ] **Step 6: Correr la suite completa**

Run: `npx jest`
Expected: PASS — todo verde.

Run: `npx tsc --noEmit 2>&1 | grep "^src/"`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add src/presentation src/app __tests__/components/transaction-summary.test.tsx
git commit -m "feat(financial): wire the balance mode switch into every balance surface"
```

---

### Task 9: Pestaña "Balances" en ajustes

**Files:**
- Create: `src/presentation/financial/components/settings/BalanceScopeManager.tsx`
- Modify: `src/presentation/financial/components/settings/SettingsDashboard.tsx`
- Modify: `src/app/financial/settings/page.tsx`
- Test: `__tests__/components/balance-scope-manager.test.tsx`

**Interfaces:**
- Consumes: `getBalanceScopeAction`, `setBalanceDefaultModeAction`, `setBalanceScopeRuleAction`, `clearBalanceScopeAction` (Task 6); `resolveScope` (Task 1).
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/components/balance-scope-manager.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BalanceScopeManager } from "@/presentation/financial/components/settings/BalanceScopeManager";

jest.mock("@/app/actions/balance", () => ({
    setBalanceDefaultModeAction: jest.fn().mockResolvedValue({ success: true, data: {} }),
    setBalanceScopeRuleAction: jest.fn().mockResolvedValue({ success: true, data: {} }),
    clearBalanceScopeAction: jest.fn().mockResolvedValue({ success: true, data: null }),
}));

import { setBalanceScopeRuleAction } from "@/app/actions/balance";

const institutions = [{ id: "inst-1", name: "Pichincha" }];
const accounts = [
    { id: "acc-1", institutionId: "inst-1", label: "Ahorros ••1234" },
    { id: "acc-2", institutionId: "inst-1", label: "Corriente ••5678" },
];
const cards = [{ id: "card-1", institutionId: "inst-1", label: "Visa ••9620" }];

describe("BalanceScopeManager", () => {
    beforeEach(() => jest.clearAllMocks());

    it("sin reglas muestra el banco como incluido entero", () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        expect(screen.getByText(/Pichincha/)).toBeInTheDocument();
        expect(screen.getByText(/3 de 3 incluidas/i)).toBeInTheDocument();
    });

    it("con una excepción muestra el banco como parcial", () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[{
                    id: "r1", ownerUserId: "u", targetType: "ACCOUNT", targetId: "acc-2",
                    included: false, createdAt: "", updatedAt: "", isDeleted: false,
                }]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        expect(screen.getByText(/2 de 3 incluidas/i)).toBeInTheDocument();
    });

    it("alternar el banco limpia las excepciones de dentro", async () => {
        render(
            <BalanceScopeManager
                defaultMode="PERIOD"
                initialRules={[{
                    id: "r1", ownerUserId: "u", targetType: "ACCOUNT", targetId: "acc-2",
                    included: false, createdAt: "", updatedAt: "", isDeleted: false,
                }]}
                institutions={institutions}
                accounts={accounts}
                cards={cards}
            />,
        );

        fireEvent.click(screen.getByRole("checkbox", { name: /Pichincha/i }));

        await waitFor(() => {
            expect(setBalanceScopeRuleAction).toHaveBeenCalledWith(expect.objectContaining({
                targetType: "INSTITUTION",
                targetId: "inst-1",
                included: false,
                clearTargetIds: expect.arrayContaining(["acc-1", "acc-2", "card-1"]),
            }));
        });
    });
});
```

- [ ] **Step 2: Correrlo para verificar que falla**

Run: `npx jest __tests__/components/balance-scope-manager.test.tsx`
Expected: FAIL — `Cannot find module '.../BalanceScopeManager'`

- [ ] **Step 3: Implementar el gestor**

Crea `src/presentation/financial/components/settings/BalanceScopeManager.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { BalanceMode, BalanceScopeRule, BalanceScopeTargetType } from "@/domain/entities/balance";
import { BALANCE_MODES } from "@/domain/entities/balance";
import { resolveScope } from "@/domain/services/balance-scope";
import {
    setBalanceDefaultModeAction, setBalanceScopeRuleAction, clearBalanceScopeAction,
} from "@/app/actions/balance";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<BalanceMode, string> = {
    TOTAL: "Total",
    PERIOD: "Del periodo",
    PERIOD_WITH_CREDIT: "Con tarjetas",
};

const MODE_HINT: Record<BalanceMode, string> = {
    TOTAL: "Suma de los saldos de tus cuentas con saldo declarado. No depende del rango ni de esta configuración.",
    PERIOD: "Ingresos menos gastos reales del rango, restando ahorros y sumando fondeos. Los consumos con tarjeta no cuentan hasta que pagas.",
    PERIOD_WITH_CREDIT: "Igual que el del periodo, restando además los consumos con tarjeta del rango.",
};

interface ScopeItem {
    id: string;
    institutionId: string | null;
    label: string;
}

interface BalanceScopeManagerProps {
    defaultMode: BalanceMode;
    initialRules: BalanceScopeRule[];
    institutions: { id: string; name: string }[];
    accounts: ScopeItem[];
    cards: ScopeItem[];
}

/**
 * Qué bancos, cuentas y tarjetas alimentan los balances de periodo.
 *
 * Guarda solo excepciones: un banco sin regla está incluido y sus cuentas
 * heredan, así que una cuenta que el escáner cree mañana entra sola.
 */
export function BalanceScopeManager({
    defaultMode, initialRules, institutions, accounts, cards,
}: BalanceScopeManagerProps) {
    const [mode, setMode] = useState<BalanceMode>(defaultMode);
    const [rules, setRules] = useState<BalanceScopeRule[]>(initialRules);
    const [expanded, setExpanded] = useState<string | null>(null);

    const scope = useMemo(() => resolveScope(rules, { accounts, cards }), [rules, accounts, cards]);

    const itemsOf = (institutionId: string): ScopeItem[] => [
        ...accounts.filter(a => a.institutionId === institutionId),
        ...cards.filter(c => c.institutionId === institutionId),
    ];

    /** Estado local optimista; si la action falla, se revierte. */
    async function applyRule(
        targetType: BalanceScopeTargetType,
        targetId: string,
        included: boolean,
        clearTargetIds?: string[],
    ) {
        const previous = rules;
        const now = new Date().toISOString();
        const dropped = new Set(clearTargetIds ?? []);

        setRules([
            ...rules.filter(r => !dropped.has(r.targetId) && !(r.targetType === targetType && r.targetId === targetId)),
            {
                id: `${targetType}:${targetId}`,
                ownerUserId: "",
                targetType,
                targetId,
                included,
                createdAt: now,
                updatedAt: now,
                isDeleted: false,
            },
        ]);

        const result = await setBalanceScopeRuleAction({ targetType, targetId, included, clearTargetIds });
        if (!result.success) setRules(previous);
    }

    async function changeMode(next: BalanceMode) {
        const previous = mode;
        setMode(next);
        const result = await setBalanceDefaultModeAction(next);
        if (!result.success) setMode(previous);
    }

    async function reset() {
        const previous = rules;
        setRules([]);
        const result = await clearBalanceScopeAction();
        if (!result.success) setRules(previous);
    }

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">Balance por defecto</h3>
                <p className="text-xs text-text-secondary">
                    El que aparece al abrir cada pantalla. Siempre puedes cambiarlo desde el propio balance.
                </p>
                <div className="space-y-2">
                    {BALANCE_MODES.map((option) => (
                        <label
                            key={option}
                            className={cn(
                                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                                mode === option
                                    ? "border-accent-primary/50 bg-accent-primary/5"
                                    : "border-border/40 bg-bg-secondary/40 hover:bg-bg-hover",
                            )}
                        >
                            <input
                                type="radio"
                                name="default-balance-mode"
                                value={option}
                                checked={mode === option}
                                onChange={() => changeMode(option)}
                                className="mt-1 shrink-0"
                            />
                            <span className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium text-text-primary">{MODE_LABEL[option]}</span>
                                <span className="text-xs leading-snug text-text-secondary">{MODE_HINT[option]}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-text-primary">Qué entra en el balance</h3>
                        <p className="text-xs text-text-secondary">
                            Aplica al balance del periodo y al de tarjetas. El total siempre suma todo.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={reset} className="shrink-0 gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restablecer
                    </Button>
                </div>

                <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
                    {institutions.map((institution) => {
                        const items = itemsOf(institution.id);
                        const includedCount = items.filter(i => scope.isAccountIncluded(i.id)).length;
                        const allIn = includedCount === items.length;
                        const noneIn = includedCount === 0;
                        const isOpen = expanded === institution.id;

                        return (
                            <li key={institution.id}>
                                <div className="flex items-center gap-3 p-3">
                                    <Checkbox
                                        aria-label={institution.name}
                                        checked={allIn ? true : noneIn ? false : "indeterminate"}
                                        onCheckedChange={() => applyRule(
                                            "INSTITUTION",
                                            institution.id,
                                            // Parcial o excluido pasa a incluido entero.
                                            !allIn,
                                            items.map(i => i.id),
                                        )}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(isOpen ? null : institution.id)}
                                        className="flex flex-1 items-center justify-between gap-2 text-left"
                                    >
                                        <span className="flex flex-col">
                                            <span className="text-sm font-medium text-text-primary">{institution.name}</span>
                                            <span className="text-xs text-text-secondary">
                                                {includedCount} de {items.length} incluidas
                                            </span>
                                        </span>
                                        <ChevronDown
                                            className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>

                                {isOpen && (
                                    <ul className="space-y-1 border-t border-border/30 bg-bg-secondary/30 p-3 pl-10">
                                        {items.map((item) => (
                                            <li key={item.id} className="flex items-center gap-3">
                                                <Checkbox
                                                    aria-label={item.label}
                                                    checked={scope.isAccountIncluded(item.id)}
                                                    onCheckedChange={(checked) => applyRule(
                                                        cards.some(c => c.id === item.id) ? "CARD" : "ACCOUNT",
                                                        item.id,
                                                        checked === true,
                                                    )}
                                                />
                                                <span className="text-sm text-text-primary">{item.label}</span>
                                            </li>
                                        ))}
                                        {items.length === 0 && (
                                            <li className="text-xs text-text-secondary">
                                                Este banco todavía no tiene cuentas ni tarjetas.
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}
```

Si `src/components/ui/checkbox.tsx` no existe todavía, añádelo antes con `npx shadcn@latest add checkbox`: es el primitivo que da el `role="checkbox"` con el tercer estado `indeterminate` que el test comprueba.

`scope.isAccountIncluded` e `isCardIncluded` son la misma función en el `BalanceScope` resuelto, así que usar la primera con ids de tarjeta es correcto; el `targetType` que se guarda sí distingue, porque la tabla lo usa en su clave única.

- [ ] **Step 4: Añadir la pestaña**

En `SettingsDashboard.tsx`, cambia `grid-cols-2` por `grid-cols-3` en el `TabsList`, añade el `TabsTrigger` con `value="balances"` e icono `Scale` de `lucide-react`, y el `TabsContent` correspondiente que renderiza `<BalanceScopeManager />`. Amplía `SettingsDashboardProps` con los datos que el gestor necesita.

`src/app/financial/settings/page.tsx` los carga en paralelo con lo que ya pide, usando `getBalanceScopeAction` y las actions de bancos que ya existen para instituciones, cuentas y tarjetas.

- [ ] **Step 5: Correr los tests**

Run: `npx jest __tests__/components/balance-scope-manager.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 6: Commit**

```bash
git add src/presentation/financial/components/settings src/app/financial/settings/page.tsx __tests__/components/balance-scope-manager.test.tsx
git commit -m "feat(financial): add balance scope settings tab"
```

---

### Task 10: Retirar el toggle "Incluir TC"

**Files:**
- Modify: `src/presentation/financial/components/FinancialDashboard.tsx`
- Modify: `src/presentation/financial/components/QuickSummary.tsx`
- Modify: `src/presentation/financial/components/TransactionSummary.tsx`
- Delete: `src/presentation/financial/components/CreditToggle.tsx`
- Modify: `src/presentation/financial/lib/credit-toggle.ts`
- Modify: `__tests__/lib/credit-toggle.test.ts`
- Test: `__tests__/integration/balance-parity.test.ts` (crear)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

Pasar de PERIODO a CON TARJETAS es el mismo gesto que hacía el toggle. Mantener los dos controles dejaría dos formas de expresar lo mismo, y la posibilidad de contradecirse.

- [ ] **Step 1: Escribir el test de paridad**

Crea `__tests__/integration/balance-parity.test.ts`:

```ts
import { BalanceService } from "@/application/services/balance-service";
import { FinancialDashboardService } from "@/application/services/financial-dashboard-service";
import type { FinancialTransaction } from "@/domain/entities/financial";

/**
 * Sin ninguna regla de alcance, el balance del periodo tiene que dar
 * exactamente el `netBalance` que la app mostraba antes de este trabajo. Es la
 * red que garantiza que configurar nada no mueve ningún número.
 */
describe("paridad entre BalanceService y los KPIs del dashboard", () => {
    const userId = "user-1";

    const base: Omit<FinancialTransaction, "id"> = {
        ownerUserId: userId,
        amount: 0,
        currency: "USD",
        date: "2026-08-23T10:00:00Z",
        type: "EXPENSE",
        status: "CONFIRMED",
        categoryId: null,
        institutionId: null,
        merchant: "Test",
        description: "Test",
        notes: null,
        possibleDuplicate: false,
        isDeleted: false,
        tags: [],
        createdAt: "2026-08-23T10:00:00Z",
        updatedAt: "2026-08-23T10:00:00Z",
    };

    const transactions: FinancialTransaction[] = [
        { ...base, id: "1", type: "INCOME", amount: 5000, bankDestinationAccountId: "acc-1" },
        { ...base, id: "2", amount: 236.4, bankSourceAccountId: "acc-1", description: "Pago de tarjeta de crédito" },
        { ...base, id: "3", amount: 42.15, bankSourceAccountId: "acc-1" },
        { ...base, id: "4", amount: 186.5, paidWithCredit: true, bankCardId: "card-1" },
        { ...base, id: "5", type: "WITHDRAWAL", amount: 100, bankSourceAccountId: "acc-1" },
    ];

    const accounts = [{ id: "acc-1", institutionId: "inst-1", accountType: "SAVINGS", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" }];
    const cards = [{ id: "card-1", institutionId: "inst-1", cardType: "CREDIT", status: "ACTIVE", isUnconfirmed: false, isDeleted: false, ownerUserId: userId, currency: "USD", createdAt: "", updatedAt: "" }];

    it("el balance del periodo iguala al netBalance de los KPIs", async () => {
        const transactionRepo = {
            findForDashboard: jest.fn().mockResolvedValue(transactions),
            findByOwnerId: jest.fn().mockResolvedValue(transactions),
        } as any;
        const categoryRepo = { findAllBaseAndUser: jest.fn().mockResolvedValue([]) } as any;
        const cardRepo = { findByOwnerId: jest.fn().mockResolvedValue(cards) } as any;

        const dashboard = new FinancialDashboardService(
            transactionRepo, categoryRepo,
            { findByOwnerId: jest.fn().mockResolvedValue([]) } as any,
            undefined, cardRepo,
        );
        const balance = new BalanceService(
            transactionRepo,
            { findByOwnerId: jest.fn().mockResolvedValue(accounts) } as any,
            cardRepo,
            { findAllForOwner: jest.fn().mockResolvedValue([]) } as any,
            { findLatestForAccount: jest.fn().mockResolvedValue(null) } as any,
            categoryRepo,
            { getSettings: jest.fn().mockResolvedValue(null), getRules: jest.fn().mockResolvedValue([]) } as any,
        );

        const kpis = await dashboard.getKPIs(userId);
        const set = await balance.getBalanceSet(userId, {});

        expect(set.period.value).toBe(kpis.netBalance);
        expect(set.withCredit.value).toBe(kpis.netBalance - kpis.totalExpensesCredit);
    });
});
```

- [ ] **Step 2: Correrlo**

Run: `npx jest __tests__/integration/balance-parity.test.ts`
Expected: PASS. Si falla, el `BalanceService` diverge del cálculo histórico: arréglalo antes de continuar. No ajustes el test.

- [ ] **Step 3: Retirar el toggle del resumen financiero**

En `FinancialDashboard.tsx`, borra el estado `showCredit` y su uso: `kpis` pasa a ser `rawKpis` sin transformar, y `categoryBreakdown`, `institutionBreakdown` y `dailyBreakdown` pasan a usar siempre la variante sin crédito (`excludeCreditFrom*`), que es el comportamiento por defecto de hoy. Quita las props `showCredit` y `onToggleCredit` de `QuickSummary` y el `CreditToggle` de su cabecera.

- [ ] **Step 4: Retirar el toggle del resumen del listado**

En `TransactionSummary.tsx`, borra el estado `showCredit`, los cuatro `<CreditToggle …/>` y la resta condicional de `sumCreditExpenses`: el chip pasa a mostrar el balance del modo activo del selector.

- [ ] **Step 5: Limpiar lo que quede sin uso**

Borra `src/presentation/financial/components/CreditToggle.tsx`. En `src/presentation/financial/lib/credit-toggle.ts`, elimina `includeCreditInKpis` (ya no la llama nadie: el `BalanceService` calcula el balance con tarjetas) y conserva las funciones `excludeCreditFrom*` que siguen alimentando los gráficos. Ajusta `__tests__/lib/credit-toggle.test.ts` borrando el bloque `describe("includeCreditInKpis")`.

Verifica que no queda ninguna referencia:

Run: `git grep -n "CreditToggle\|includeCreditInKpis\|showCredit" -- src __tests__`
Expected: sin resultados.

- [ ] **Step 6: Verificación final**

Run: `npx jest`
Expected: PASS — toda la suite.

Run: `npx tsc --noEmit 2>&1 | grep "^src/"`
Expected: sin salida.

Run: `npx eslint src/domain/services/balance-scope.ts src/domain/services/balance-modes.ts src/application/services/balance-service.ts src/app/actions/balance.ts src/presentation/financial/components/BalanceModeSwitch.tsx src/presentation/financial/components/settings/BalanceScopeManager.tsx`
Expected: sin errores nuevos.

Run: `graphify update .`
Expected: el grafo se regenera.

- [ ] **Step 7: Commit**

```bash
git add -A src/ __tests__/
git commit -m "refactor(financial): replace the Incluir TC toggle with the balance mode switch"
```

---

## Verificación de cobertura del spec

| Sección del spec | Tarea |
|---|---|
| 4.1 Balance total | 3, 5 |
| 4.2 Balance del periodo | 2, 5 |
| 4.3 Balance con tarjetas | 2, 5, 10 |
| 5 Resolución del scope | 1 |
| 6 Arquitectura y contrato | 5 |
| 7 Esquema | 4 |
| 8.1 Selector y aviso de cuentas sin saldo | 7, 8 |
| 8.2 Pestaña de ajustes | 9 |
| 9 Pruebas | todas |
| 10 Orden de trabajo | 1 → 10 |
