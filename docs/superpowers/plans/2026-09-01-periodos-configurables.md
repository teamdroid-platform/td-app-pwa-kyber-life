# Periodos configurables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el día en que empieza el mes sea una preferencia del usuario, persistida, con un valor independiente para Finanzas y otro para Compras, y que todo rango por defecto salga de ahí en vez del 22 escrito a mano.

**Architecture:** Cuatro funciones puras en `src/lib/date-range.ts` calculan el ciclo a partir de un día de corte; una cadena repositorio → servicio → server action lo persiste en `user_period_settings`; y un React Context montado en `financial/layout.tsx` y `market/layout.tsx` lo hace llegar a los componentes cliente, mientras las páginas servidor llaman al servicio directo.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind v4, shadcn/ui, Supabase (Postgres + RLS), Zod 4, Jest.

**Spec:** `docs/superpowers/specs/2026-09-01-periodos-configurables-design.md`

## Global Constraints

- Proyecto Supabase: **KyberLife** (`xywkuwmhnfcdksamuypk`, us-east-2). Todo DDL se aplica con el MCP de Supabase (`apply_migration`), nunca ad-hoc, y queda además como archivo en `supabase/migrations/`.
- TypeScript estricto. Nada de `any` salvo necesidad real.
- Commits locales permitidos con Conventional Commits. **Nunca `push`, PR, merge ni deploy sin permiso explícito del usuario.**
- Diseño mobile-first obligatorio; los cambios visuales preservan la estética actual.
- Los dos ámbitos son exactamente `'FINANCIAL' | 'MARKET'`. Sus valores por defecto son **22** y **1** respectivamente, y viven en `DEFAULT_CYCLE_START_DAY` (código), no en el esquema.
- El día de corte es un entero de **1 a 31** inclusive. Se valida con Zod antes de escribir; el `CHECK` de la base es la segunda línea de defensa.
- Nombre de la tabla: `user_period_settings`, con prefijo `user_` y no `financial_` porque también manda en `/market`.
- El preset "Mes" conserva la semántica que cada módulo ya tiene: Finanzas *ciclo → hoy* (`cycleToDate`), Compras *ciclo completo* (`cycleRangeContaining`).
- Tests con Jest. Los `.ts` corren con cualquiera de las dos configuraciones; los `.tsx` necesitan la de jsdom (`jest.config.js`, la de por defecto).
- Acotar búsquedas a `src/` o `__tests__/`: una búsqueda desde la raíz del repo agota el tiempo por `node_modules/`, `.next/` y `.agent/`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/date-range.ts` | (modificado) `anchorDay`, `cycleRangeContaining`, `cycleToDate`, `cyclePreviousRange`, `toFullDayDates`, `toFullDayIsoRange`; al final se borran `defaultHubCustomRange` y `computeDateRange` |
| `src/domain/entities/period.ts` | `PeriodScope`, `PeriodSettings`, `DEFAULT_CYCLE_START_DAY`, límites |
| `src/lib/validators/period-schemas.ts` | Esquemas Zod |
| `src/domain/repositories/period.ts` | `IPeriodSettingsRepository` |
| `src/infrastructure/repositories/implementations.ts` | (modificado) `InMemoryPeriodSettingsRepository` |
| `supabase/migrations/20260901120000_period_settings.sql` | Esquema + RLS |
| `src/infrastructure/repositories/supabase/supabase-period-settings-repository.ts` | Implementación Supabase |
| `src/infrastructure/container.ts` | (modificado) cableado |
| `src/application/services/period-settings-service.ts` | Resuelve el defecto por ámbito y valida al escribir |
| `src/app/actions/period-settings.ts` | Server actions |
| `src/presentation/components/period/PeriodSettingsProvider.tsx` | Context cliente + `useCycleStartDay`, `useCycleRange` |
| `src/app/financial/layout.tsx` | (modificado) monta el provider con `FINANCIAL` |
| `src/app/market/layout.tsx` | (modificado) monta el provider con `MARKET` |
| `src/presentation/financial/components/FinancialDashboard.tsx` | (modificado) rango precargado y preset "Mes" |
| `src/presentation/financial/components/TransactionFilters.tsx` | (modificado) rango precargado |
| `src/app/financial/transactions/page.tsx` | (modificado) rango por defecto en servidor |
| `src/presentation/components/analytics/MarketDateFilterBar.tsx` | (modificado) preset "Mes" y rango precargado |
| `src/app/dashboard/page.tsx` | (modificado) `periods()` sigue el ciclo financiero |
| `src/presentation/components/period/PeriodSettingsManager.tsx` | Panel de configuración, compartido por los dos ámbitos |
| `src/presentation/financial/components/settings/SettingsDashboard.tsx` | (modificado) cuarta pestaña |
| `src/presentation/market/components/settings/MarketSettingsDashboard.tsx` | (modificado) cuarta pestaña |
| `src/app/financial/settings/page.tsx` | (modificado) carga el día financiero |
| `src/app/market/settings/page.tsx` | (modificado) carga los dos días |

---

### Task 1: Matemática del ciclo

Funciones puras, sin dependencias. Todo lo demás las usa, así que van primero.

**Files:**
- Modify: `src/lib/date-range.ts` (añadir al final, sin tocar lo existente)
- Test: `__tests__/lib/date-range.test.ts` (añadir un `describe` nuevo)

**Interfaces:**
- Consumes: `zonedNow()` y `toDateInputValue()`, ya exportadas por `src/lib/date-range.ts`.
- Produces:
  - `cycleRangeContaining(startDay: number, reference?: Date): { start: string; end: string }` — extremos en `YYYY-MM-DD`.
  - `cycleToDate(startDay: number, reference?: Date): { start: string; end: string }`
  - `cyclePreviousRange(startDay: number, reference?: Date): { start: string; end: string }`
  - `toFullDayDates(range: { start: string; end: string }): { start: Date; end: Date }`
  - `toFullDayIsoRange(range: { start: string; end: string }): { startDate: string; endDate: string }`

- [ ] **Step 1: Escribir el test que falla**

El archivo tiene un `describe("date-range", …)` que envuelve todo y un único `import` de `@/lib/date-range` en la cabecera. Añade los cinco nombres nuevos **a ese import existente** (no crees un segundo `import` del mismo módulo) y pega los bloques de abajo **dentro** del describe exterior, al final. No borres nada de lo que ya hay: eso se hace en la Task 11.

```ts
// Añadir a la lista del import que ya existe en la cabecera:
//     cycleRangeContaining, cycleToDate, cyclePreviousRange,
//     toFullDayDates, toFullDayIsoRange

describe("cycleRangeContaining", () => {
    it("con corte 22, una fecha anterior al corte ancla el mes previo", () => {
        expect(cycleRangeContaining(22, new Date(2026, 8, 2))).toEqual({
            start: "2026-08-22",
            end: "2026-09-21",
        });
    });

    it("rueda exactamente el día del corte", () => {
        expect(cycleRangeContaining(22, new Date(2026, 8, 21))).toEqual({
            start: "2026-08-22",
            end: "2026-09-21",
        });
        expect(cycleRangeContaining(22, new Date(2026, 8, 22))).toEqual({
            start: "2026-09-22",
            end: "2026-10-21",
        });
    });

    it("cruza el año hacia atrás", () => {
        expect(cycleRangeContaining(22, new Date(2027, 0, 10))).toEqual({
            start: "2026-12-22",
            end: "2027-01-21",
        });
    });

    it("con corte 1 devuelve el mes natural completo, de 30 días", () => {
        expect(cycleRangeContaining(1, new Date(2026, 8, 15))).toEqual({
            start: "2026-09-01",
            end: "2026-09-30",
        });
    });

    it("con corte 1 devuelve el mes natural completo, de 31 días", () => {
        expect(cycleRangeContaining(1, new Date(2026, 9, 15))).toEqual({
            start: "2026-10-01",
            end: "2026-10-31",
        });
    });

    it("con corte 1 resuelve febrero sin caso especial", () => {
        expect(cycleRangeContaining(1, new Date(2026, 1, 15))).toEqual({
            start: "2026-02-01",
            end: "2026-02-28",
        });
    });

    it("con corte 31 recorta el ancla al último día real de febrero", () => {
        expect(cycleRangeContaining(31, new Date(2026, 1, 15))).toEqual({
            start: "2026-01-31",
            end: "2026-02-27",
        });
    });

    it("con corte 31 encadena ciclos desiguales sin huecos ni solapes", () => {
        const enero = cycleRangeContaining(31, new Date(2026, 1, 15));
        const febrero = cycleRangeContaining(31, new Date(2026, 2, 15));

        expect(enero).toEqual({ start: "2026-01-31", end: "2026-02-27" });
        expect(febrero).toEqual({ start: "2026-02-28", end: "2026-03-30" });

        // El día siguiente al fin de un ciclo es el inicio del siguiente.
        const diaDespues = new Date(`${enero.end}T00:00:00`);
        diaDespues.setDate(diaDespues.getDate() + 1);
        expect(toDateInputValue(diaDespues)).toBe(febrero.start);
    });
});

describe("cycleToDate", () => {
    it("arranca en el inicio del ciclo y termina en la referencia", () => {
        expect(cycleToDate(22, new Date(2026, 8, 10))).toEqual({
            start: "2026-08-22",
            end: "2026-09-10",
        });
    });

    it("con corte 1 es el mes natural hasta hoy", () => {
        expect(cycleToDate(1, new Date(2026, 8, 10))).toEqual({
            start: "2026-09-01",
            end: "2026-09-10",
        });
    });
});

describe("cyclePreviousRange", () => {
    it("devuelve el ciclo inmediatamente anterior", () => {
        expect(cyclePreviousRange(22, new Date(2026, 8, 2))).toEqual({
            start: "2026-07-22",
            end: "2026-08-21",
        });
    });

    it("con corte 31 no solapa aunque los ciclos midan distinto", () => {
        // El ciclo actual es 2026-02-28 → 2026-03-30; el anterior, 2026-01-31 → 2026-02-27.
        expect(cyclePreviousRange(31, new Date(2026, 2, 15))).toEqual({
            start: "2026-01-31",
            end: "2026-02-27",
        });
    });
});

describe("toFullDayDates / toFullDayIsoRange", () => {
    it("expande a día completo, del primer al último milisegundo", () => {
        const { start, end } = toFullDayDates({ start: "2026-08-22", end: "2026-09-21" });
        expect(start.getHours()).toBe(0);
        expect(start.getMinutes()).toBe(0);
        expect(end.getHours()).toBe(23);
        expect(end.getMinutes()).toBe(59);
        expect(end.getSeconds()).toBe(59);
        expect(end.getMilliseconds()).toBe(999);
    });

    it("la versión ISO devuelve los mismos instantes serializados", () => {
        const dates = toFullDayDates({ start: "2026-08-22", end: "2026-09-21" });
        expect(toFullDayIsoRange({ start: "2026-08-22", end: "2026-09-21" })).toEqual({
            startDate: dates.start.toISOString(),
            endDate: dates.end.toISOString(),
        });
    });
});
```

`toDateInputValue` ya está importada en la cabecera de ese archivo de test; si no lo estuviera, añádela al `import` existente.

- [ ] **Step 2: Correr el test y comprobar que falla**

Run: `npx jest __tests__/lib/date-range.test.ts -t "cycleRangeContaining"`
Expected: FAIL con `(0 , _daterange.cycleRangeContaining) is not a function`.

- [ ] **Step 3: Implementar**

Añade al final de `src/lib/date-range.ts`:

```ts
/** Días que tiene un mes. `month` puede desbordar (−1, 12): Date lo normaliza. */
function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * El día de corte, recortado al último día real del mes. Con corte 31, febrero
 * ancla el 28: no hay forma de anclar un día que no existe.
 */
function anchorDay(year: number, month: number, startDay: number): number {
    return Math.min(startDay, daysInMonth(year, month));
}

/**
 * Ciclo que contiene `reference`, con extremos en YYYY-MM-DD.
 *
 * El fin es la víspera del ancla siguiente, nunca un día guardado: así dos
 * ciclos consecutivos no pueden dejar hueco ni solaparse, ni siquiera cuando
 * miden distinto por el recorte de los meses cortos.
 *
 * `reference` se lee por sus componentes locales y por defecto es "ahora"
 * resuelto en {@link APP_TIMEZONE}, para que el ciclo ruede con el día local
 * del usuario y no con el día UTC del servidor (ver {@link zonedNow}).
 */
export function cycleRangeContaining(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    const year = reference.getFullYear();
    const month = reference.getMonth();

    const anchorThisMonth = anchorDay(year, month, startDay);
    const anchorMonth = reference.getDate() >= anchorThisMonth ? month : month - 1;

    const start = new Date(year, anchorMonth, anchorDay(year, anchorMonth, startDay));
    const nextAnchor = new Date(year, anchorMonth + 1, anchorDay(year, anchorMonth + 1, startDay));
    const end = new Date(nextAnchor);
    end.setDate(nextAnchor.getDate() - 1);

    return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

/** Ciclo actual hasta `reference` inclusive — el preset "Mes" de Finanzas. */
export function cycleToDate(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    return {
        start: cycleRangeContaining(startDay, reference).start,
        end: toDateInputValue(reference),
    };
}

/**
 * El ciclo inmediatamente anterior al que contiene `reference`.
 *
 * Se calcula retrocediendo un día desde el inicio del ciclo actual, no restando
 * un mes: con corte 31 los ciclos no miden lo mismo y restar meses produciría
 * solapes.
 */
export function cyclePreviousRange(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    const current = cycleRangeContaining(startDay, reference);
    const dayBefore = new Date(`${current.start}T00:00:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    return cycleRangeContaining(startDay, dayBefore);
}

/** Expande un rango YYYY-MM-DD a Dates locales de día completo. */
export function toFullDayDates(
    range: { start: string; end: string },
): { start: Date; end: Date } {
    const start = new Date(`${range.start}T00:00:00`);
    const end = new Date(`${range.end}T00:00:00`);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

/** Lo mismo que {@link toFullDayDates}, serializado para las consultas. */
export function toFullDayIsoRange(
    range: { start: string; end: string },
): { startDate: string; endDate: string } {
    const { start, end } = toFullDayDates(range);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
}
```

- [ ] **Step 4: Correr los tests y comprobar que pasan**

Run: `npx jest __tests__/lib/date-range.test.ts`
Expected: PASS, incluidos los `describe` antiguos de `defaultHubCustomRange` y `computeDateRange`, que siguen intactos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-range.ts __tests__/lib/date-range.test.ts
git commit -m "feat(periodos): calcular el ciclo mensual a partir de un dia de corte"
```

---

### Task 2: Tipos de dominio y esquemas Zod

**Files:**
- Create: `src/domain/entities/period.ts`
- Create: `src/lib/validators/period-schemas.ts`
- Test: `__tests__/validators/period-schemas.test.ts`

**Interfaces:**
- Consumes: `UUID` de `src/domain/core.ts`.
- Produces: `PeriodScope`, `PERIOD_SCOPES`, `DEFAULT_CYCLE_START_DAY`, `MIN_CYCLE_START_DAY`, `MAX_CYCLE_START_DAY`, `PeriodSettings`, `periodScopeSchema`, `cycleStartDaySchema`, `setCycleStartDaySchema`.

- [ ] **Step 1: Crear los tipos de dominio**

Crea `src/domain/entities/period.ts`:

```ts
import { UUID } from "../core";

/** Los ámbitos que tienen ciclo propio. */
export type PeriodScope = 'FINANCIAL' | 'MARKET';

export const PERIOD_SCOPES: readonly PeriodScope[] = ['FINANCIAL', 'MARKET'] as const;

/**
 * El día de corte que se aplica mientras el usuario no guarde otro.
 *
 * Finanzas conserva el 22 que la app usaba escrito a mano, para que nadie vea
 * cambiar sus cifras sin haber tocado nada. Compras arranca en mes natural,
 * que es lo que su preset "Mes" ya hacía.
 */
export const DEFAULT_CYCLE_START_DAY: Record<PeriodScope, number> = {
    FINANCIAL: 22,
    MARKET: 1,
};

export const MIN_CYCLE_START_DAY = 1;
export const MAX_CYCLE_START_DAY = 31;

export interface PeriodSettings {
    ownerUserId: UUID;
    scope: PeriodScope;
    cycleStartDay: number;
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `__tests__/validators/period-schemas.test.ts`:

```ts
import { cycleStartDaySchema, setCycleStartDaySchema } from "@/lib/validators/period-schemas";

describe("cycleStartDaySchema", () => {
    it("acepta los extremos del rango", () => {
        expect(cycleStartDaySchema.parse(1)).toBe(1);
        expect(cycleStartDaySchema.parse(31)).toBe(31);
    });

    it("rechaza 0 y 32", () => {
        expect(() => cycleStartDaySchema.parse(0)).toThrow();
        expect(() => cycleStartDaySchema.parse(32)).toThrow();
    });

    it("rechaza no enteros", () => {
        expect(() => cycleStartDaySchema.parse(22.5)).toThrow();
    });
});

describe("setCycleStartDaySchema", () => {
    it("acepta un ámbito válido con su día", () => {
        expect(setCycleStartDaySchema.parse({ scope: "MARKET", cycleStartDay: 1 })).toEqual({
            scope: "MARKET",
            cycleStartDay: 1,
        });
    });

    it("rechaza un ámbito desconocido", () => {
        expect(() => setCycleStartDaySchema.parse({ scope: "BANKS", cycleStartDay: 1 })).toThrow();
    });
});
```

- [ ] **Step 3: Correr el test y comprobar que falla**

Run: `npx jest __tests__/validators/period-schemas.test.ts`
Expected: FAIL con `Cannot find module '@/lib/validators/period-schemas'`.

- [ ] **Step 4: Implementar los esquemas**

Crea `src/lib/validators/period-schemas.ts`:

```ts
import { z } from "zod";
import { MAX_CYCLE_START_DAY, MIN_CYCLE_START_DAY, PERIOD_SCOPES } from "@/domain/entities/period";

// Derivado de PERIOD_SCOPES, no re-declarado: un tercer ámbito que se agregue
// ahí entra aquí solo, en vez de quedar rechazado en silencio en el borde de
// la action por un enum que nadie recordó actualizar.
export const periodScopeSchema = z.enum(PERIOD_SCOPES);

export const cycleStartDaySchema = z
    .number()
    .int()
    .min(MIN_CYCLE_START_DAY)
    .max(MAX_CYCLE_START_DAY);

export const setCycleStartDaySchema = z.object({
    scope: periodScopeSchema,
    cycleStartDay: cycleStartDaySchema,
});
```

- [ ] **Step 5: Correr el test y comprobar que pasa**

Run: `npx jest __tests__/validators/period-schemas.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/domain/entities/period.ts src/lib/validators/period-schemas.ts __tests__/validators/period-schemas.test.ts
git commit -m "feat(periodos): tipos de dominio y validacion del dia de corte"
```

---

### Task 3: Interfaz de repositorio e implementación en memoria

**Files:**
- Create: `src/domain/repositories/period.ts`
- Modify: `src/infrastructure/repositories/implementations.ts` (añadir clase al final)
- Test: `__tests__/services/period-settings-repository.test.ts`

**Interfaces:**
- Consumes: `PeriodScope`, `PeriodSettings` de `src/domain/entities/period.ts`; `UUID` de `src/domain/core.ts`.
- Produces: `IPeriodSettingsRepository` con `findByOwner`, `findAllByOwner`, `upsert`; y `InMemoryPeriodSettingsRepository`.

- [ ] **Step 1: Crear la interfaz**

Crea `src/domain/repositories/period.ts`:

```ts
import { UUID } from "../core";
import { PeriodScope, PeriodSettings } from "../entities/period";

/**
 * Guarda solo lo que el usuario cambió. Sin fila para un ámbito, el defecto de
 * ese ámbito aplica entero: quien nunca entra a la pantalla de ajustes no tiene
 * ninguna fila y ve el comportamiento de siempre.
 */
export interface IPeriodSettingsRepository {
    /** Null cuando el usuario nunca configuró ese ámbito. */
    findByOwner(ownerUserId: UUID, scope: PeriodScope): Promise<PeriodSettings | null>;
    /** Los ámbitos que el usuario sí configuró, para pintarlos juntos en ajustes. */
    findAllByOwner(ownerUserId: UUID): Promise<PeriodSettings[]>;
    upsert(ownerUserId: UUID, scope: PeriodScope, cycleStartDay: number): Promise<PeriodSettings>;
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `__tests__/services/period-settings-repository.test.ts`:

```ts
import { InMemoryPeriodSettingsRepository } from "@/infrastructure/repositories/implementations";

describe("InMemoryPeriodSettingsRepository", () => {
    it("devuelve null para un ámbito sin configurar", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        expect(await repo.findByOwner("user-1", "FINANCIAL")).toBeNull();
    });

    it("guarda y recupera el día de un ámbito", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);

        expect(await repo.findByOwner("user-1", "FINANCIAL")).toEqual({
            ownerUserId: "user-1",
            scope: "FINANCIAL",
            cycleStartDay: 5,
        });
    });

    it("sobrescribe el día del mismo ámbito en vez de duplicarlo", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);
        await repo.upsert("user-1", "FINANCIAL", 15);

        expect(await repo.findByOwner("user-1", "FINANCIAL")).toEqual({
            ownerUserId: "user-1",
            scope: "FINANCIAL",
            cycleStartDay: 15,
        });
        expect(await repo.findAllByOwner("user-1")).toHaveLength(1);
    });

    it("no mezcla ámbitos del mismo usuario", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);

        expect(await repo.findByOwner("user-1", "MARKET")).toBeNull();
    });

    it("no mezcla usuarios", async () => {
        const repo = new InMemoryPeriodSettingsRepository();
        await repo.upsert("user-1", "FINANCIAL", 5);

        expect(await repo.findByOwner("user-2", "FINANCIAL")).toBeNull();
        expect(await repo.findAllByOwner("user-2")).toEqual([]);
    });
});
```

- [ ] **Step 3: Correr el test y comprobar que falla**

Run: `npx jest __tests__/services/period-settings-repository.test.ts`
Expected: FAIL con `InMemoryPeriodSettingsRepository is not a constructor`.

- [ ] **Step 4: Implementar la clase en memoria**

Añade al final de `src/infrastructure/repositories/implementations.ts`:

```ts
export class InMemoryPeriodSettingsRepository implements IPeriodSettingsRepository {
    /** Clave `${userId}:${scope}`, para que los dos ámbitos convivan sin pisarse. */
    private settings = new Map<string, PeriodSettings>();

    private key(ownerUserId: UUID, scope: PeriodScope): string {
        return `${ownerUserId}:${scope}`;
    }

    async findByOwner(ownerUserId: UUID, scope: PeriodScope): Promise<PeriodSettings | null> {
        return this.settings.get(this.key(ownerUserId, scope)) ?? null;
    }

    async findAllByOwner(ownerUserId: UUID): Promise<PeriodSettings[]> {
        return [...this.settings.values()].filter(s => s.ownerUserId === ownerUserId);
    }

    async upsert(
        ownerUserId: UUID,
        scope: PeriodScope,
        cycleStartDay: number,
    ): Promise<PeriodSettings> {
        const saved: PeriodSettings = { ownerUserId, scope, cycleStartDay };
        this.settings.set(this.key(ownerUserId, scope), saved);
        return saved;
    }
}
```

Y añade estos dos imports en la cabecera del archivo, justo debajo de los dos equivalentes de `balance` que ya están ahí (líneas 7-8):

```ts
import { IPeriodSettingsRepository } from "@/domain/repositories/period";
import { PeriodScope, PeriodSettings } from "@/domain/entities/period";
```

- [ ] **Step 5: Correr el test y comprobar que pasa**

Run: `npx jest __tests__/services/period-settings-repository.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/domain/repositories/period.ts src/infrastructure/repositories/implementations.ts __tests__/services/period-settings-repository.test.ts
git commit -m "feat(periodos): repositorio de preferencias con implementacion en memoria"
```

---

### Task 4: Migración Supabase, repositorio real y cableado

Sin test unitario: es DDL más una implementación que solo habla con Supabase. La verificación es que el `npm run build` pasa y que la migración queda aplicada y registrada.

**Files:**
- Create: `supabase/migrations/20260901120000_period_settings.sql`
- Create: `src/infrastructure/repositories/supabase/supabase-period-settings-repository.ts`
- Modify: `src/infrastructure/container.ts`

**Interfaces:**
- Consumes: `IPeriodSettingsRepository` (Task 3), `createClient` de `@/infrastructure/supabase/server`.
- Produces: `SupabasePeriodSettingsRepository`; y el singleton exportado `periodSettingsRepository` en el contenedor.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/20260901120000_period_settings.sql`:

```sql
-- Día en que empieza el mes para cada usuario, con un valor por ámbito.
--
-- Solo se guardan las excepciones: sin fila, el código aplica el defecto del
-- ámbito (22 en Finanzas, 1 en Compras). Por eso la columna no lleva DEFAULT,
-- que tendría que ser el mismo para los dos.

CREATE TABLE user_period_settings (
    owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scope           TEXT NOT NULL CHECK (scope IN ('FINANCIAL', 'MARKET')),
    cycle_start_day SMALLINT NOT NULL CHECK (cycle_start_day BETWEEN 1 AND 31),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    PRIMARY KEY (owner_user_id, scope)
);

ALTER TABLE user_period_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own user_period_settings"   ON user_period_settings FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own user_period_settings" ON user_period_settings FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own user_period_settings" ON user_period_settings FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own user_period_settings" ON user_period_settings FOR DELETE USING (auth.uid() = owner_user_id);
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usa `apply_migration` del MCP de Supabase sobre el proyecto `xywkuwmhnfcdksamuypk`, con nombre `period_settings` y exactamente el SQL de arriba. No la apliques a mano por el editor SQL.

- [ ] **Step 3: Implementar el repositorio Supabase**

Crea `src/infrastructure/repositories/supabase/supabase-period-settings-repository.ts`:

```ts
import type { IPeriodSettingsRepository } from "@/domain/repositories/period";
import type { PeriodScope, PeriodSettings } from "@/domain/entities/period";
import type { UUID } from "@/domain/core";
import { createClient } from "@/infrastructure/supabase/server";

interface PeriodSettingsRow {
    owner_user_id: string;
    scope: PeriodScope;
    cycle_start_day: number;
    created_at: string;
    updated_at: string;
}

function mapRow(row: PeriodSettingsRow): PeriodSettings {
    return {
        ownerUserId: row.owner_user_id,
        scope: row.scope,
        cycleStartDay: row.cycle_start_day,
    };
}

export class SupabasePeriodSettingsRepository implements IPeriodSettingsRepository {
    async findByOwner(ownerUserId: UUID, scope: PeriodScope): Promise<PeriodSettings | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_period_settings')
            .select('*')
            .eq('owner_user_id', ownerUserId)
            .eq('scope', scope)
            .maybeSingle();

        if (error) throw new Error(`Error loading period settings: ${error.message}`);
        if (!data) return null;
        return mapRow(data);
    }

    async findAllByOwner(ownerUserId: UUID): Promise<PeriodSettings[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_period_settings')
            .select('*')
            .eq('owner_user_id', ownerUserId);

        if (error) throw new Error(`Error loading period settings: ${error.message}`);
        return (data ?? []).map(mapRow);
    }

    async upsert(
        ownerUserId: UUID,
        scope: PeriodScope,
        cycleStartDay: number,
    ): Promise<PeriodSettings> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('user_period_settings')
            .upsert(
                {
                    owner_user_id: ownerUserId,
                    scope,
                    cycle_start_day: cycleStartDay,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'owner_user_id,scope' },
            )
            .select()
            .single();

        if (error) throw new Error(`Error saving period settings: ${error.message}`);
        return mapRow(data);
    }
}
```

- [ ] **Step 4: Cablear el contenedor**

En `src/infrastructure/container.ts`:

1. Añade `InMemoryPeriodSettingsRepository` a la lista de imports de `@/infrastructure/repositories/implementations` (donde ya está `InMemoryBalanceSettingsRepository`, línea 23).
2. Añade el import del repositorio Supabase junto a los demás (donde está `SupabaseBalanceSettingsRepository`, línea 66):

```ts
import { SupabasePeriodSettingsRepository } from "./repositories/supabase/supabase-period-settings-repository";
```

Usa la misma forma de ruta que las líneas vecinas de ese bloque de imports.

3. Justo debajo de `balanceSettingsRepository` (línea 127-128), añade:

```ts
export const periodSettingsRepository = singleton("periodSettingsRepo", () =>
    isSupabase ? new SupabasePeriodSettingsRepository() : new InMemoryPeriodSettingsRepository());
```

- [ ] **Step 5: Verificar que compila y que nada se rompió**

Run: `npm run build`
Expected: build correcto, sin errores de TypeScript.

Run: `npx jest __tests__/services/period-settings-repository.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901120000_period_settings.sql src/infrastructure/repositories/supabase/supabase-period-settings-repository.ts src/infrastructure/container.ts
git commit -m "feat(periodos): tabla user_period_settings y repositorio supabase"
```

---

### Task 5: Servicio de preferencias

**Files:**
- Create: `src/application/services/period-settings-service.ts`
- Modify: `src/infrastructure/container.ts`
- Test: `__tests__/services/period-settings-service.test.ts`

**Interfaces:**
- Consumes: `IPeriodSettingsRepository` (Task 3), `DEFAULT_CYCLE_START_DAY` (Task 2), `cycleStartDaySchema` (Task 2).
- Produces: clase `PeriodSettingsService` con `getCycleStartDay(userId, scope): Promise<number>`, `getAllCycleStartDays(userId): Promise<Record<PeriodScope, number>>`, `setCycleStartDay(userId, scope, day): Promise<PeriodSettings>`; y el singleton exportado `periodSettingsService`.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/services/period-settings-service.test.ts`:

```ts
import { PeriodSettingsService } from "@/application/services/period-settings-service";
import { InMemoryPeriodSettingsRepository } from "@/infrastructure/repositories/implementations";

function makeService() {
    const repository = new InMemoryPeriodSettingsRepository();
    return { repository, service: new PeriodSettingsService(repository) };
}

describe("PeriodSettingsService.getCycleStartDay", () => {
    it("sin fila, Finanzas usa el 22", async () => {
        const { service } = makeService();
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(22);
    });

    it("sin fila, Compras usa el 1", async () => {
        const { service } = makeService();
        expect(await service.getCycleStartDay("user-1", "MARKET")).toBe(1);
    });

    it("con fila, devuelve el día guardado", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "FINANCIAL", 5);
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(5);
    });

    it("configurar un ámbito no cambia el defecto del otro", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "FINANCIAL", 5);
        expect(await service.getCycleStartDay("user-1", "MARKET")).toBe(1);
    });
});

describe("PeriodSettingsService.getAllCycleStartDays", () => {
    it("devuelve los dos ámbitos, rellenando con el defecto el que falte", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "MARKET", 15);

        expect(await service.getAllCycleStartDays("user-1")).toEqual({
            FINANCIAL: 22,
            MARKET: 15,
        });
    });
});

describe("PeriodSettingsService.setCycleStartDay", () => {
    it("rechaza un día fuera de rango sin escribir nada", async () => {
        const { repository, service } = makeService();

        await expect(service.setCycleStartDay("user-1", "FINANCIAL", 32)).rejects.toThrow();
        expect(await repository.findByOwner("user-1", "FINANCIAL")).toBeNull();
    });

    it("rechaza un día no entero", async () => {
        const { service } = makeService();
        await expect(service.setCycleStartDay("user-1", "FINANCIAL", 22.5)).rejects.toThrow();
    });

    it("acepta los extremos 1 y 31", async () => {
        const { service } = makeService();
        await service.setCycleStartDay("user-1", "FINANCIAL", 1);
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(1);

        await service.setCycleStartDay("user-1", "FINANCIAL", 31);
        expect(await service.getCycleStartDay("user-1", "FINANCIAL")).toBe(31);
    });
});
```

- [ ] **Step 2: Correr el test y comprobar que falla**

Run: `npx jest __tests__/services/period-settings-service.test.ts`
Expected: FAIL con `Cannot find module '@/application/services/period-settings-service'`.

- [ ] **Step 3: Implementar el servicio**

Crea `src/application/services/period-settings-service.ts`:

```ts
import type { IPeriodSettingsRepository } from "@/domain/repositories/period";
import type { UUID } from "@/domain/core";
import {
    DEFAULT_CYCLE_START_DAY, PERIOD_SCOPES, type PeriodScope, type PeriodSettings,
} from "@/domain/entities/period";
import { cycleStartDaySchema } from "@/lib/validators/period-schemas";

/**
 * Resuelve el día de corte de cada ámbito, aplicando el defecto cuando el
 * usuario nunca lo configuró. Ningún consumidor necesita conocer los defectos:
 * pide el día y recibe uno válido siempre.
 */
export class PeriodSettingsService {
    constructor(private readonly repository: IPeriodSettingsRepository) {}

    async getCycleStartDay(ownerUserId: UUID, scope: PeriodScope): Promise<number> {
        const found = await this.repository.findByOwner(ownerUserId, scope);
        return found?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY[scope];
    }

    /** Los dos ámbitos de una sola lectura, para la pantalla de ajustes. */
    async getAllCycleStartDays(ownerUserId: UUID): Promise<Record<PeriodScope, number>> {
        const saved = await this.repository.findAllByOwner(ownerUserId);
        const byScope = new Map(saved.map(s => [s.scope, s.cycleStartDay]));

        return PERIOD_SCOPES.reduce((acc, scope) => {
            acc[scope] = byScope.get(scope) ?? DEFAULT_CYCLE_START_DAY[scope];
            return acc;
        }, {} as Record<PeriodScope, number>);
    }

    /**
     * Valida antes de escribir, para que el CHECK de la base sea la segunda
     * línea de defensa y no la primera: un día inválido debe fallar con un
     * mensaje de Zod, no con un error de Postgres.
     */
    async setCycleStartDay(
        ownerUserId: UUID,
        scope: PeriodScope,
        cycleStartDay: number,
    ): Promise<PeriodSettings> {
        const validated = cycleStartDaySchema.parse(cycleStartDay);
        return this.repository.upsert(ownerUserId, scope, validated);
    }
}
```

- [ ] **Step 4: Correr el test y comprobar que pasa**

Run: `npx jest __tests__/services/period-settings-service.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Cablear el servicio en el contenedor**

En `src/infrastructure/container.ts`, junto a los demás servicios (donde se construye `balanceService`, alrededor de la línea 199), añade el import y el singleton:

```ts
import { PeriodSettingsService } from "@/application/services/period-settings-service";

export const periodSettingsService = new PeriodSettingsService(periodSettingsRepository);
```

Colócalo después de la declaración de `periodSettingsRepository` (Task 4) para que la referencia exista.

- [ ] **Step 6: Verificar que compila**

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/period-settings-service.ts src/infrastructure/container.ts __tests__/services/period-settings-service.test.ts
git commit -m "feat(periodos): servicio que resuelve el dia de corte por ambito"
```

---

### Task 6: Server actions

**Files:**
- Create: `src/app/actions/period-settings.ts`
- Test: `__tests__/services/period-settings-actions.test.ts`

**Interfaces:**
- Consumes: `periodSettingsService` (Task 5), `requireUserId` de `@/infrastructure/supabase/auth-user`, `setCycleStartDaySchema` y `periodScopeSchema` (Task 2).
- Produces: `getCycleStartDayAction(scope: string)`, `getAllCycleStartDaysAction()`, `setCycleStartDayAction(input: unknown)` — todas devuelven `{ success: true, data } | { success: false, error }`.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/services/period-settings-actions.test.ts`. Los mocks van antes de los imports que los usan, como en `__tests__/services/balance-actions.test.ts`:

```ts
const getCycleStartDay = jest.fn();
const getAllCycleStartDays = jest.fn();
const setCycleStartDay = jest.fn();
const requireUserId = jest.fn();

jest.mock("@/infrastructure/container", () => ({
    periodSettingsService: {
        getCycleStartDay: (...args: unknown[]) => getCycleStartDay(...args),
        getAllCycleStartDays: (...args: unknown[]) => getAllCycleStartDays(...args),
        setCycleStartDay: (...args: unknown[]) => setCycleStartDay(...args),
    },
}));

jest.mock("@/infrastructure/supabase/auth-user", () => ({
    requireUserId: () => requireUserId(),
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import {
    getCycleStartDayAction,
    getAllCycleStartDaysAction,
    setCycleStartDayAction,
} from "@/app/actions/period-settings";

beforeEach(() => {
    jest.clearAllMocks();
    requireUserId.mockResolvedValue("user-1");
});

describe("getCycleStartDayAction", () => {
    it("devuelve el día del ámbito pedido", async () => {
        getCycleStartDay.mockResolvedValue(22);

        expect(await getCycleStartDayAction("FINANCIAL")).toEqual({ success: true, data: 22 });
        expect(getCycleStartDay).toHaveBeenCalledWith("user-1", "FINANCIAL");
    });

    it("falla con un ámbito desconocido y no llega al servicio", async () => {
        const result = await getCycleStartDayAction("BANKS");

        expect(result.success).toBe(false);
        expect(getCycleStartDay).not.toHaveBeenCalled();
    });
});

describe("getAllCycleStartDaysAction", () => {
    it("devuelve los dos ámbitos", async () => {
        getAllCycleStartDays.mockResolvedValue({ FINANCIAL: 22, MARKET: 1 });

        expect(await getAllCycleStartDaysAction()).toEqual({
            success: true,
            data: { FINANCIAL: 22, MARKET: 1 },
        });
    });
});

describe("setCycleStartDayAction", () => {
    it("guarda un día válido", async () => {
        setCycleStartDay.mockResolvedValue({
            ownerUserId: "user-1", scope: "MARKET", cycleStartDay: 15,
        });

        const result = await setCycleStartDayAction({ scope: "MARKET", cycleStartDay: 15 });

        expect(result.success).toBe(true);
        expect(setCycleStartDay).toHaveBeenCalledWith("user-1", "MARKET", 15);
    });

    it("rechaza un día fuera de rango sin llamar al servicio", async () => {
        const result = await setCycleStartDayAction({ scope: "MARKET", cycleStartDay: 32 });

        expect(result.success).toBe(false);
        expect(setCycleStartDay).not.toHaveBeenCalled();
    });

    it("no lanza cuando el servicio revienta: devuelve el error", async () => {
        setCycleStartDay.mockRejectedValue(new Error("boom"));

        expect(await setCycleStartDayAction({ scope: "MARKET", cycleStartDay: 15 })).toEqual({
            success: false,
            error: "boom",
        });
    });
});
```

- [ ] **Step 2: Correr el test y comprobar que falla**

Run: `npx jest __tests__/services/period-settings-actions.test.ts`
Expected: FAIL con `Cannot find module '@/app/actions/period-settings'`.

- [ ] **Step 3: Implementar las actions**

Crea `src/app/actions/period-settings.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { periodSettingsService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { periodScopeSchema, setCycleStartDaySchema } from "@/lib/validators/period-schemas";

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

function fail(error: unknown) {
    if (error instanceof z.ZodError) {
        return { success: false as const, error: `Validation failed: ${formatZodError(error)}` };
    }
    return { success: false as const, error: (error as Error).message };
}

export async function getCycleStartDayAction(scope: string) {
    try {
        const validated = periodScopeSchema.parse(scope);
        const userId = await requireUserId();
        const data = await periodSettingsService.getCycleStartDay(userId, validated);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error fetching cycle start day:", error);
        return fail(error);
    }
}

/** Los dos ámbitos de una sola vez, para la pantalla de ajustes. */
export async function getAllCycleStartDaysAction() {
    try {
        const userId = await requireUserId();
        const data = await periodSettingsService.getAllCycleStartDays(userId);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error fetching cycle start days:", error);
        return fail(error);
    }
}

export async function setCycleStartDayAction(input: unknown) {
    try {
        const validated = setCycleStartDaySchema.parse(input);
        const userId = await requireUserId();
        const data = await periodSettingsService.setCycleStartDay(
            userId, validated.scope, validated.cycleStartDay,
        );

        // Las cuatro pantallas cuyo rango por defecto sale de esta preferencia.
        revalidatePath("/dashboard");
        revalidatePath("/financial");
        revalidatePath("/financial/transactions");
        revalidatePath("/market/analytics");

        return { success: true as const, data };
    } catch (error) {
        console.error("Error saving cycle start day:", error);
        return fail(error);
    }
}
```

- [ ] **Step 4: Correr el test y comprobar que pasa**

Run: `npx jest __tests__/services/period-settings-actions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/period-settings.ts __tests__/services/period-settings-actions.test.ts
git commit -m "feat(periodos): server actions para leer y guardar el dia de corte"
```

---

### Task 7: Provider y montaje en los dos layouts

**Files:**
- Create: `src/presentation/components/period/PeriodSettingsProvider.tsx`
- Modify: `src/app/financial/layout.tsx`
- Modify: `src/app/market/layout.tsx`
- Test: `__tests__/components/PeriodSettingsProvider.test.tsx`

**Interfaces:**
- Consumes: `cycleRangeContaining` (Task 1).
- Produces:
  - `<PeriodSettingsProvider cycleStartDay={number}>` — componente cliente.
  - `useCycleStartDay(): number`
  - `useCycleRange(): { start: string; end: string }` — el ciclo que contiene hoy, en `YYYY-MM-DD`.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/components/PeriodSettingsProvider.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import {
    PeriodSettingsProvider, useCycleRange, useCycleStartDay,
} from "@/presentation/components/period/PeriodSettingsProvider";

function Probe() {
    const day = useCycleStartDay();
    const range = useCycleRange();
    return <div data-testid="probe">{`${day}|${range.start}|${range.end}`}</div>;
}

describe("PeriodSettingsProvider", () => {
    it("expone el día que recibe y el ciclo que lo contiene", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));

        render(
            <PeriodSettingsProvider cycleStartDay={22}>
                <Probe />
            </PeriodSettingsProvider>,
        );

        expect(screen.getByTestId("probe").textContent).toBe("22|2026-08-22|2026-09-21");

        jest.useRealTimers();
    });

    it("un día distinto produce un ciclo distinto", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));

        render(
            <PeriodSettingsProvider cycleStartDay={1}>
                <Probe />
            </PeriodSettingsProvider>,
        );

        expect(screen.getByTestId("probe").textContent).toBe("1|2026-09-01|2026-09-30");

        jest.useRealTimers();
    });

    it("sin provider, el hook falla en vez de inventarse un día", () => {
        // Silencia el error que React imprime al reventar el render.
        const spy = jest.spyOn(console, "error").mockImplementation(() => {});
        expect(() => render(<Probe />)).toThrow(/PeriodSettingsProvider/);
        spy.mockRestore();
    });
});
```

- [ ] **Step 2: Correr el test y comprobar que falla**

Run: `npx jest __tests__/components/PeriodSettingsProvider.test.tsx`
Expected: FAIL con `Cannot find module '@/presentation/components/period/PeriodSettingsProvider'`.

- [ ] **Step 3: Implementar el provider**

Crea `src/presentation/components/period/PeriodSettingsProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import { cycleRangeContaining } from "@/lib/date-range";

const CycleStartDayContext = createContext<number | null>(null);

/**
 * Reparte el día de corte del ámbito bajo el que se monta.
 *
 * El layout de cada módulo lo monta con SU día, así que el hook no necesita
 * saber de ámbitos: un componente recibe el ciclo correcto por estar donde
 * está. Y como el valor llega en el HTML del servidor, los `useState` que se
 * inicializan con él arrancan ya en su sitio, sin parpadeo ni desajuste de
 * hidratación.
 */
export function PeriodSettingsProvider({
    cycleStartDay,
    children,
}: {
    cycleStartDay: number;
    children: React.ReactNode;
}) {
    return (
        <CycleStartDayContext.Provider value={cycleStartDay}>
            {children}
        </CycleStartDayContext.Provider>
    );
}

export function useCycleStartDay(): number {
    const value = useContext(CycleStartDayContext);
    if (value === null) {
        throw new Error("useCycleStartDay requiere un PeriodSettingsProvider por encima");
    }
    return value;
}

/** El ciclo que contiene hoy, en YYYY-MM-DD. */
export function useCycleRange(): { start: string; end: string } {
    const cycleStartDay = useCycleStartDay();
    return useMemo(() => cycleRangeContaining(cycleStartDay), [cycleStartDay]);
}
```

- [ ] **Step 4: Correr el test y comprobar que pasa**

Run: `npx jest __tests__/components/PeriodSettingsProvider.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Montar el provider en el layout financiero**

En `src/app/financial/layout.tsx`:

1. Añade los imports:

```ts
import { periodSettingsService } from "@/infrastructure/container";
import { PeriodSettingsProvider } from "@/presentation/components/period/PeriodSettingsProvider";
```

`periodSettingsService` va dentro del import que ya existe de `@/infrastructure/container` (donde están `initializeContainer` y `userRepository`), no en uno nuevo.

2. Justo antes del `return`, después del bloque `if (!user) { … }` que redirige, añade:

```ts
const cycleStartDay = await periodSettingsService.getCycleStartDay(user.id, 'FINANCIAL');
```

3. Envuelve el contenido con el provider, por fuera de `FinancialRealtimeProvider`:

```tsx
    return (
        <AppLayout user={user}>
            <div className="flex flex-col w-full h-full">
                <main className="flex-1 w-full flex flex-col items-center">
                    <div className="w-full max-w-5xl">
                        <PeriodSettingsProvider cycleStartDay={cycleStartDay}>
                            <FinancialRealtimeProvider>
                                {children}
                            </FinancialRealtimeProvider>
                        </PeriodSettingsProvider>
                    </div>
                </main>
            </div>
        </AppLayout>
    );
```

- [ ] **Step 6: Montar el provider en el layout de Market**

En `src/app/market/layout.tsx`:

1. Añade `periodSettingsService` al import que ya existe de `@/infrastructure/container`, y el import del provider:

```ts
import { PeriodSettingsProvider } from "@/presentation/components/period/PeriodSettingsProvider";
```

2. Después del bloque `if (!user) { redirect("/auth/login"); }`, añade:

```ts
const cycleStartDay = await periodSettingsService.getCycleStartDay(user.id, 'MARKET');
```

3. Cambia el `return` por:

```tsx
    return (
        <AppLayout user={user}>
            <PeriodSettingsProvider cycleStartDay={cycleStartDay}>
                {children}
            </PeriodSettingsProvider>
        </AppLayout>
    );
```

- [ ] **Step 7: Verificar que compila y que la app arranca**

Run: `npm run build`
Expected: build correcto.

Run: `npm run dev`, abre `http://localhost:3000/financial` y `http://localhost:3000/market/analytics`.
Expected: las dos pantallas cargan igual que antes. Nada cambia todavía de aspecto: el provider está montado pero aún nadie lo consume.

- [ ] **Step 8: Commit**

```bash
git add src/presentation/components/period/PeriodSettingsProvider.tsx src/app/financial/layout.tsx src/app/market/layout.tsx __tests__/components/PeriodSettingsProvider.test.tsx
git commit -m "feat(periodos): provider que reparte el dia de corte por modulo"
```

---

### Task 8: Consumidores de Finanzas

Tres archivos que hoy llaman `defaultHubCustomRange()` o calculan el mes a mano.

**Files:**
- Modify: `src/presentation/financial/components/FinancialDashboard.tsx:53-54` y `:92-96`
- Modify: `src/presentation/financial/components/TransactionFilters.tsx:66-70`
- Modify: `src/app/financial/transactions/page.tsx:51-57`

**Interfaces:**
- Consumes: `useCycleRange`, `useCycleStartDay` (Task 7); `cycleRangeContaining`, `cycleToDate`, `toFullDayIsoRange` (Task 1); `periodSettingsService` (Task 5).
- Produces: nada nuevo.

- [ ] **Step 1: Migrar el rango precargado de FinancialDashboard**

En `src/presentation/financial/components/FinancialDashboard.tsx`:

1. Quita `defaultHubCustomRange` del import de `@/lib/date-range` (deja `STANDARD_PERIOD_PRESETS`) y añade `cycleToDate`:

```ts
import { STANDARD_PERIOD_PRESETS, cycleToDate } from "@/lib/date-range";
import { useCycleRange, useCycleStartDay } from "@/presentation/components/period/PeriodSettingsProvider";
```

2. Sustituye las dos líneas de estado (53-54):

```tsx
    const cycleStartDay = useCycleStartDay();
    const defaultCycle = useCycleRange();
    const [customStartDate, setCustomStartDate] = useState<string>(defaultCycle.start);
    const [customEndDate, setCustomEndDate] = useState<string>(defaultCycle.end);
```

Los hooks van al principio del componente, antes de cualquier `useState` que los use.

- [ ] **Step 2: Migrar el preset "Mes" de FinancialDashboard**

En el mismo archivo, dentro del `useMemo` que resuelve `{ startDate, endDate }`, sustituye la rama `"month"` completa:

```tsx
        if (filterType === "month") {
            // "Mes" es lo que llevas del ciclo, contado desde tu día de corte.
            const { startDate, endDate } = toFullDayIsoRange(cycleToDate(cycleStartDay));
            return { startDate, endDate };
        }
```

Añade `toFullDayIsoRange` al import de `@/lib/date-range`, y `cycleStartDay` al array de dependencias del `useMemo`.

- [ ] **Step 3: Migrar TransactionFilters**

En `src/presentation/financial/components/TransactionFilters.tsx`:

1. Quita `defaultHubCustomRange` del import de `@/lib/date-range` y añade el del hook:

```ts
import { useCycleRange } from "@/presentation/components/period/PeriodSettingsProvider";
```

2. Borra la función `getDefaultCustomDates()` (líneas 66-70): era un envoltorio de una línea sobre la función que desaparece.

3. Dentro del componente, sustituye `const defaultCustom = getDefaultCustomDates();` por:

```tsx
    const cycle = useCycleRange();
```

y cambia las dos líneas siguientes para que usen `cycle.start` / `cycle.end` en vez de `defaultCustom.from` / `defaultCustom.to`:

```tsx
    const [customFrom, setCustomFrom] = useState(urlDateFrom ? toLocalDateValue(urlDateFrom) : cycle.start);
    const [customTo, setCustomTo] = useState(urlDateTo ? toLocalDateValue(urlDateTo) : cycle.end);
```

- [ ] **Step 4: Migrar la página servidor de transacciones**

En `src/app/financial/transactions/page.tsx`:

1. Sustituye el import de `defaultHubCustomRange`:

```ts
import { cycleRangeContaining, toFullDayIsoRange } from "@/lib/date-range";
import { periodSettingsService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
```

Si el archivo ya importa algo de `@/infrastructure/container`, añade `periodSettingsService` a ese import en vez de crear otro.

2. Sustituye el bloque del rango por defecto (líneas 51-57):

```ts
    // Rango por defecto: el ciclo que contiene hoy, con el día de corte que el
    // usuario haya guardado para Finanzas.
    if (!dateFrom && !dateTo && range !== 'all') {
        const userId = await requireUserId();
        const cycleStartDay = await periodSettingsService.getCycleStartDay(userId, 'FINANCIAL');
        const iso = toFullDayIsoRange(cycleRangeContaining(cycleStartDay));
        dateFrom = iso.startDate;
        dateTo = iso.endDate;
    }
```

- [ ] **Step 5: Verificar en la app**

Run: `npm run build`
Expected: build correcto.

Run: `npm run dev` y abre `http://localhost:3000/financial`.
Expected: el rango precargado sigue siendo 22 → 21 (el defecto de Finanzas), y la pestaña "Mes" ahora arranca en el día 22 del mes anterior en vez del día 1.

Abre `http://localhost:3000/financial/transactions`.
Expected: la lista trae el mismo rango 22 → 21 de siempre.

- [ ] **Step 6: Correr toda la batería de tests**

Run: `npm test`
Expected: PASS. Los tests de `defaultHubCustomRange` siguen pasando porque la función todavía existe (se borra en la Task 11).

- [ ] **Step 7: Commit**

```bash
git add src/presentation/financial/components/FinancialDashboard.tsx src/presentation/financial/components/TransactionFilters.tsx src/app/financial/transactions/page.tsx
git commit -m "feat(periodos): finanzas toma el rango del dia de corte del usuario"
```

---

### Task 9: Consumidor de Compras

**Files:**
- Modify: `src/presentation/components/analytics/MarketDateFilterBar.tsx:14-40` (la función `getDateRange`), `:97` y `:150`

**Interfaces:**
- Consumes: `useCycleStartDay`, `useCycleRange` (Task 7); `cycleRangeContaining`, `toFullDayIsoRange` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: Hacer que `getDateRange` reciba el día de corte**

En `src/presentation/components/analytics/MarketDateFilterBar.tsx`:

1. Cambia la firma de la función `getDateRange` (que hoy es `(type: FilterType) => …`) para que acepte el día:

```ts
const getDateRange = (type: FilterType, cycleStartDay: number) => {
```

2. Sustituye su rama `"month"` completa:

```ts
    if (type === "month") {
        // En Compras, "Mes" es el ciclo entero: se analiza un periodo cerrado,
        // no lo que se lleva gastado. Con día 1 es exactamente el mes natural.
        const { startDate, endDate } = toFullDayIsoRange(cycleRangeContaining(cycleStartDay));
        return { start: startDate, end: endDate };
    }
```

3. Ajusta los imports de `@/lib/date-range`: quita `defaultHubCustomRange`, añade `cycleRangeContaining` y `toFullDayIsoRange`. Añade también:

```ts
import { useCycleRange, useCycleStartDay } from "@/presentation/components/period/PeriodSettingsProvider";
```

- [ ] **Step 2: Consumir los hooks en el componente**

Dentro de `MarketDateFilterBar`, al principio y antes de los `useState`, añade:

```tsx
    const cycleStartDay = useCycleStartDay();
    const cycle = useCycleRange();
```

Después:

- Sustituye las **tres** llamadas a `getDateRange(...)` que hay en el cuerpo del componente por `getDateRange(..., cycleStartDay)`. Están en el `useEffect` de hidratación (dos: la del filtro ausente y la del `else` que rellena fechas faltantes) y en `updateFilter`.
- Sustituye las **dos** llamadas a `defaultHubCustomRange()` (líneas 97 y 150) por `cycle`, renombrando la variable local:

```tsx
                const def = cycle;
```

Deja el resto de cada bloque igual; solo cambia de dónde sale `def`.

- Añade `cycleStartDay` y `cycle` al array de dependencias del `useEffect` de hidratación.

- [ ] **Step 3: Verificar en la app**

Run: `npm run build`
Expected: build correcto.

Run: `npm run dev` y abre `http://localhost:3000/market/analytics`.
Expected: la pantalla sigue arrancando en "Mes" con el mes natural completo (1 → último día), exactamente igual que antes, porque el defecto de `MARKET` es 1. Al pulsar "Personalizado" el rango precargado ahora es ese mismo mes natural, no el 22 → 21 de antes.

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/components/analytics/MarketDateFilterBar.tsx
git commit -m "feat(periodos): compras toma el rango de su propio dia de corte"
```

---

### Task 10: Tablero de inicio

**Files:**
- Modify: `src/app/dashboard/page.tsx:47-53` y `:82-83`

**Interfaces:**
- Consumes: `cycleRangeContaining`, `cyclePreviousRange`, `toFullDayDates` (Task 1); `periodSettingsService` (Task 5).
- Produces: nada nuevo.

- [ ] **Step 1: Reescribir `periods()`**

En `src/app/dashboard/page.tsx`, sustituye la función `periods` (líneas 47-53) por:

```ts
/**
 * El ciclo corriente y el anterior, para poder comparar el gasto contra algo.
 *
 * Sigue el día de corte que el usuario tenga en Finanzas: si el tablero midiera
 * meses naturales, su cifra no cuadraría con la de /financial para nadie que
 * tenga un corte distinto del día 1.
 */
function periods(cycleStartDay: number, now: Date) {
    const current = toFullDayDates(cycleRangeContaining(cycleStartDay, now));
    const previous = toFullDayDates(cyclePreviousRange(cycleStartDay, now));
    return {
        startOfMonth: current.start,
        endOfMonth: current.end,
        startOfPrevious: previous.start,
        endOfPrevious: previous.end,
    };
}
```

Añade los imports:

```ts
import { cycleRangeContaining, cyclePreviousRange, toFullDayDates } from "@/lib/date-range";
```

y añade `periodSettingsService` al import que ya existe de `@/infrastructure/container`.

- [ ] **Step 2: Pasar el día de corte en la llamada**

Sustituye las líneas 82-83:

```ts
    const now = new Date();
    const cycleStartDay = await periodSettingsService.getCycleStartDay(userId, 'FINANCIAL');
    const { startOfMonth, endOfMonth, startOfPrevious, endOfPrevious } = periods(cycleStartDay, now);
```

`userId` ya está resuelto y comprobado justo arriba, en el `if (!userId) redirect(...)`.

Los nombres `startOfMonth`/`endOfMonth` se conservan a propósito: los usan siete llamadas más abajo y renombrarlos ensancharía el diff sin ganar nada.

- [ ] **Step 3: Verificar en la app**

Run: `npm run build`
Expected: build correcto.

Run: `npm run dev` y abre `http://localhost:3000/dashboard` en una ventana ancha (el tablero no se dibuja en móvil).
Expected: el KPI comparativo ahora mide el ciclo 22 → 21 contra el anterior, en vez de mes natural contra mes natural. La cifra cambia; el bloque se dibuja igual.

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(periodos): el kpi comparativo del tablero sigue el ciclo financiero"
```

---

### Task 11: Limpieza del código muerto

Ya no queda ningún llamante de `defaultHubCustomRange`, y `computeDateRange` nunca tuvo ninguno fuera de los tests. Se van los dos, con sus tests.

**Files:**
- Modify: `src/lib/date-range.ts` (borrar `defaultHubCustomRange`, `computeDateRange`, `ResolvedRange` si queda huérfano)
- Modify: `__tests__/lib/date-range.test.ts` (borrar sus `describe`)

**Interfaces:**
- Consumes: nada.
- Produces: nada. Es una eliminación.

- [ ] **Step 1: Comprobar que de verdad no quedan llamantes**

Busca `defaultHubCustomRange` y `computeDateRange` acotando la búsqueda a `src/` — con la búsqueda del editor, o desde Git Bash con `grep -rn "defaultHubCustomRange\|computeDateRange" src/`. No lances la búsqueda desde la raíz del repo: agota el tiempo por `node_modules/`, `.next/` y `.agent/`.

Expected: cero resultados fuera de `src/lib/date-range.ts`. **Si aparece alguno, párate**: una de las tareas 8, 9 o 10 quedó a medias, y hay que terminarla antes de borrar nada.

- [ ] **Step 2: Borrar las dos funciones**

En `src/lib/date-range.ts`, elimina:

- La función `computeDateRange` completa, con su bloque de comentario.
- La función `defaultHubCustomRange` completa, con su bloque de comentario.
- El tipo `ResolvedRange` y el tipo `RangeFilterType`, **solo si** ya no los usa nadie. Compruébalo antes: `RangeFilterType` puede seguir en uso por `STANDARD_PERIOD_PRESETS`, que se queda. Si sigue usándose, déjalos.

- [ ] **Step 3: Borrar sus tests**

En `__tests__/lib/date-range.test.ts`, elimina los `describe` de `defaultHubCustomRange` y de `computeDateRange` completos, y quita esos dos nombres del `import`.

Antes de borrar el de `defaultHubCustomRange`, léelo entero y comprueba que cada caso que cubría tiene su equivalente en el `describe("cycleRangeContaining")` de la Task 1 (rollover en el día del corte, cruce de año, febrero). Si encuentras uno que no esté cubierto, añádelo al describe nuevo con `cycleRangeContaining(22, …)` en vez de borrarlo.

- [ ] **Step 4: Verificar**

Run: `npm test`
Expected: PASS, sin tests de las funciones borradas.

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-range.ts __tests__/lib/date-range.test.ts
git commit -m "refactor(periodos): borrar el ciclo 22-21 escrito a mano y computeDateRange"
```

---

### Task 12: Pantalla de configuración

**Files:**
- Create: `src/presentation/components/period/PeriodSettingsManager.tsx`
- Modify: `src/presentation/financial/components/settings/SettingsDashboard.tsx`
- Modify: `src/app/financial/settings/page.tsx`
- Modify: `src/presentation/market/components/settings/MarketSettingsDashboard.tsx`
- Modify: `src/app/market/settings/page.tsx`
- Test: `__tests__/components/PeriodSettingsManager.test.tsx`

**Interfaces:**
- Consumes: `setCycleStartDayAction` (Task 6); `cycleRangeContaining` (Task 1); `PeriodScope`, `MAX_CYCLE_START_DAY`, `MIN_CYCLE_START_DAY` (Task 2); `periodSettingsService` (Task 5).
- Produces: `<PeriodSettingsManager scope={PeriodScope} cycleStartDay={number} financialCycleStartDay?={number} />`.

- [ ] **Step 1: Escribir el test que falla**

Crea `__tests__/components/PeriodSettingsManager.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PeriodSettingsManager } from "@/presentation/components/period/PeriodSettingsManager";

const setCycleStartDayAction = jest.fn();

jest.mock("@/app/actions/period-settings", () => ({
    setCycleStartDayAction: (...args: unknown[]) => setCycleStartDayAction(...args),
}));

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
    jest.clearAllMocks();
    setCycleStartDayAction.mockResolvedValue({ success: true, data: null });
    jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));
});

afterEach(() => {
    jest.useRealTimers();
});

describe("PeriodSettingsManager", () => {
    it("muestra el ciclo que corresponde al día guardado", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);
        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-08-22");
        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-09-21");
    });

    it("el atajo de mes natural recalcula la vista previa sin guardar", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);

        fireEvent.click(screen.getByRole("button", { name: /mes natural/i }));

        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-09-01");
        expect(screen.getByTestId("cycle-preview-current")).toHaveTextContent("2026-09-30");
        expect(setCycleStartDayAction).not.toHaveBeenCalled();
    });

    it("no avisa del recorte con días menores que 29", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={22} />);
        expect(screen.queryByTestId("short-month-warning")).toBeNull();
    });

    it("avisa del recorte con día 31", () => {
        render(<PeriodSettingsManager scope="FINANCIAL" cycleStartDay={31} />);
        expect(screen.getByTestId("short-month-warning")).toBeInTheDocument();
    });

    it("guarda con el ámbito y el día elegidos", async () => {
        // Este test no depende de la fecha y sí espera a una action: con los
        // timers falsos, `waitFor` y la transición de React compiten por el reloj.
        jest.useRealTimers();

        render(<PeriodSettingsManager scope="MARKET" cycleStartDay={1} />);

        fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

        await waitFor(() => {
            expect(setCycleStartDayAction).toHaveBeenCalledWith({ scope: "MARKET", cycleStartDay: 1 });
        });
    });

    it("en Compras muestra el ciclo financiero como referencia", () => {
        render(
            <PeriodSettingsManager scope="MARKET" cycleStartDay={1} financialCycleStartDay={22} />,
        );
        expect(screen.getByTestId("financial-cycle-reference")).toHaveTextContent("2026-08-22");
    });
});
```

- [ ] **Step 2: Correr el test y comprobar que falla**

Run: `npx jest __tests__/components/PeriodSettingsManager.test.tsx`
Expected: FAIL con `Cannot find module '@/presentation/components/period/PeriodSettingsManager'`.

- [ ] **Step 3: Implementar el componente**

Crea `src/presentation/components/period/PeriodSettingsManager.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import type { PeriodScope } from "@/domain/entities/period";
import { MAX_CYCLE_START_DAY, MIN_CYCLE_START_DAY } from "@/domain/entities/period";
import { cycleRangeContaining } from "@/lib/date-range";
import { setCycleStartDayAction } from "@/app/actions/period-settings";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SCOPE_QUESTION: Record<PeriodScope, string> = {
    FINANCIAL: "¿Qué día empieza tu mes financiero?",
    MARKET: "¿Qué día empieza tu mes de compras?",
};

const SCOPE_HINT: Record<PeriodScope, string> = {
    FINANCIAL: "Decide el rango que traen puestos el tablero, el resumen y la lista de transacciones.",
    MARKET: "Decide el rango que trae puesta la analítica de compras.",
};

/** El primer día en que un mes corto puede quedarse sin ese número. */
const SHORT_MONTH_THRESHOLD = 29;

const DAYS = Array.from(
    { length: MAX_CYCLE_START_DAY - MIN_CYCLE_START_DAY + 1 },
    (_, i) => MIN_CYCLE_START_DAY + i,
);

/** «22 ago – 21 sep 2026», con el año una sola vez al final. */
function formatCycle(range: { start: string; end: string }): string {
    const fmt = (value: string, withYear: boolean) =>
        new Date(`${value}T00:00:00`).toLocaleDateString("es-EC", {
            day: "numeric",
            month: "short",
            ...(withYear ? { year: "numeric" } : {}),
        });
    return `${fmt(range.start, false)} – ${fmt(range.end, true)}`;
}

/** Los `n` ciclos que siguen al que contiene hoy. */
function nextCycles(cycleStartDay: number, n: number): { start: string; end: string }[] {
    const cycles: { start: string; end: string }[] = [];
    let cursor = cycleRangeContaining(cycleStartDay);

    for (let i = 0; i < n; i++) {
        const dayAfter = new Date(`${cursor.end}T00:00:00`);
        dayAfter.setDate(dayAfter.getDate() + 1);
        cursor = cycleRangeContaining(cycleStartDay, dayAfter);
        cycles.push(cursor);
    }
    return cycles;
}

interface PeriodSettingsManagerProps {
    scope: PeriodScope;
    cycleStartDay: number;
    /** Solo en Compras: el ciclo financiero, como referencia informativa. */
    financialCycleStartDay?: number;
}

/**
 * El día en que empieza el mes del usuario, para un ámbito.
 *
 * La vista previa se recalcula con el valor del selector antes de guardar, así
 * que el usuario ve el efecto de su elección sin comprometerla.
 */
export function PeriodSettingsManager({
    scope, cycleStartDay, financialCycleStartDay,
}: PeriodSettingsManagerProps) {
    const router = useRouter();
    const [day, setDay] = useState(cycleStartDay);
    const [isPending, startTransition] = useTransition();

    const current = useMemo(() => cycleRangeContaining(day), [day]);
    const upcoming = useMemo(() => nextCycles(day, 2), [day]);
    const financialReference = useMemo(
        () => (financialCycleStartDay ? cycleRangeContaining(financialCycleStartDay) : null),
        [financialCycleStartDay],
    );

    function save() {
        startTransition(async () => {
            const result = await setCycleStartDayAction({ scope, cycleStartDay: day });
            if (result.success) {
                toast.success("Periodo guardado");
                router.refresh();
            } else {
                toast.error(result.error);
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">{SCOPE_QUESTION[scope]}</h3>
                <p className="text-sm text-muted-foreground">{SCOPE_HINT[scope]}</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Select value={String(day)} onValueChange={value => setDay(Number(value))}>
                    <SelectTrigger className="w-full sm:w-32" aria-label="Día de inicio">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DAYS.map(d => (
                            <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDay(MIN_CYCLE_START_DAY)}
                    className="w-full sm:w-auto"
                >
                    Mes natural — día 1
                </Button>
            </div>

            <div className="rounded-xl border bg-card/50 p-4 space-y-3">
                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tu ciclo actual</p>
                    <p data-testid="cycle-preview-current" className="text-base font-medium text-foreground">
                        <span className="sr-only">{`${current.start} ${current.end}`}</span>
                        {formatCycle(current)}
                    </p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Siguientes</p>
                    <p className="text-sm text-muted-foreground">
                        {upcoming.map(formatCycle).join(" · ")}
                    </p>
                </div>
            </div>

            {day >= SHORT_MONTH_THRESHOLD && (
                <div
                    data-testid="short-month-warning"
                    className="flex gap-3 rounded-xl border border-orange-500/50 bg-orange-500/10 p-4 text-sm text-orange-400"
                >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                        En los meses que no llegan al día {day}, el ciclo empieza el último día
                        disponible. Con día 31, febrero va del 31 de enero al 27 de febrero.
                    </p>
                </div>
            )}

            {financialReference && (
                <p data-testid="financial-cycle-reference" className="text-sm text-muted-foreground">
                    <span className="sr-only">{`${financialReference.start} ${financialReference.end}`}</span>
                    Tu ciclo financiero es {formatCycle(financialReference)}.
                </p>
            )}

            <Button onClick={save} disabled={isPending} className="w-full sm:w-auto">
                {isPending ? "Guardando…" : "Guardar"}
            </Button>
        </div>
    );
}
```

El `<span className="sr-only">` con las fechas en `YYYY-MM-DD` está para que el test pueda afirmar sobre valores exactos sin depender del formato localizado, que varía entre entornos de Node.

El botón Guardar solo se deshabilita mientras la action está en vuelo, no cuando el valor coincide con el guardado: volver a guardar el mismo día es inofensivo (un `upsert` idempotente), y bloquearlo obligaría al usuario a mover el selector para descubrir que ya estaba bien.

- [ ] **Step 4: Correr el test y comprobar que pasa**

Run: `npx jest __tests__/components/PeriodSettingsManager.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Añadir la pestaña en Configuración Financiera**

En `src/presentation/financial/components/settings/SettingsDashboard.tsx`:

1. Añade a la interfaz de props:

```ts
    financialCycleStartDay: number;
```

y al destructuring del componente.

2. Añade los imports:

```ts
import { CalendarRange } from "lucide-react";
import { PeriodSettingsManager } from "@/presentation/components/period/PeriodSettingsManager";
```

`CalendarRange` va dentro del import que ya existe de `lucide-react`.

3. Cambia `grid-cols-3` por `grid-cols-4` en el `className` de `TabsList`.

4. Añade el cuarto `TabsTrigger`, después del de "balances":

```tsx
                <TabsTrigger value="periods" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <CalendarRange className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Periodos</span>
                </TabsTrigger>
```

5. Añade su `TabsContent`, después del de "balances":

```tsx
            <TabsContent value="periods" className="mt-0">
                <PeriodSettingsManager scope="FINANCIAL" cycleStartDay={financialCycleStartDay} />
            </TabsContent>
```

- [ ] **Step 6: Cargar el día en la página de Configuración Financiera**

En `src/app/financial/settings/page.tsx`:

1. Añade el import:

```ts
import { getAllCycleStartDaysAction } from "@/app/actions/period-settings";
import { DEFAULT_CYCLE_START_DAY } from "@/domain/entities/period";
```

2. Añade `getAllCycleStartDaysAction()` al `Promise.all` y recoge su resultado:

```ts
    const [institutions, institutionTypes, categories, scopeResult, bankOverviewResult, cyclesResult] =
        await Promise.all([
            getInstitutionsAction(),
            getInstitutionTypesAction(),
            getCategoriesAction(),
            getBalanceScopeAction(),
            getBankOverviewAction(),
            getAllCycleStartDaysAction(),
        ]);
```

3. Resuelve el día con el mismo criterio tolerante que ya usa el archivo para los balances — un fallo de lectura no debe tumbar la pantalla:

```ts
    const financialCycleStartDay = cyclesResult.success
        ? cyclesResult.data.FINANCIAL
        : DEFAULT_CYCLE_START_DAY.FINANCIAL;
```

4. Pásalo como prop a `<SettingsDashboard … financialCycleStartDay={financialCycleStartDay} />`.

- [ ] **Step 7: Añadir la pestaña en Configuración de Market**

En `src/presentation/market/components/settings/MarketSettingsDashboard.tsx`:

1. Añade a la interfaz de props y al destructuring:

```ts
    periodsTab: React.ReactNode;
```

2. Añade `CalendarRange` al import de `lucide-react`.

3. Cambia `grid-cols-3` por `grid-cols-4`.

4. Añade el cuarto trigger y su contenido, después de "units":

```tsx
                <TabsTrigger value="periods" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm py-2">
                    <CalendarRange className="w-4 h-4" />
                    <span className="hidden sm:inline font-medium">Periodos</span>
                </TabsTrigger>
```

```tsx
            <TabsContent value="periods" className="mt-0">
                {periodsTab}
            </TabsContent>
```

El patrón de este dashboard es recibir las pestañas como `ReactNode` desde la página servidor; se respeta en vez de pasarle props sueltas.

- [ ] **Step 8: Cargar los dos días en la página de Configuración de Market**

En `src/app/market/settings/page.tsx`, que hoy no es `async`, conviértela y añade la pestaña:

```tsx
import { getAllCycleStartDaysAction } from "@/app/actions/period-settings";
import { DEFAULT_CYCLE_START_DAY } from "@/domain/entities/period";
import { PeriodSettingsManager } from "@/presentation/components/period/PeriodSettingsManager";

export default async function MarketSettingsPage() {
    const cyclesResult = await getAllCycleStartDaysAction();
    const cycles = cyclesResult.success ? cyclesResult.data : DEFAULT_CYCLE_START_DAY;

    return (
        // … el mismo JSX que ya hay, con una prop más en MarketSettingsDashboard:
        <MarketSettingsDashboard
            supermarketsTab={<SupermarketsTab />}
            categoriesTab={<CategoriesTab />}
            unitsTab={<UnitsTab />}
            periodsTab={
                <PeriodSettingsManager
                    scope="MARKET"
                    cycleStartDay={cycles.MARKET}
                    financialCycleStartDay={cycles.FINANCIAL}
                />
            }
        />
    );
}
```

Conserva el `<div>` de cabecera con el título y el `export const dynamic = 'force-dynamic'` que ya tiene el archivo.

- [ ] **Step 9: Verificar en la app**

Run: `npm run build`
Expected: build correcto.

Run: `npm run dev` y recorre las dos pantallas:

1. `http://localhost:3000/financial/settings` → pestaña "Periodos". Debe mostrar día 22 y el ciclo 22 → 21. Cámbialo a 1, comprueba que la vista previa pasa a mes natural **antes** de guardar, guarda, y confirma el toast.
2. Vuelve a `http://localhost:3000/financial`: el rango precargado debe ser ahora 1 → fin de mes.
3. `http://localhost:3000/market/settings` → pestaña "Periodos". Debe mostrar día 1, y la referencia "Tu ciclo financiero es…" con el ciclo que acabas de guardar.
4. Pon 31 en cualquiera de las dos y comprueba que aparece el aviso de meses cortos.
5. Comprueba en móvil (DevTools, ancho 375 px) que el selector y los botones ocupan el ancho completo y que las cuatro pestañas siguen legibles con solo el icono.

- [ ] **Step 10: Correr toda la batería**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add src/presentation/components/period/PeriodSettingsManager.tsx src/presentation/financial/components/settings/SettingsDashboard.tsx src/app/financial/settings/page.tsx src/presentation/market/components/settings/MarketSettingsDashboard.tsx src/app/market/settings/page.tsx __tests__/components/PeriodSettingsManager.test.tsx
git commit -m "feat(periodos): pantalla para elegir el dia en que empieza el mes"
```

---

## Verificación final

Con las doce tareas hechas, antes de dar el trabajo por terminado:

- [ ] `npm test` en verde.
- [ ] `npm run build` sin errores.
- [ ] `npm run lint` sin errores.
- [ ] Buscar `defaultHubCustomRange` y `computeDateRange` en `src/` y `__tests__/`: cero resultados.
- [ ] Buscar el literal `22` como día de corte en `src/`: solo debe aparecer en `DEFAULT_CYCLE_START_DAY` de `src/domain/entities/period.ts`.
- [ ] Con un usuario sin ninguna fila en `user_period_settings`: `/financial` arranca en 22 → 21, `/market/analytics` en 1 → fin de mes.
- [ ] Guardar un día en un ámbito no mueve el rango del otro módulo.
