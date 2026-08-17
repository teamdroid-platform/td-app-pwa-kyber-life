# Módulo Bancos — Núcleo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el módulo Bancos hasta el punto en que el usuario registra sus instituciones, cuentas y tarjetas a mano, las ata a transacciones, y ve saldo por cuenta y deuda por tarjeta de crédito con su ciclo de facturación.

**Architecture:** Clean Architecture del repo, sin desviaciones. Cinco tablas nuevas con prefijo `bank_`, seis columnas nuevas en `financial_transactions`, y una vista `bank_movements` que explota cada transacción en líneas de libro mayor sin tabla física. Los cálculos de saldo y deuda son funciones puras en el dominio; los repos solo leen y escriben.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estricto, Supabase (Postgres 17 + RLS), Zod 4, Tailwind v4, shadcn/ui, Jest.

**Spec:** [docs/superpowers/specs/2026-08-12-modulo-bancos-design.md](../specs/2026-08-12-modulo-bancos-design.md)

**Fuera de este plan:** la identificación automática de números (huella, emparejamiento por compatibilidad, cascada de auto-creación) y el backfill del historial con su pantalla de conciliación. Van en un segundo plan que depende de éste. Mientras tanto, las cuentas y tarjetas se registran a mano y las transacciones se atan con los selectores del wizard.

## Global Constraints

- **Nunca commitear, pushear, abrir PRs ni desplegar sin permiso explícito del usuario.** Los pasos de `git commit` de este plan requieren esa autorización antes de ejecutarse.
- TypeScript estricto. Nada de `any` salvo necesidad demostrada.
- Diseño mobile-first obligatorio. Los cambios visuales preservan la estética del módulo financiero; `src/presentation/financial/components/BalanceHeroCard.tsx` es la referencia para los paneles de saldo.
- Archivos temporales o de experimento van en `scratch/` (gitignored), nunca sueltos en el repo.
- Toda tabla nueva lleva RLS activo con las cuatro políticas (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) sobre `auth.uid() = owner_user_id`, siguiendo el estilo de `supabase/migrations/20260518235300_financial_module_init.sql`.
- Las migraciones se aplican con el MCP de Supabase (`apply_migration`) sobre el proyecto **KyberLife `xywkuwmhnfcdksamuypk`**, y el archivo queda versionado en `supabase/migrations/`.
- Las server actions siguen el patrón del repo: validar con Zod, resolver usuario con `requireUserId()` de `@/infrastructure/supabase/auth-user`, llamar al servicio del container, devolver `{ success: true, data }` o `{ success: false, error }`. Nunca lanzar al cliente.
- Moneda por defecto `USD`. Los montos se guardan `numeric(14,2)`.
- Tests con Jest. Los de servicios y dominio corren con `npx jest --config jest.unit.config.js`; los de componentes con `npm test`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260812120000_bank_module_init.sql` | Enums, `bank_institutions`, RLS, duplicado de los 5 bancos existentes |
| `supabase/migrations/20260812120100_bank_accounts_and_cards.sql` | `bank_accounts`, `bank_cards`, sus CHECK e índices |
| `supabase/migrations/20260812120200_bank_snapshots_and_statements.sql` | `bank_account_balance_snapshots`, `bank_card_statements` |
| `supabase/migrations/20260812120300_bank_transaction_links.sql` | Columnas nuevas en `financial_transactions` y vista `bank_movements` |
| `supabase/migrations/20260812120400_drop_financial_accounts.sql` | Elimina `financial_accounts` y `financial_transactions.account_id` |
| `src/domain/entities/bank.ts` | Entidades y uniones de tipo del módulo |
| `src/domain/repositories/bank.ts` | Interfaces de repositorio |
| `src/domain/services/bank-balance.ts` | Saldo, deuda, cupo, saldo corrido, período de facturación. Puro |
| `src/lib/format-bank-number.ts` | Formato de presentación de números |
| `src/infrastructure/repositories/supabase/bank-institution-repository.ts` | Persistencia de instituciones |
| `src/infrastructure/repositories/supabase/bank-account-repository.ts` | Persistencia de cuentas y snapshots |
| `src/infrastructure/repositories/supabase/bank-card-repository.ts` | Persistencia de tarjetas y estados de cuenta |
| `src/infrastructure/repositories/supabase/bank-movement-repository.ts` | Lectura de la vista `bank_movements` |
| `src/application/services/bank-service.ts` | Orquestación: CRUD, saldos agregados, cierre perezoso de estados |
| `src/lib/validators/bank-schemas.ts` | Esquemas Zod |
| `src/app/actions/bank.ts` | Server actions |
| `src/presentation/bank/components/*` | UI del módulo |
| `src/app/financial/banks/**` | Rutas |

---

## Task 1: Esquema base — enums, instituciones y duplicado de bancos

**Files:**
- Create: `supabase/migrations/20260812120000_bank_module_init.sql`
- Test: verificación por consulta SQL con el MCP de Supabase

**Interfaces:**
- Consumes: `financial_institutions`, `financial_institution_types` (existentes)
- Produce: tipos `bank_institution_kind`, `bank_account_type`, `bank_account_status`, `bank_card_type`, `bank_card_status`, `bank_snapshot_source`, `bank_statement_status`; tabla `bank_institutions`

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260812120000_bank_module_init.sql`:

```sql
-- Enums del módulo Bancos
CREATE TYPE bank_institution_kind AS ENUM ('BANK', 'COOPERATIVE', 'WALLET', 'OTHER');
CREATE TYPE bank_account_type     AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT');
CREATE TYPE bank_account_status   AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE bank_card_type        AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE bank_card_status      AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CLOSED');
CREATE TYPE bank_snapshot_source  AS ENUM ('MANUAL', 'SCAN', 'INITIAL');
CREATE TYPE bank_statement_status AS ENUM ('OPEN', 'CLOSED', 'PAID', 'OVERDUE');

CREATE TABLE bank_institutions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    short_name               TEXT,
    kind                     bank_institution_kind NOT NULL DEFAULT 'BANK',
    logo_url                 TEXT,
    color                    TEXT,
    country                  TEXT DEFAULT 'EC',
    financial_institution_id UUID REFERENCES financial_institutions(id) ON DELETE SET NULL,
    is_unconfirmed           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX bank_institutions_owner_name_uq
    ON bank_institutions (owner_user_id, lower(name)) WHERE is_deleted = FALSE;

ALTER TABLE bank_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_institutions"   ON bank_institutions FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_institutions" ON bank_institutions FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_institutions" ON bank_institutions FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_institutions" ON bank_institutions FOR DELETE USING (auth.uid() = owner_user_id);

-- Duplica al lado nuevo los comercios que en realidad son emisores, dejando
-- intacta la fila original: hay retiros cuyo comercio ES el banco.
INSERT INTO bank_institutions (owner_user_id, name, kind, logo_url, financial_institution_id)
SELECT fi.owner_user_id,
       fi.name,
       CASE
           WHEN fi.name ILIKE '%coop%' OR fi.name ILIKE '%COAC%' THEN 'COOPERATIVE'::bank_institution_kind
           WHEN fit.code = 'DIGITAL_WALLET' OR fi.name ILIKE '%deuna%'  THEN 'WALLET'::bank_institution_kind
           ELSE 'BANK'::bank_institution_kind
       END,
       fi.logo_url,
       fi.id
FROM financial_institutions fi
LEFT JOIN financial_institution_types fit ON fit.id = fi.institution_type_id
WHERE fit.label IN ('Institución Financiera', 'Billetera Digital')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Aplicar y verificar que falla si el enum ya existe**

Aplicar con el MCP de Supabase (`apply_migration`, proyecto `xywkuwmhnfcdksamuypk`, nombre `bank_module_init`).

Si la migración se corrió antes, `CREATE TYPE` falla con `type "bank_institution_kind" already exists`. En ese caso hay que revertir a mano antes de reintentar; no añadir `IF NOT EXISTS` a los `CREATE TYPE` porque enmascara una migración a medio aplicar.

- [ ] **Step 3: Verificar el duplicado**

Ejecutar con `execute_sql`:

```sql
SELECT bi.name, bi.kind, fi.name AS comercio_gemelo
FROM bank_institutions bi
LEFT JOIN financial_institutions fi ON fi.id = bi.financial_institution_id
ORDER BY bi.name;
```

Esperado: 5 filas — Banco del Austro, Banco del Pacifico, Banco Pichincha, COAC Jardín Azuayo (`COOPERATIVE`), Deuna (`WALLET`). Cada una con su comercio gemelo poblado.

Verificar además que los comercios siguen ahí:

```sql
SELECT count(*) FROM financial_institutions;
```

Esperado: 139.

- [ ] **Step 4: Commit** *(requiere permiso explícito del usuario)*

```bash
git add supabase/migrations/20260812120000_bank_module_init.sql
git commit -m "feat(bancos): agrega enums y tabla bank_institutions"
```

---

## Task 2: Cuentas y tarjetas

**Files:**
- Create: `supabase/migrations/20260812120100_bank_accounts_and_cards.sql`

**Interfaces:**
- Consumes: `bank_institutions`, enums de la Task 1
- Produce: tablas `bank_accounts`, `bank_cards`

- [ ] **Step 1: Escribir la migración**

```sql
CREATE TABLE bank_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES bank_institutions(id) ON DELETE RESTRICT,
    name           TEXT NOT NULL,
    account_type   bank_account_type NOT NULL,
    last_four      TEXT,
    prefix_digits  TEXT,
    currency       TEXT NOT NULL DEFAULT 'USD',
    status         bank_account_status NOT NULL DEFAULT 'ACTIVE',
    is_unconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    -- El efectivo no tiene emisor; toda otra cuenta sí
    CONSTRAINT bank_accounts_cash_has_no_institution
        CHECK ((account_type = 'CASH') = (institution_id IS NULL))
);

CREATE UNIQUE INDEX bank_accounts_one_cash_per_owner
    ON bank_accounts (owner_user_id) WHERE account_type = 'CASH' AND is_deleted = FALSE;
CREATE INDEX bank_accounts_owner_lastfour_idx
    ON bank_accounts (owner_user_id, last_four) WHERE is_deleted = FALSE;

CREATE TABLE bank_cards (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES bank_institutions(id) ON DELETE RESTRICT,
    account_id     UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    name           TEXT NOT NULL,
    card_type      bank_card_type NOT NULL,
    brand          TEXT,
    bin            TEXT,
    last_four      TEXT,
    prefix_digits  TEXT,
    currency       TEXT NOT NULL DEFAULT 'USD',
    credit_limit   NUMERIC(14,2),
    statement_day  SMALLINT CHECK (statement_day BETWEEN 1 AND 31),
    due_day        SMALLINT CHECK (due_day BETWEEN 1 AND 31),
    status         bank_card_status NOT NULL DEFAULT 'ACTIVE',
    is_unconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,

    -- El débito vive sobre una cuenta; el crédito lo emite la institución
    CONSTRAINT bank_cards_debit_requires_account
        CHECK (card_type <> 'DEBIT' OR account_id IS NOT NULL),
    CONSTRAINT bank_cards_credit_has_no_account
        CHECK (card_type <> 'CREDIT' OR account_id IS NULL),
    -- Solo el crédito tiene cupo y ciclo
    CONSTRAINT bank_cards_debit_has_no_credit_fields
        CHECK (card_type <> 'DEBIT'
               OR (credit_limit IS NULL AND statement_day IS NULL AND due_day IS NULL))
);

CREATE INDEX bank_cards_owner_lastfour_idx
    ON bank_cards (owner_user_id, last_four) WHERE is_deleted = FALSE;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_accounts"   ON bank_accounts FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_accounts" ON bank_accounts FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_accounts" ON bank_accounts FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_accounts" ON bank_accounts FOR DELETE USING (auth.uid() = owner_user_id);

ALTER TABLE bank_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_cards"   ON bank_cards FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_cards" ON bank_cards FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_cards" ON bank_cards FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_cards" ON bank_cards FOR DELETE USING (auth.uid() = owner_user_id);
```

- [ ] **Step 2: Aplicar la migración**

MCP de Supabase, `apply_migration`, nombre `bank_accounts_and_cards`.

- [ ] **Step 3: Verificar que los CHECK rechazan el estado inválido**

Ejecutar con `execute_sql`, uno por uno. Cada uno **debe fallar**:

```sql
-- Debe fallar: bank_accounts_cash_has_no_institution
INSERT INTO bank_accounts (owner_user_id, name, account_type)
VALUES ('00000000-0000-0000-0000-000000000000', 'Corriente sin banco', 'CHECKING');
```

```sql
-- Debe fallar: bank_cards_credit_has_no_account
INSERT INTO bank_cards (owner_user_id, institution_id, account_id, name, card_type)
SELECT a.owner_user_id, a.institution_id, a.id, 'TC atada', 'CREDIT'
FROM bank_accounts a LIMIT 1;
```

Si alguno **inserta**, el CHECK está mal escrito y hay que corregirlo antes de seguir.

- [ ] **Step 4: Commit** *(requiere permiso explícito del usuario)*

```bash
git add supabase/migrations/20260812120100_bank_accounts_and_cards.sql
git commit -m "feat(bancos): agrega bank_accounts y bank_cards con sus invariantes"
```

---

## Task 3: Cortes de saldo y estados de cuenta

**Files:**
- Create: `supabase/migrations/20260812120200_bank_snapshots_and_statements.sql`

**Interfaces:**
- Consumes: `bank_accounts`, `bank_cards`
- Produce: tablas `bank_account_balance_snapshots`, `bank_card_statements`

- [ ] **Step 1: Escribir la migración**

```sql
CREATE TABLE bank_account_balance_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id    UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    balance       NUMERIC(14,2) NOT NULL,
    as_of         TIMESTAMPTZ NOT NULL,
    source        bank_snapshot_source NOT NULL DEFAULT 'MANUAL',
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX bank_snapshots_account_asof_idx
    ON bank_account_balance_snapshots (account_id, as_of DESC) WHERE is_deleted = FALSE;

CREATE TABLE bank_card_statements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id         UUID NOT NULL REFERENCES bank_cards(id) ON DELETE CASCADE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    due_date        DATE NOT NULL,
    computed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(14,2),
    paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    status          bank_statement_status NOT NULL DEFAULT 'OPEN',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT bank_card_statements_period_order CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX bank_card_statements_card_period_uq
    ON bank_card_statements (card_id, period_start) WHERE is_deleted = FALSE;

ALTER TABLE bank_account_balance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_snapshots"   ON bank_account_balance_snapshots FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_snapshots" ON bank_account_balance_snapshots FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_snapshots" ON bank_account_balance_snapshots FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_snapshots" ON bank_account_balance_snapshots FOR DELETE USING (auth.uid() = owner_user_id);

ALTER TABLE bank_card_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_card_statements"   ON bank_card_statements FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_card_statements" ON bank_card_statements FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_card_statements" ON bank_card_statements FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_card_statements" ON bank_card_statements FOR DELETE USING (auth.uid() = owner_user_id);
```

- [ ] **Step 2: Aplicar y verificar**

`apply_migration` con nombre `bank_snapshots_and_statements`. Después:

```sql
SELECT table_name, row_security
FROM information_schema.tables t
JOIN pg_tables p ON p.tablename = t.table_name
WHERE t.table_name LIKE 'bank_%';
```

Esperado: las 4 tablas creadas hasta ahora con `row_security = true`.

- [ ] **Step 3: Commit** *(requiere permiso explícito del usuario)*

```bash
git add supabase/migrations/20260812120200_bank_snapshots_and_statements.sql
git commit -m "feat(bancos): agrega cortes de saldo y estados de cuenta"
```

---

## Task 4: Enlaces desde la transacción y vista de movimientos

**Files:**
- Create: `supabase/migrations/20260812120300_bank_transaction_links.sql`

**Interfaces:**
- Consumes: `financial_transactions`, todas las tablas `bank_*`
- Produce: seis columnas nuevas en `financial_transactions`; vista `bank_movements` con columnas `transaction_id, owner_user_id, date, account_id, card_id, direction, amount, currency, description, merchant, category_id`

**Nota:** `bank_counterparty_observation_id` se declara aquí como `UUID` sin FK. La tabla `bank_number_observations` a la que apunta llega en el segundo plan; la restricción se añade entonces. Declararla ahora evita una segunda migración sobre `financial_transactions`.

- [ ] **Step 1: Escribir la migración**

```sql
ALTER TABLE financial_transactions
    ADD COLUMN IF NOT EXISTS bank_source_account_id           UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_destination_account_id      UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_card_id                     UUID REFERENCES bank_cards(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_institution_id              UUID REFERENCES bank_institutions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_card_statement_id           UUID REFERENCES bank_card_statements(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_counterparty_observation_id UUID;

CREATE INDEX IF NOT EXISTS financial_transactions_bank_source_idx
    ON financial_transactions (bank_source_account_id, date DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_bank_dest_idx
    ON financial_transactions (bank_destination_account_id, date DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_bank_card_idx
    ON financial_transactions (bank_card_id, date DESC);

-- Libro mayor derivado. Sin tabla física: la transacción sigue siendo la única
-- fuente de verdad, y editarla no puede desincronizar ningún saldo.
CREATE VIEW bank_movements AS
    SELECT t.id AS transaction_id, t.owner_user_id, t.date,
           t.bank_source_account_id AS account_id, NULL::UUID AS card_id,
           'OUT'::TEXT AS direction, t.amount, t.currency,
           t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.bank_source_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           t.bank_destination_account_id, NULL::UUID,
           'IN', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.bank_destination_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID, t.bank_card_id,
           'CHARGE', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      JOIN bank_cards c ON c.id = t.bank_card_id
     WHERE c.card_type = 'CREDIT' AND t.paid_with_credit = TRUE
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID, s.card_id,
           'PAYMENT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      JOIN bank_card_statements s ON s.id = t.bank_card_statement_id
     WHERE t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE');

-- La vista hereda RLS de financial_transactions por security_invoker
ALTER VIEW bank_movements SET (security_invoker = on);
```

- [ ] **Step 2: Aplicar la migración**

`apply_migration` con nombre `bank_transaction_links`.

- [ ] **Step 3: Verificar que la vista no emite nada todavía**

```sql
SELECT direction, count(*) FROM bank_movements GROUP BY direction;
```

Esperado: cero filas. Ninguna transacción tiene aún columnas `bank_*` pobladas — si aparece algo, alguna migración anterior escribió datos que no debía.

- [ ] **Step 4: Verificar la regla de retiro con datos de prueba**

Insertar a mano una cuenta bancaria, una de efectivo y una transacción de retiro que las una, y comprobar que la vista emite exactamente dos líneas que se cancelan:

```sql
SELECT direction, amount FROM bank_movements WHERE transaction_id = '<id de la transacción de prueba>';
```

Esperado: una fila `OUT` y una `IN`, ambas con el mismo monto. Borrar los datos de prueba después.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add supabase/migrations/20260812120300_bank_transaction_links.sql
git commit -m "feat(bancos): enlaza transacciones a cuentas y agrega vista bank_movements"
```

---

## Task 5: Retirar `financial_accounts`

**Files:**
- Create: `supabase/migrations/20260812120400_drop_financial_accounts.sql`
- Delete: `src/presentation/financial/components/settings/AccountManager.tsx`
- Delete: `src/presentation/financial/components/AccountSelect.tsx`
- Modify: `src/domain/entities/financial.ts` (quitar `FinancialAccount`)
- Modify: `src/domain/repositories/financial.ts` (quitar `IFinancialAccountRepository`)
- Modify: `src/infrastructure/repositories/implementations.ts` (quitar `InMemoryFinancialAccountRepository`)
- Modify: `src/infrastructure/repositories/supabase/` (quitar `SupabaseFinancialAccountRepository`)
- Modify: `src/infrastructure/container.ts` (quitar el cableado)
- Modify: `src/app/actions/financial-settings.ts` (quitar las 4 acciones de cuenta)
- Modify: `src/presentation/financial/components/settings/SettingsDashboard.tsx` (quitar la pestaña)
- Modify: `src/infrastructure/offline/financial-sync-queue.ts` (quitar los jobs de cuenta si los hay)

**Interfaces:**
- Produce: ninguna. Retira superficie muerta antes de que la nueva la reemplace.

La tabla tiene 0 filas y `financial_transactions.account_id` está siempre en null: no hay datos que migrar.

- [ ] **Step 1: Confirmar que no hay datos que perder**

```sql
SELECT (SELECT count(*) FROM financial_accounts) AS cuentas,
       (SELECT count(*) FROM financial_transactions WHERE account_id IS NOT NULL) AS tx_con_cuenta;
```

Esperado: `0, 0`. **Si alguno no es cero, detenerse** y avisar al usuario antes de continuar.

- [ ] **Step 2: Escribir la migración**

```sql
ALTER TABLE financial_transactions DROP COLUMN IF EXISTS account_id;
DROP TABLE IF EXISTS financial_accounts;
```

- [ ] **Step 3: Aplicar la migración**

`apply_migration` con nombre `drop_financial_accounts`.

- [ ] **Step 4: Quitar el código muerto**

Borrar los dos componentes y todas las referencias listadas arriba. Para encontrarlas:

```bash
grep -rn "FinancialAccount\|AccountSelect\|AccountManager\|accountId" src/ __tests__/
```

Quitar de `SettingsDashboard.tsx` el `TabsTrigger` y el `TabsContent` de cuentas, y su prop `accounts` junto con la llamada a `getAccountsAction` en `src/app/financial/settings/page.tsx`.

- [ ] **Step 5: Verificar que compila y los tests pasan**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: sin errores. Si algún test mockea `financialAccountRepository`, borrar ese mock.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add -A
git commit -m "refactor(financial): retira financial_accounts, sin uso desde su creación"
```

---

## Task 6: Entidades e interfaces de dominio

**Files:**
- Create: `src/domain/entities/bank.ts`
- Create: `src/domain/repositories/bank.ts`
- Modify: `src/domain/entities/index.ts` (re-exportar)
- Modify: `src/domain/repositories/index.ts` (re-exportar)

**Interfaces:**
- Consumes: `BaseEntity`, `UUID`, `ISODate` de `src/domain/core.ts`
- Produce: `BankInstitution`, `BankAccount`, `BankCard`, `BankAccountBalanceSnapshot`, `BankCardStatement`, `BankMovement` y sus uniones de tipo; las seis interfaces de repositorio

- [ ] **Step 1: Escribir las entidades**

Crear `src/domain/entities/bank.ts`:

```ts
import { BaseEntity, UUID, ISODate } from "../core";

export type BankInstitutionKind = 'BANK' | 'COOPERATIVE' | 'WALLET' | 'OTHER';
export type BankAccountType = 'CHECKING' | 'SAVINGS' | 'CASH' | 'INVESTMENT';
export type BankAccountStatus = 'ACTIVE' | 'CLOSED';
export type BankCardType = 'DEBIT' | 'CREDIT';
export type BankCardStatus = 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'CLOSED';
export type BankSnapshotSource = 'MANUAL' | 'SCAN' | 'INITIAL';
export type BankStatementStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE';

/** Dirección de una línea del libro mayor derivado. */
export type BankMovementDirection = 'IN' | 'OUT' | 'CHARGE' | 'PAYMENT';

export interface BankInstitution extends BaseEntity {
    ownerUserId: UUID;
    name: string;
    shortName?: string | null;
    kind: BankInstitutionKind;
    logoUrl?: string | null;
    color?: string | null;
    country?: string | null;
    /** Puente al comercio gemelo en financial_institutions. */
    financialInstitutionId?: UUID | null;
    isUnconfirmed: boolean;
}

export interface BankAccount extends BaseEntity {
    ownerUserId: UUID;
    /** Null solo para la cuenta de efectivo. */
    institutionId?: UUID | null;
    name: string;
    accountType: BankAccountType;
    lastFour?: string | null;
    prefixDigits?: string | null;
    currency: string;
    status: BankAccountStatus;
    isUnconfirmed: boolean;
    /** Enriquecido en lectura, no persiste. */
    institutionName?: string;
}

export interface BankCard extends BaseEntity {
    ownerUserId: UUID;
    institutionId: UUID;
    /** Obligatorio en DEBIT, siempre null en CREDIT. */
    accountId?: UUID | null;
    name: string;
    cardType: BankCardType;
    brand?: string | null;
    bin?: string | null;
    lastFour?: string | null;
    prefixDigits?: string | null;
    currency: string;
    creditLimit?: number | null;
    statementDay?: number | null;
    dueDay?: number | null;
    status: BankCardStatus;
    isUnconfirmed: boolean;
    institutionName?: string;
    accountName?: string;
}

export interface BankAccountBalanceSnapshot extends BaseEntity {
    ownerUserId: UUID;
    accountId: UUID;
    balance: number;
    asOf: ISODate;
    source: BankSnapshotSource;
    note?: string | null;
}

export interface BankCardStatement extends BaseEntity {
    ownerUserId: UUID;
    cardId: UUID;
    periodStart: ISODate;
    periodEnd: ISODate;
    dueDate: ISODate;
    /** Lo que la app sumó de consumos detectados. */
    computedAmount: number;
    /** Lo que declara el banco. Null significa "igual al calculado". */
    totalAmount?: number | null;
    paidAmount: number;
    status: BankStatementStatus;
}

/** Fila de la vista bank_movements. No es una entidad persistida. */
export interface BankMovement {
    transactionId: UUID;
    ownerUserId: UUID;
    date: ISODate;
    accountId?: UUID | null;
    cardId?: UUID | null;
    direction: BankMovementDirection;
    amount: number;
    currency: string;
    description?: string | null;
    merchant?: string | null;
    categoryId?: UUID | null;
}
```

- [ ] **Step 2: Escribir las interfaces de repositorio**

Crear `src/domain/repositories/bank.ts`:

```ts
import { UUID, ISODate } from "../core";
import { IRepository } from "./index";
import {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement
} from "../entities/bank";

export interface IBankInstitutionRepository extends IRepository<BankInstitution> {
    findByOwnerId(userId: UUID): Promise<BankInstitution[]>;
    findByName(userId: UUID, name: string): Promise<BankInstitution | null>;
}

export interface IBankAccountRepository extends IRepository<BankAccount> {
    findByOwnerId(userId: UUID): Promise<BankAccount[]>;
    findByInstitutionId(userId: UUID, institutionId: UUID): Promise<BankAccount[]>;
    /** La cuenta de efectivo del usuario, o null si aún no existe. */
    findCashAccount(userId: UUID): Promise<BankAccount | null>;
}

export interface IBankCardRepository extends IRepository<BankCard> {
    findByOwnerId(userId: UUID): Promise<BankCard[]>;
    findByAccountId(userId: UUID, accountId: UUID): Promise<BankCard[]>;
}

export interface IBankAccountBalanceSnapshotRepository extends IRepository<BankAccountBalanceSnapshot> {
    /** El corte más reciente con as_of <= reference, o null. */
    findLatestForAccount(accountId: UUID, reference: ISODate): Promise<BankAccountBalanceSnapshot | null>;
    findByAccountId(accountId: UUID): Promise<BankAccountBalanceSnapshot[]>;
}

export interface IBankCardStatementRepository extends IRepository<BankCardStatement> {
    findByCardId(cardId: UUID): Promise<BankCardStatement[]>;
    findOpenForCard(cardId: UUID): Promise<BankCardStatement | null>;
    findByCardAndPeriodStart(cardId: UUID, periodStart: ISODate): Promise<BankCardStatement | null>;
}

export interface BankMovementFilter {
    accountId?: UUID;
    cardId?: UUID;
    /** Solo movimientos con date > since. */
    since?: ISODate;
    until?: ISODate;
    limit?: number;
}

/** Solo lectura: la vista bank_movements se deriva de financial_transactions. */
export interface IBankMovementRepository {
    find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]>;
    findAllForOwner(userId: UUID): Promise<BankMovement[]>;
}
```

- [ ] **Step 3: Re-exportar**

Añadir a `src/domain/entities/index.ts`:

```ts
export * from "./bank";
```

Y a `src/domain/repositories/index.ts`:

```ts
export * from "./bank";
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/domain/entities/bank.ts src/domain/repositories/bank.ts src/domain/entities/index.ts src/domain/repositories/index.ts
git commit -m "feat(bancos): agrega entidades e interfaces de repositorio"
```

---

## Task 7: Cálculos de saldo y deuda

**Files:**
- Create: `src/domain/services/bank-balance.ts`
- Test: `__tests__/domain/bank-balance.test.ts`

**Interfaces:**
- Consumes: `BankMovement`, `BankAccountBalanceSnapshot`, `BankCardStatement` de `src/domain/entities/bank.ts`
- Produce: `computeAccountBalance`, `computeCardDebt`, `computeAvailableCredit`, `computeStatementDue`, `runningBalances`, `statementPeriodFor`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/domain/bank-balance.test.ts`:

```ts
import {
    computeAccountBalance, computeCardDebt, computeAvailableCredit,
    computeStatementDue, runningBalances, statementPeriodFor,
} from "@/domain/services/bank-balance";
import { BankMovement, BankAccountBalanceSnapshot, BankCardStatement } from "@/domain/entities/bank";

function mov(partial: Partial<BankMovement>): BankMovement {
    return {
        transactionId: "t", ownerUserId: "u", date: "2026-08-10T00:00:00Z",
        direction: "OUT", amount: 0, currency: "USD", ...partial,
    } as BankMovement;
}

describe("computeAccountBalance", () => {
    it("suma entradas y resta salidas cuando no hay corte", () => {
        const movs = [
            mov({ direction: "IN", amount: 500 }),
            mov({ direction: "OUT", amount: 74.19 }),
        ];
        expect(computeAccountBalance(null, movs)).toBe(425.81);
    });

    it("parte del corte e ignora los movimientos anteriores a as_of", () => {
        const snapshot: BankAccountBalanceSnapshot = {
            id: "s", ownerUserId: "u", accountId: "a", balance: 2310,
            asOf: "2026-08-01T00:00:00Z", source: "MANUAL",
            createdAt: "", updatedAt: "", isDeleted: false,
        };
        const movs = [
            mov({ date: "2026-07-20T00:00:00Z", direction: "OUT", amount: 999 }),
            mov({ date: "2026-08-05T00:00:00Z", direction: "OUT", amount: 205.82 }),
        ];
        expect(computeAccountBalance(snapshot, movs)).toBe(2104.18);
    });

    it("ignora las líneas de tarjeta", () => {
        const movs = [
            mov({ direction: "IN", amount: 100 }),
            mov({ direction: "CHARGE", amount: 50 }),
            mov({ direction: "PAYMENT", amount: 50 }),
        ];
        expect(computeAccountBalance(null, movs)).toBe(100);
    });
});

describe("computeCardDebt", () => {
    it("resta los pagos de los consumos", () => {
        const movs = [
            mov({ direction: "CHARGE", amount: 405 }),
            mov({ direction: "CHARGE", amount: 186.4 }),
            mov({ direction: "PAYMENT", amount: 100 }),
        ];
        expect(computeCardDebt(movs)).toBe(491.4);
    });

    it("ignora las líneas de cuenta", () => {
        expect(computeCardDebt([mov({ direction: "OUT", amount: 80 })])).toBe(0);
    });
});

describe("computeAvailableCredit", () => {
    it("resta la deuda del cupo", () => {
        expect(computeAvailableCredit(3000, 842.15)).toBe(2157.85);
    });

    it("devuelve null cuando no hay cupo declarado", () => {
        expect(computeAvailableCredit(null, 842.15)).toBeNull();
    });
});

describe("computeStatementDue", () => {
    const base: BankCardStatement = {
        id: "st", ownerUserId: "u", cardId: "c",
        periodStart: "2026-07-21", periodEnd: "2026-08-20", dueDate: "2026-08-28",
        computedAmount: 611.4, totalAmount: null, paidAmount: 0, status: "OPEN",
        createdAt: "", updatedAt: "", isDeleted: false,
    };

    it("usa el calculado cuando el banco no declaró total", () => {
        expect(computeStatementDue(base)).toBe(611.4);
    });

    it("el total declarado por el banco manda sobre el calculado", () => {
        expect(computeStatementDue({ ...base, totalAmount: 658.9 })).toBe(658.9);
    });

    it("descuenta lo ya pagado", () => {
        expect(computeStatementDue({ ...base, totalAmount: 658.9, paidAmount: 200 })).toBe(458.9);
    });
});

describe("runningBalances", () => {
    it("devuelve el saldo después de cada movimiento, del más reciente al más antiguo", () => {
        const movs = [
            mov({ date: "2026-08-12T00:00:00Z", direction: "OUT", amount: 96.41 }),
            mov({ date: "2026-08-11T00:00:00Z", direction: "IN", amount: 500 }),
        ];
        expect(runningBalances(2104.18, movs)).toEqual([2104.18, 2200.59]);
    });
});

describe("statementPeriodFor", () => {
    it("abre el período el día siguiente al corte anterior", () => {
        const p = statementPeriodFor(20, 28, new Date("2026-08-12T00:00:00Z"));
        expect(p.periodStart).toBe("2026-07-21");
        expect(p.periodEnd).toBe("2026-08-20");
        expect(p.dueDate).toBe("2026-08-28");
    });

    it("después del corte el período en curso es el siguiente", () => {
        const p = statementPeriodFor(20, 28, new Date("2026-08-25T00:00:00Z"));
        expect(p.periodStart).toBe("2026-08-21");
        expect(p.periodEnd).toBe("2026-09-20");
        expect(p.dueDate).toBe("2026-09-28");
    });

    it("recorta el día de corte a meses cortos", () => {
        const p = statementPeriodFor(31, 5, new Date("2026-02-15T00:00:00Z"));
        expect(p.periodEnd).toBe("2026-02-28");
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/domain/bank-balance.test.ts`
Expected: FAIL — `Cannot find module '@/domain/services/bank-balance'`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/domain/services/bank-balance.ts`:

```ts
import {
    BankMovement, BankAccountBalanceSnapshot, BankCardStatement,
} from "../entities/bank";

/** Redondeo a centavos, para que las sumas de floats no arrastren ruido. */
function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Saldo actual de una cuenta: el último corte declarado más lo que se movió
 * después. Sin corte, la suma de todos los movimientos.
 *
 * Las líneas de tarjeta (CHARGE, PAYMENT) no tocan el saldo de una cuenta:
 * un consumo con crédito no saca dinero de ningún lado hasta que se paga la
 * tarjeta, y ese pago ya viene como su propia línea OUT sobre la cuenta.
 */
export function computeAccountBalance(
    snapshot: BankAccountBalanceSnapshot | null,
    movements: readonly BankMovement[],
): number {
    const since = snapshot ? Date.parse(snapshot.asOf) : null;
    let balance = snapshot ? Number(snapshot.balance) : 0;

    for (const m of movements) {
        if (since !== null && Date.parse(m.date) <= since) continue;
        if (m.direction === "IN") balance += Number(m.amount);
        else if (m.direction === "OUT") balance -= Number(m.amount);
    }

    return round2(balance);
}

/** Deuda histórica de una tarjeta: consumos menos pagos. */
export function computeCardDebt(movements: readonly BankMovement[]): number {
    let debt = 0;
    for (const m of movements) {
        if (m.direction === "CHARGE") debt += Number(m.amount);
        else if (m.direction === "PAYMENT") debt -= Number(m.amount);
    }
    return round2(debt);
}

/** Cupo libre. Null cuando la tarjeta no declara límite. */
export function computeAvailableCredit(
    creditLimit: number | null | undefined,
    debt: number,
): number | null {
    if (creditLimit === null || creditLimit === undefined) return null;
    return round2(Number(creditLimit) - debt);
}

/**
 * Lo que falta pagar de un estado de cuenta. El total declarado por el banco
 * manda sobre el que calculó la app: el banco es la autoridad y el escaneo
 * puede haberse perdido consumos.
 */
export function computeStatementDue(statement: BankCardStatement): number {
    const total = statement.totalAmount ?? statement.computedAmount;
    return round2(Number(total) - Number(statement.paidAmount));
}

/**
 * Saldo después de cada movimiento, calculado hacia atrás desde el saldo
 * actual. `movements` debe venir del más reciente al más antiguo, que es el
 * orden en que se listan. El resultado es paralelo: `result[i]` es el saldo
 * que quedó tras `movements[i]`.
 */
export function runningBalances(
    currentBalance: number,
    movements: readonly BankMovement[],
): number[] {
    const result: number[] = [];
    let balance = currentBalance;

    for (const m of movements) {
        result.push(round2(balance));
        if (m.direction === "IN") balance -= Number(m.amount);
        else if (m.direction === "OUT") balance += Number(m.amount);
    }

    return result;
}

function toISODate(year: number, monthIndex: number, day: number): string {
    // Día 0 del mes siguiente = último día de este mes; recorta el 31 en meses cortos.
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
    return d.toISOString().slice(0, 10);
}

export interface StatementPeriod {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
}

/**
 * El período de facturación vigente en `reference`. El período cierra el
 * `statementDay` y vence el `dueDay` del mes siguiente al cierre cuando el
 * día de pago cae antes que el de corte.
 */
export function statementPeriodFor(
    statementDay: number,
    dueDay: number,
    reference: Date,
): StatementPeriod {
    const year = reference.getUTCFullYear();
    const month = reference.getUTCMonth();
    const day = reference.getUTCDate();

    // Si ya pasó el corte de este mes, el período en curso cierra el mes que viene.
    const closeMonth = day > statementDay ? month + 1 : month;

    const periodEnd = toISODate(year, closeMonth, statementDay);
    const startBase = new Date(Date.UTC(year, closeMonth - 1, 1));
    const periodStartRaw = toISODate(
        startBase.getUTCFullYear(), startBase.getUTCMonth(), statementDay,
    );
    // El período abre el día siguiente al corte anterior.
    const start = new Date(`${periodStartRaw}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + 1);
    const periodStart = start.toISOString().slice(0, 10);

    const dueMonth = dueDay > statementDay ? closeMonth : closeMonth + 1;
    const dueDate = toISODate(year, dueMonth, dueDay);

    return { periodStart, periodEnd, dueDate };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/domain/bank-balance.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/domain/services/bank-balance.ts __tests__/domain/bank-balance.test.ts
git commit -m "feat(bancos): agrega calculos de saldo, deuda y ciclo de facturacion"
```

---

## Task 8: Formato de presentación de números

**Files:**
- Create: `src/lib/format-bank-number.ts`
- Test: `__tests__/lib/format-bank-number.test.ts`

**Interfaces:**
- Produce: `formatBankNumber(entity: BankNumberParts, kind: 'ACCOUNT' | 'CARD'): string`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/lib/format-bank-number.test.ts`:

```ts
import { formatBankNumber } from "@/lib/format-bank-number";

describe("formatBankNumber", () => {
    it("las tarjetas usan cuatro equis", () => {
        expect(formatBankNumber({ lastFour: "2780" }, "CARD")).toBe("XXXX2780");
    });

    it("las cuentas usan cuatro puntos", () => {
        expect(formatBankNumber({ lastFour: "0814" }, "ACCOUNT")).toBe("••••0814");
    });

    it("una cuenta con solo prefijo y sufijo muestra ambos", () => {
        expect(formatBankNumber({ prefixDigits: "22", lastFour: "58" }, "ACCOUNT"))
            .toBe("22••••58");
    });

    it("una tarjeta con solo prefijo y sufijo mantiene las equis", () => {
        expect(formatBankNumber({ prefixDigits: "54", lastFour: "361" }, "CARD"))
            .toBe("54XXXX361");
    });

    it("sin ningún dígito devuelve cadena vacía", () => {
        expect(formatBankNumber({}, "ACCOUNT")).toBe("");
    });

    it("solo prefijo, sin sufijo", () => {
        expect(formatBankNumber({ prefixDigits: "10" }, "ACCOUNT")).toBe("10••••");
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/lib/format-bank-number.test.ts`
Expected: FAIL — `Cannot find module '@/lib/format-bank-number'`.

- [ ] **Step 3: Escribir la implementación**

Crear `src/lib/format-bank-number.ts`:

```ts
export interface BankNumberParts {
    lastFour?: string | null;
    prefixDigits?: string | null;
}

/**
 * Cómo se muestra un número de cuenta o tarjeta.
 *
 * Las tarjetas llevan cuatro equis, las cuentas cuatro puntos. Mismo largo en
 * ambos casos: lo que distingue una de otra a simple vista es el glifo, no el
 * conteo. Decide por el tipo de entidad y nunca por el largo del número — una
 * tarjeta sin BIN conocido sigue siendo una tarjeta.
 */
export function formatBankNumber(
    parts: BankNumberParts,
    kind: 'ACCOUNT' | 'CARD',
): string {
    const mask = kind === 'CARD' ? 'XXXX' : '••••';
    const prefix = parts.prefixDigits ?? '';
    const suffix = parts.lastFour ?? '';

    if (!prefix && !suffix) return '';

    return `${prefix}${mask}${suffix}`;
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/lib/format-bank-number.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/lib/format-bank-number.ts __tests__/lib/format-bank-number.test.ts
git commit -m "feat(bancos): agrega formato de presentacion de numeros"
```

---

## Task 9: Repositorios Supabase — instituciones, cuentas y tarjetas

**Files:**
- Create: `src/infrastructure/repositories/supabase/bank-institution-repository.ts`
- Create: `src/infrastructure/repositories/supabase/bank-account-repository.ts`
- Create: `src/infrastructure/repositories/supabase/bank-card-repository.ts`
- Modify: `src/infrastructure/repositories/supabase/index.ts` (re-exportar)

**Interfaces:**
- Consumes: `IBankInstitutionRepository`, `IBankAccountRepository`, `IBankCardRepository`
- Produce: `SupabaseBankInstitutionRepository`, `SupabaseBankAccountRepository`, `SupabaseBankCardRepository`

Antes de escribir, leer un repo Supabase existente para copiar exactamente el patrón de cliente, mapeo snake_case ↔ camelCase y manejo de errores:

```bash
cat src/infrastructure/repositories/supabase/*financial-institution* 2>/dev/null || ls src/infrastructure/repositories/supabase/
```

- [ ] **Step 1: Escribir el repositorio de instituciones**

Crear `src/infrastructure/repositories/supabase/bank-institution-repository.ts`. Mapeo de columnas: `financial_institution_id ↔ financialInstitutionId`, `is_unconfirmed ↔ isUnconfirmed`, `short_name ↔ shortName`, `logo_url ↔ logoUrl`, `is_deleted ↔ isDeleted`, `created_at ↔ createdAt`, `updated_at ↔ updatedAt`.

```ts
import { createClient } from "@/infrastructure/supabase/server";
import { UUID } from "@/domain/core";
import { BankInstitution } from "@/domain/entities/bank";
import { IBankInstitutionRepository } from "@/domain/repositories/bank";

type Row = Record<string, unknown>;

function toEntity(row: Row): BankInstitution {
    return {
        id: row.id as string,
        ownerUserId: row.owner_user_id as string,
        name: row.name as string,
        shortName: (row.short_name as string) ?? null,
        kind: row.kind as BankInstitution["kind"],
        logoUrl: (row.logo_url as string) ?? null,
        color: (row.color as string) ?? null,
        country: (row.country as string) ?? null,
        financialInstitutionId: (row.financial_institution_id as string) ?? null,
        isUnconfirmed: Boolean(row.is_unconfirmed),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted),
    };
}

function toRow(entity: Partial<BankInstitution>): Row {
    const row: Row = {};
    if (entity.ownerUserId !== undefined) row.owner_user_id = entity.ownerUserId;
    if (entity.name !== undefined) row.name = entity.name;
    if (entity.shortName !== undefined) row.short_name = entity.shortName;
    if (entity.kind !== undefined) row.kind = entity.kind;
    if (entity.logoUrl !== undefined) row.logo_url = entity.logoUrl;
    if (entity.color !== undefined) row.color = entity.color;
    if (entity.country !== undefined) row.country = entity.country;
    if (entity.financialInstitutionId !== undefined) row.financial_institution_id = entity.financialInstitutionId;
    if (entity.isUnconfirmed !== undefined) row.is_unconfirmed = entity.isUnconfirmed;
    if (entity.isDeleted !== undefined) row.is_deleted = entity.isDeleted;
    return row;
}

export class SupabaseBankInstitutionRepository implements IBankInstitutionRepository {
    async findAll(): Promise<BankInstitution[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*")
            .eq("is_deleted", false).order("name");
        if (error) throw new Error(error.message);
        return (data ?? []).map(toEntity);
    }

    async findById(id: UUID): Promise<BankInstitution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? toEntity(data) : null;
    }

    async findByOwnerId(userId: UUID): Promise<BankInstitution[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false).order("name");
        if (error) throw new Error(error.message);
        return (data ?? []).map(toEntity);
    }

    async findByName(userId: UUID, name: string): Promise<BankInstitution | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .ilike("name", name).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? toEntity(data) : null;
    }

    async create(entity: Partial<BankInstitution>): Promise<BankInstitution> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions").insert(toRow(entity)).select().single();
        if (error) throw new Error(error.message);
        return toEntity(data);
    }

    async update(id: UUID, entity: Partial<BankInstitution>): Promise<BankInstitution> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_institutions")
            .update({ ...toRow(entity), updated_at: new Date().toISOString() })
            .eq("id", id).select().single();
        if (error) throw new Error(error.message);
        return toEntity(data);
    }

    async delete(id: UUID): Promise<void> {
        const supabase = await createClient();
        const { error } = await supabase
            .from("bank_institutions")
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw new Error(error.message);
    }
}
```

- [ ] **Step 2: Escribir el repositorio de cuentas**

Copiar el archivo del Step 1 a `src/infrastructure/repositories/supabase/bank-account-repository.ts` y cambiar exactamente cuatro cosas: el nombre de la clase a `SupabaseBankAccountRepository`, el tipo a `BankAccount`, todas las apariciones de `"bank_institutions"` por `"bank_accounts"`, y el cuerpo de `toEntity`/`toRow` por el mapeo de columnas `institution_id ↔ institutionId`, `account_type ↔ accountType`, `last_four ↔ lastFour`, `prefix_digits ↔ prefixDigits`, `currency`, `status`, `is_unconfirmed ↔ isUnconfirmed`. `findByName` se reemplaza por estos dos métodos:

```ts
    async findByInstitutionId(userId: UUID, institutionId: UUID): Promise<BankAccount[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts").select("*")
            .eq("owner_user_id", userId).eq("institution_id", institutionId)
            .eq("is_deleted", false).order("name");
        if (error) throw new Error(error.message);
        return (data ?? []).map(toEntity);
    }

    async findCashAccount(userId: UUID): Promise<BankAccount | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_accounts").select("*")
            .eq("owner_user_id", userId).eq("account_type", "CASH")
            .eq("is_deleted", false).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? toEntity(data) : null;
    }
```

- [ ] **Step 3: Escribir el repositorio de tarjetas**

Copiar el del Step 2 a `src/infrastructure/repositories/supabase/bank-card-repository.ts`, clase `SupabaseBankCardRepository`, tipo `BankCard`, tabla `"bank_cards"`. Al mapeo de cuentas se le suman `account_id ↔ accountId`, `card_type ↔ cardType`, `brand`, `bin`, `credit_limit ↔ creditLimit`, `statement_day ↔ statementDay`, `due_day ↔ dueDay`. Los numéricos vuelven de Supabase como string, así que el mapeo los convierte:

```ts
        creditLimit: row.credit_limit === null ? null : Number(row.credit_limit),
        statementDay: row.statement_day === null ? null : Number(row.statement_day),
        dueDay: row.due_day === null ? null : Number(row.due_day),
```

Más `findByAccountId(userId, accountId)`, análogo a `findByInstitutionId`.

- [ ] **Step 4: Re-exportar**

Añadir los tres a `src/infrastructure/repositories/supabase/index.ts` siguiendo el estilo existente del archivo.

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/infrastructure/repositories/supabase/bank-*.ts src/infrastructure/repositories/supabase/index.ts
git commit -m "feat(bancos): agrega repositorios Supabase de instituciones, cuentas y tarjetas"
```

---

## Task 10: Repositorios Supabase — cortes, estados y movimientos

**Files:**
- Create: `src/infrastructure/repositories/supabase/bank-snapshot-repository.ts`
- Create: `src/infrastructure/repositories/supabase/bank-statement-repository.ts`
- Create: `src/infrastructure/repositories/supabase/bank-movement-repository.ts`
- Modify: `src/infrastructure/repositories/supabase/index.ts`

**Interfaces:**
- Produce: `SupabaseBankAccountBalanceSnapshotRepository`, `SupabaseBankCardStatementRepository`, `SupabaseBankMovementRepository`

- [ ] **Step 1: Escribir el repositorio de cortes**

Crear `src/infrastructure/repositories/supabase/bank-snapshot-repository.ts` con la forma de la Task 9 más:

```ts
    async findLatestForAccount(accountId: UUID, reference: ISODate): Promise<BankAccountBalanceSnapshot | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_account_balance_snapshots").select("*")
            .eq("account_id", accountId).eq("is_deleted", false)
            .lte("as_of", reference)
            .order("as_of", { ascending: false })
            .limit(1).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? toEntity(data) : null;
    }
```

El mapeo convierte `balance` con `Number(row.balance)`.

- [ ] **Step 2: Escribir el repositorio de estados de cuenta**

Crear `src/infrastructure/repositories/supabase/bank-statement-repository.ts`:

```ts
    async findOpenForCard(cardId: UUID): Promise<BankCardStatement | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements").select("*")
            .eq("card_id", cardId).eq("is_deleted", false).eq("status", "OPEN")
            .order("period_start", { ascending: false })
            .limit(1).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? toEntity(data) : null;
    }

    async findByCardAndPeriodStart(cardId: UUID, periodStart: ISODate): Promise<BankCardStatement | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_card_statements").select("*")
            .eq("card_id", cardId).eq("period_start", periodStart)
            .eq("is_deleted", false).maybeSingle();
        if (error) throw new Error(error.message);
        return data ? toEntity(data) : null;
    }
```

`computedAmount`, `totalAmount` y `paidAmount` se convierten con `Number()`; `totalAmount` conserva el null.

- [ ] **Step 3: Escribir el repositorio de movimientos**

Crear `src/infrastructure/repositories/supabase/bank-movement-repository.ts`. Es solo lectura sobre la vista:

```ts
import { createClient } from "@/infrastructure/supabase/server";
import { UUID } from "@/domain/core";
import { BankMovement } from "@/domain/entities/bank";
import { IBankMovementRepository, BankMovementFilter } from "@/domain/repositories/bank";

function toEntity(row: Record<string, unknown>): BankMovement {
    return {
        transactionId: row.transaction_id as string,
        ownerUserId: row.owner_user_id as string,
        date: row.date as string,
        accountId: (row.account_id as string) ?? null,
        cardId: (row.card_id as string) ?? null,
        direction: row.direction as BankMovement["direction"],
        amount: Number(row.amount),
        currency: row.currency as string,
        description: (row.description as string) ?? null,
        merchant: (row.merchant as string) ?? null,
        categoryId: (row.category_id as string) ?? null,
    };
}

export class SupabaseBankMovementRepository implements IBankMovementRepository {
    async find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]> {
        const supabase = await createClient();
        let query = supabase.from("bank_movements").select("*").eq("owner_user_id", userId);

        if (filter.accountId) query = query.eq("account_id", filter.accountId);
        if (filter.cardId) query = query.eq("card_id", filter.cardId);
        if (filter.since) query = query.gt("date", filter.since);
        if (filter.until) query = query.lte("date", filter.until);

        query = query.order("date", { ascending: false });
        if (filter.limit) query = query.limit(filter.limit);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return (data ?? []).map(toEntity);
    }

    async findAllForOwner(userId: UUID): Promise<BankMovement[]> {
        return this.find(userId, {});
    }
}
```

- [ ] **Step 4: Re-exportar y verificar que compila**

Añadir los tres a `src/infrastructure/repositories/supabase/index.ts`.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/infrastructure/repositories/supabase/bank-*.ts src/infrastructure/repositories/supabase/index.ts
git commit -m "feat(bancos): agrega repositorios de cortes, estados y movimientos"
```

---

## Task 11: Repositorios in-memory y cableado del container

**Files:**
- Modify: `src/infrastructure/repositories/implementations.ts`
- Modify: `src/infrastructure/container.ts`

**Interfaces:**
- Produce: `InMemoryBankInstitutionRepository`, `InMemoryBankAccountRepository`, `InMemoryBankCardRepository`, `InMemoryBankAccountBalanceSnapshotRepository`, `InMemoryBankCardStatementRepository`, `InMemoryBankMovementRepository`; y los singletons `bankInstitutionRepository`, `bankAccountRepository`, `bankCardRepository`, `bankSnapshotRepository`, `bankStatementRepository`, `bankMovementRepository` exportados por el container

`DATA_SOURCE` puede ser `MEMORY` o `MOCK`, así que las seis implementaciones in-memory son obligatorias, no opcionales.

- [ ] **Step 1: Escribir los repos in-memory**

Añadir a `src/infrastructure/repositories/implementations.ts`, siguiendo el estilo de los que ya están (array privado, filtrado por `isDeleted`, `randomUUID()` al crear).

`InMemoryBankMovementRepository` es distinto: no guarda nada propio, sino que deriva de las transacciones en memoria aplicando las seis reglas de la vista. Recibe el repo de transacciones y el de tarjetas por constructor:

```ts
export class InMemoryBankMovementRepository implements IBankMovementRepository {
    constructor(
        private readonly transactions: IFinancialTransactionRepository,
        private readonly cards: IBankCardRepository,
        private readonly statements: IBankCardStatementRepository,
    ) {}

    async findAllForOwner(userId: UUID): Promise<BankMovement[]> {
        const txs = await this.transactions.findByOwnerId(userId);
        const allCards = await this.cards.findByOwnerId(userId);
        const creditCardIds = new Set(
            allCards.filter(c => c.cardType === "CREDIT").map(c => c.id),
        );
        const out: BankMovement[] = [];

        for (const t of txs) {
            if (["REJECTED", "DELETED", "DUPLICATE"].includes(t.status)) continue;
            const base = {
                transactionId: t.id, ownerUserId: t.ownerUserId, date: t.date,
                amount: Number(t.amount), currency: t.currency,
                description: t.description, merchant: t.merchant ?? null,
                categoryId: t.categoryId ?? null,
            };
            if (t.bankSourceAccountId) {
                out.push({ ...base, accountId: t.bankSourceAccountId, cardId: null, direction: "OUT" });
            }
            if (t.bankDestinationAccountId) {
                out.push({ ...base, accountId: t.bankDestinationAccountId, cardId: null, direction: "IN" });
            }
            if (t.bankCardId && creditCardIds.has(t.bankCardId) && t.paidWithCredit) {
                out.push({ ...base, accountId: null, cardId: t.bankCardId, direction: "CHARGE" });
            }
            if (t.bankCardStatementId) {
                const statement = await this.statements.findById(t.bankCardStatementId);
                if (statement) {
                    out.push({ ...base, accountId: null, cardId: statement.cardId, direction: "PAYMENT" });
                }
            }
        }

        return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }

    async find(userId: UUID, filter: BankMovementFilter): Promise<BankMovement[]> {
        let movs = await this.findAllForOwner(userId);
        if (filter.accountId) movs = movs.filter(m => m.accountId === filter.accountId);
        if (filter.cardId) movs = movs.filter(m => m.cardId === filter.cardId);
        if (filter.since) movs = movs.filter(m => Date.parse(m.date) > Date.parse(filter.since!));
        if (filter.until) movs = movs.filter(m => Date.parse(m.date) <= Date.parse(filter.until!));
        return filter.limit ? movs.slice(0, filter.limit) : movs;
    }
}
```

Los tres parámetros del constructor son obligatorios: `statements` sirve la cuarta regla, la que resuelve de qué tarjeta es el pago.

- [ ] **Step 2: Extender la entidad de transacción**

Añadir a `FinancialTransaction` en `src/domain/entities/financial.ts` las seis propiedades nuevas, y actualizar el mapeo del repositorio Supabase de transacciones para leerlas y escribirlas:

```ts
    bankSourceAccountId?: UUID | null;
    bankDestinationAccountId?: UUID | null;
    bankCardId?: UUID | null;
    bankInstitutionId?: UUID | null;
    bankCardStatementId?: UUID | null;
    bankCounterpartyObservationId?: UUID | null;
```

- [ ] **Step 3: Cablear el container**

En `src/infrastructure/container.ts`, seguir exactamente el patrón existente: singletons in-memory colgados de `global` para sobrevivir el hot reload, repos Supabase creados frescos en cada evaluación del módulo.

- [ ] **Step 4: Verificar que compila y los tests siguen pasando**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores, todos los tests existentes en verde.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/infrastructure/repositories/implementations.ts src/infrastructure/container.ts src/domain/entities/financial.ts src/infrastructure/repositories/supabase/
git commit -m "feat(bancos): cablea repositorios in-memory y Supabase en el container"
```

---

## Task 12: Servicio de aplicación

**Files:**
- Create: `src/application/services/bank-service.ts`
- Modify: `src/infrastructure/container.ts` (exportar `bankService`)
- Test: `__tests__/services/bank-service.test.ts`

**Interfaces:**
- Consumes: los seis repositorios de la Task 11, `IFinancialTransactionRepository`, y las funciones de `bank-balance.ts`
- Produce: clase `BankService` con `getOverview`, `getAccountDetail`, `getCardDetail`, `ensureCashAccount`, `registerBalanceSnapshot`, `closeDueStatements`, `payStatement`, `setStatementTotal`, y el CRUD de instituciones, cuentas y tarjetas

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/services/bank-service.test.ts`. Usa los repos in-memory directamente, sin mocks de Supabase:

```ts
import { BankService } from "@/application/services/bank-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryFinancialTransactionRepository,
} from "@/infrastructure/repositories/implementations";

const USER = "11111111-1111-1111-1111-111111111111";

function buildService() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions,
    );
    return { service, institutions, accounts, cards, snapshots, statements, transactions };
}

describe("ensureCashAccount", () => {
    it("crea la cuenta de efectivo la primera vez", async () => {
        const { service, accounts } = buildService();
        const cash = await service.ensureCashAccount(USER);
        expect(cash.accountType).toBe("CASH");
        expect(cash.institutionId).toBeNull();
        expect((await accounts.findByOwnerId(USER))).toHaveLength(1);
    });

    it("es idempotente", async () => {
        const { service, accounts } = buildService();
        const a = await service.ensureCashAccount(USER);
        const b = await service.ensureCashAccount(USER);
        expect(a.id).toBe(b.id);
        expect((await accounts.findByOwnerId(USER))).toHaveLength(1);
    });
});

describe("getOverview", () => {
    it("excluye del total las cuentas sin confirmar", async () => {
        const { service, institutions, accounts, snapshots } = buildService();
        const inst = await institutions.create({ ownerUserId: USER, name: "Banco del Austro", kind: "BANK" });
        const ok = await accounts.create({
            ownerUserId: USER, institutionId: inst.id, name: "Ahorros",
            accountType: "SAVINGS", currency: "USD", status: "ACTIVE", isUnconfirmed: false,
        });
        await accounts.create({
            ownerUserId: USER, institutionId: inst.id, name: "Sin confirmar",
            accountType: "SAVINGS", currency: "USD", status: "ACTIVE", isUnconfirmed: true,
        });
        await snapshots.create({
            ownerUserId: USER, accountId: ok.id, balance: 1000,
            asOf: "2026-08-01T00:00:00Z", source: "MANUAL",
        });

        const overview = await service.getOverview(USER);
        expect(overview.totalAvailable).toBe(1000);
    });
});

describe("closeDueStatements", () => {
    it("cierra el período vencido y abre el siguiente", async () => {
        const { service, institutions, cards, statements } = buildService();
        const inst = await institutions.create({ ownerUserId: USER, name: "Banco del Austro", kind: "BANK" });
        const card = await cards.create({
            ownerUserId: USER, institutionId: inst.id, name: "Pacificard",
            cardType: "CREDIT", currency: "USD", creditLimit: 3000,
            statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
        });
        await statements.create({
            ownerUserId: USER, cardId: card.id,
            periodStart: "2026-06-21", periodEnd: "2026-07-20", dueDate: "2026-07-28",
            computedAmount: 298.2, paidAmount: 0, status: "OPEN",
        });

        await service.closeDueStatements(USER, new Date("2026-08-25T00:00:00Z"));

        const all = await statements.findByCardId(card.id);
        const closed = all.find(s => s.periodStart === "2026-06-21");
        expect(closed?.status).toBe("CLOSED");
        expect(all.some(s => s.status === "OPEN")).toBe(true);
    });

    it("es idempotente: correrlo dos veces no duplica estados", async () => {
        const { service, institutions, cards, statements } = buildService();
        const inst = await institutions.create({ ownerUserId: USER, name: "B", kind: "BANK" });
        const card = await cards.create({
            ownerUserId: USER, institutionId: inst.id, name: "TC",
            cardType: "CREDIT", currency: "USD", statementDay: 20, dueDay: 28,
            status: "ACTIVE", isUnconfirmed: false,
        });

        const when = new Date("2026-08-25T00:00:00Z");
        await service.closeDueStatements(USER, when);
        await service.closeDueStatements(USER, when);

        expect(await statements.findByCardId(card.id)).toHaveLength(1);
    });
});

describe("payStatement", () => {
    it("crea una transacción de gasto real que sale de la cuenta y baja la deuda", async () => {
        const { service, institutions, accounts, cards, statements, transactions } = buildService();
        const inst = await institutions.create({ ownerUserId: USER, name: "Banco del Austro", kind: "BANK" });
        const cuenta = await accounts.create({
            ownerUserId: USER, institutionId: inst.id, name: "Ahorros",
            accountType: "SAVINGS", currency: "USD", status: "ACTIVE", isUnconfirmed: false,
        });
        const card = await cards.create({
            ownerUserId: USER, institutionId: inst.id, name: "Pacificard",
            cardType: "CREDIT", currency: "USD", creditLimit: 3000,
            statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
        });
        const st = await statements.create({
            ownerUserId: USER, cardId: card.id,
            periodStart: "2026-07-21", periodEnd: "2026-08-20", dueDate: "2026-08-28",
            computedAmount: 611.4, paidAmount: 0, status: "OPEN",
        });

        const tx = await service.payStatement(USER, st.id, cuenta.id, 611.4, "2026-08-26T00:00:00Z");

        expect(tx.bankCardStatementId).toBe(st.id);
        expect(tx.bankSourceAccountId).toBe(cuenta.id);
        // Un pago de tarjeta NO es un consumo diferido: es dinero que sale hoy.
        expect(tx.paidWithCredit).toBe(false);

        const updated = await statements.findById(st.id);
        expect(updated!.paidAmount).toBe(611.4);
        expect(updated!.status).toBe("PAID");
    });

    it("un pago parcial deja el estado abierto", async () => {
        const { service, institutions, accounts, cards, statements } = buildService();
        const inst = await institutions.create({ ownerUserId: USER, name: "B", kind: "BANK" });
        const cuenta = await accounts.create({
            ownerUserId: USER, institutionId: inst.id, name: "Ahorros",
            accountType: "SAVINGS", currency: "USD", status: "ACTIVE", isUnconfirmed: false,
        });
        const card = await cards.create({
            ownerUserId: USER, institutionId: inst.id, name: "TC",
            cardType: "CREDIT", currency: "USD", statementDay: 20, dueDay: 28,
            status: "ACTIVE", isUnconfirmed: false,
        });
        const st = await statements.create({
            ownerUserId: USER, cardId: card.id,
            periodStart: "2026-07-21", periodEnd: "2026-08-20", dueDate: "2026-08-28",
            computedAmount: 611.4, paidAmount: 0, status: "OPEN",
        });

        await service.payStatement(USER, st.id, cuenta.id, 200, "2026-08-26T00:00:00Z");

        const updated = await statements.findById(st.id);
        expect(updated!.paidAmount).toBe(200);
        expect(updated!.status).toBe("OPEN");
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-service.test.ts`
Expected: FAIL — `Cannot find module '@/application/services/bank-service'`.

- [ ] **Step 3: Escribir el servicio**

Crear `src/application/services/bank-service.ts`:

```ts
import { UUID } from "@/domain/core";
import {
    BankInstitution, BankAccount, BankCard,
    BankAccountBalanceSnapshot, BankCardStatement, BankMovement,
} from "@/domain/entities/bank";
import { FinancialTransaction } from "@/domain/entities/financial";
import {
    IBankInstitutionRepository, IBankAccountRepository, IBankCardRepository,
    IBankAccountBalanceSnapshotRepository, IBankCardStatementRepository,
    IBankMovementRepository,
} from "@/domain/repositories/bank";
import { IFinancialTransactionRepository } from "@/domain/repositories/financial";
import {
    computeAccountBalance, computeCardDebt, computeAvailableCredit,
    computeStatementDue, runningBalances, statementPeriodFor,
} from "@/domain/services/bank-balance";

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
    /** Paralelo a `movements`: saldo tras cada uno. */
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

export class BankService {
    constructor(
        private readonly institutions: IBankInstitutionRepository,
        private readonly accounts: IBankAccountRepository,
        private readonly cards: IBankCardRepository,
        private readonly snapshots: IBankAccountBalanceSnapshotRepository,
        private readonly statements: IBankCardStatementRepository,
        private readonly movements: IBankMovementRepository,
        private readonly transactions: IFinancialTransactionRepository,
    ) {}

    // ─── Efectivo ────────────────────────────────────────────

    /**
     * La cuenta de efectivo del usuario, creándola si aún no existe. Es donde
     * aterriza el dinero de un retiro: baja del banco, sube aquí, el
     * patrimonio no cambia.
     */
    async ensureCashAccount(userId: UUID): Promise<BankAccount> {
        const existing = await this.accounts.findCashAccount(userId);
        if (existing) return existing;

        return this.accounts.create({
            ownerUserId: userId,
            institutionId: null,
            name: "Efectivo",
            accountType: "CASH",
            currency: "USD",
            status: "ACTIVE",
            isUnconfirmed: false,
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

        const accounts = await Promise.all(
            rawAccounts.map(a => this.withBalance(a, allMovements)),
        );
        const cards = await Promise.all(
            rawCards.map(c => this.withDebt(c, allMovements)),
        );

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

        const [snapshots, movements] = await Promise.all([
            this.snapshots.findByAccountId(accountId),
            this.movements.find(userId, { accountId }),
        ]);

        const withBalance = await this.withBalance(account, movements);

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

        const [statements, movements, allAccounts, allMovements] = await Promise.all([
            this.statements.findByCardId(cardId),
            this.movements.find(userId, { cardId }),
            this.accounts.findByOwnerId(userId),
            this.movements.findAllForOwner(userId),
        ]);

        const withDebt = await this.withDebt(card, movements);
        const open = withDebt.openStatement;
        const periodMovements = open
            ? movements.filter(m =>
                m.date >= `${open.periodStart}T00:00:00Z` &&
                m.date <= `${open.periodEnd}T23:59:59Z`)
            : [];

        const payableAccounts = await Promise.all(
            allAccounts
                .filter(a => !a.isUnconfirmed && a.status === "ACTIVE")
                .map(a => this.withBalance(a, allMovements)),
        );

        return { card: withDebt, statements, movements, periodMovements, payableAccounts };
    }

    // ─── Cortes de saldo ─────────────────────────────────────

    async registerBalanceSnapshot(
        userId: UUID, accountId: UUID, balance: number, asOf: string, note?: string,
    ): Promise<BankAccountBalanceSnapshot> {
        return this.snapshots.create({
            ownerUserId: userId, accountId, balance, asOf, source: "MANUAL", note,
        });
    }

    // ─── Ciclo de facturación ────────────────────────────────

    /**
     * Cierre perezoso: al leer, cualquier estado cuyo período ya venció pasa a
     * CLOSED y se abre el período en curso. La app no tiene proceso
     * programado, así que la lectura es el disparador. Idempotente a
     * propósito — corre en cada `getOverview` y `getCardDetail`.
     */
    async closeDueStatements(userId: UUID, reference: Date): Promise<void> {
        const cards = (await this.cards.findByOwnerId(userId))
            .filter(c => c.cardType === "CREDIT" && c.statementDay && c.dueDay);

        for (const card of cards) {
            const period = statementPeriodFor(card.statementDay!, card.dueDay!, reference);

            const open = await this.statements.findOpenForCard(card.id);
            if (open && open.periodStart < period.periodStart) {
                await this.statements.update(open.id, { status: "CLOSED" });
            }

            const current = await this.statements.findByCardAndPeriodStart(
                card.id, period.periodStart,
            );
            if (!current) {
                const movements = await this.movements.find(userId, { cardId: card.id });
                const computed = movements
                    .filter(m => m.direction === "CHARGE" &&
                        m.date >= `${period.periodStart}T00:00:00Z` &&
                        m.date <= `${period.periodEnd}T23:59:59Z`)
                    .reduce((sum, m) => sum + m.amount, 0);

                await this.statements.create({
                    ownerUserId: userId, cardId: card.id,
                    periodStart: period.periodStart, periodEnd: period.periodEnd,
                    dueDate: period.dueDate,
                    computedAmount: round2(computed), paidAmount: 0, status: "OPEN",
                });
            }
        }
    }

    // ─── CRUD ────────────────────────────────────────────────

    async createInstitution(userId: UUID, data: Partial<BankInstitution>): Promise<BankInstitution> {
        return this.institutions.create({ ...data, ownerUserId: userId, isUnconfirmed: false });
    }

    async updateInstitution(id: UUID, data: Partial<BankInstitution>): Promise<BankInstitution> {
        return this.institutions.update(id, data);
    }

    async deleteInstitution(id: UUID): Promise<void> {
        return this.institutions.delete(id);
    }

    async createAccount(userId: UUID, data: Partial<BankAccount>): Promise<BankAccount> {
        return this.accounts.create({ ...data, ownerUserId: userId, isUnconfirmed: false });
    }

    async updateAccount(id: UUID, data: Partial<BankAccount>): Promise<BankAccount> {
        return this.accounts.update(id, data);
    }

    async deleteAccount(id: UUID): Promise<void> {
        return this.accounts.delete(id);
    }

    async createCard(userId: UUID, data: Partial<BankCard>): Promise<BankCard> {
        return this.cards.create({ ...data, ownerUserId: userId, isUnconfirmed: false });
    }

    async updateCard(id: UUID, data: Partial<BankCard>): Promise<BankCard> {
        return this.cards.update(id, data);
    }

    async deleteCard(id: UUID): Promise<void> {
        return this.cards.delete(id);
    }

    /** Corrige el total de un estado con lo que declara el banco. */
    async setStatementTotal(id: UUID, totalAmount: number): Promise<BankCardStatement> {
        return this.statements.update(id, { totalAmount });
    }

    /**
     * Paga un estado de cuenta. Crea una transacción de gasto **real** que sale
     * de la cuenta elegida y queda ligada al estado — es la única forma en que
     * la deuda de la tarjeta baja.
     *
     * `paidWithCredit` va en false a propósito: el pago no es un consumo
     * diferido, es dinero que sale hoy. Esto es lo que evita el doble conteo,
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

        const transaction = await this.transactions.create({
            ownerUserId: userId,
            type: "PAYMENT",
            status: "MANUAL",
            amount,
            currency: card.currency,
            description: `Pago ${card.name}`,
            merchant: card.institutionName ?? null,
            date,
            paidWithCredit: false,
            possibleDuplicate: false,
            bankSourceAccountId: sourceAccountId,
            bankCardStatementId: statementId,
            bankInstitutionId: card.institutionId,
        });

        const paidAmount = round2(Number(statement.paidAmount) + amount);
        const due = computeStatementDue(statement);
        await this.statements.update(statementId, {
            paidAmount,
            status: amount >= due ? "PAID" : statement.status,
        });

        return transaction;
    }

    // ─── Privados ────────────────────────────────────────────

    private async withBalance(
        account: BankAccount, movements: readonly BankMovement[],
    ): Promise<BankAccountWithBalance> {
        const own = movements.filter(m => m.accountId === account.id);
        const snapshot = await this.snapshots.findLatestForAccount(
            account.id, new Date().toISOString(),
        );
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

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}
```

Exportar `computeStatementDue` desde el módulo del servicio no hace falta: la UI lo importa directo del dominio.

- [ ] **Step 4: Cablear en el container**

Añadir a `src/infrastructure/container.ts`:

```ts
export const bankService = new BankService(
    bankInstitutionRepository, bankAccountRepository, bankCardRepository,
    bankSnapshotRepository, bankStatementRepository, bankMovementRepository,
    financialTransactionRepository,
);
```

`financialTransactionRepository` ya existe en el container; solo hay que pasarlo.

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-service.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/application/services/bank-service.ts src/infrastructure/container.ts __tests__/services/bank-service.test.ts
git commit -m "feat(bancos): agrega BankService con saldos, deuda y cierre perezoso de estados"
```

---

## Task 13: Esquemas Zod y server actions

**Files:**
- Create: `src/lib/validators/bank-schemas.ts`
- Create: `src/app/actions/bank.ts`
- Test: `__tests__/validators/bank-schemas.test.ts`

**Interfaces:**
- Consumes: `bankService` del container
- Produce: `createInstitutionSchema`, `createAccountSchema`, `createCardSchema`, `balanceSnapshotSchema`, `statementTotalSchema`; y las acciones `getBankOverviewAction`, `getBankAccountDetailAction`, `getBankCardDetailAction`, `createBankInstitutionAction`, `updateBankInstitutionAction`, `deleteBankInstitutionAction`, `createBankAccountAction`, `updateBankAccountAction`, `deleteBankAccountAction`, `createBankCardAction`, `updateBankCardAction`, `deleteBankCardAction`, `registerBalanceSnapshotAction`, `setStatementTotalAction`

- [ ] **Step 1: Escribir los tests de validación que fallan**

Crear `__tests__/validators/bank-schemas.test.ts`:

```ts
import { createCardSchema, createAccountSchema } from "@/lib/validators/bank-schemas";

describe("createCardSchema", () => {
    const base = {
        institutionId: "11111111-1111-1111-1111-111111111111",
        name: "Pacificard", currency: "USD",
    };

    it("acepta una tarjeta de crédito con ciclo y sin cuenta", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "CREDIT", creditLimit: 3000, statementDay: 20, dueDay: 28,
        });
        expect(result.success).toBe(true);
    });

    it("rechaza una tarjeta de crédito atada a una cuenta", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "CREDIT",
            accountId: "22222222-2222-2222-2222-222222222222",
        });
        expect(result.success).toBe(false);
    });

    it("rechaza una tarjeta de débito sin cuenta", () => {
        const result = createCardSchema.safeParse({ ...base, cardType: "DEBIT" });
        expect(result.success).toBe(false);
    });

    it("rechaza una tarjeta de débito con cupo", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "DEBIT",
            accountId: "22222222-2222-2222-2222-222222222222",
            creditLimit: 500,
        });
        expect(result.success).toBe(false);
    });

    it("rechaza un día de corte fuera de rango", () => {
        const result = createCardSchema.safeParse({
            ...base, cardType: "CREDIT", statementDay: 32, dueDay: 5,
        });
        expect(result.success).toBe(false);
    });
});

describe("createAccountSchema", () => {
    it("rechaza una cuenta corriente sin institución", () => {
        const result = createAccountSchema.safeParse({
            name: "Corriente", accountType: "CHECKING", currency: "USD",
        });
        expect(result.success).toBe(false);
    });

    it("acepta efectivo sin institución", () => {
        const result = createAccountSchema.safeParse({
            name: "Efectivo", accountType: "CASH", currency: "USD",
        });
        expect(result.success).toBe(true);
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/validators/bank-schemas.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir los esquemas**

Crear `src/lib/validators/bank-schemas.ts`:

```ts
import { z } from "zod";

const uuid = z.string().uuid();
const digits = z.string().regex(/^[0-9]{1,6}$/, "Solo dígitos");

export const createInstitutionSchema = z.object({
    name: z.string().min(1, "El nombre es requerido").max(120),
    shortName: z.string().max(40).optional().nullable(),
    kind: z.enum(["BANK", "COOPERATIVE", "WALLET", "OTHER"]).default("BANK"),
    logoUrl: z.string().url().optional().nullable(),
    color: z.string().optional().nullable(),
    country: z.string().length(2).optional().nullable(),
    financialInstitutionId: uuid.optional().nullable(),
});

export const createAccountSchema = z.object({
    institutionId: uuid.optional().nullable(),
    name: z.string().min(1, "El nombre es requerido").max(120),
    accountType: z.enum(["CHECKING", "SAVINGS", "CASH", "INVESTMENT"]),
    lastFour: digits.optional().nullable(),
    prefixDigits: digits.optional().nullable(),
    currency: z.string().length(3).default("USD"),
    status: z.enum(["ACTIVE", "CLOSED"]).default("ACTIVE"),
}).refine(
    // Espeja el CHECK de la base: el efectivo no tiene emisor, todo lo demás sí.
    d => (d.accountType === "CASH") === (d.institutionId == null),
    { message: "Solo la cuenta de efectivo va sin institución", path: ["institutionId"] },
);

export const createCardSchema = z.object({
    institutionId: uuid,
    accountId: uuid.optional().nullable(),
    name: z.string().min(1, "El nombre es requerido").max(120),
    cardType: z.enum(["DEBIT", "CREDIT"]),
    brand: z.string().max(40).optional().nullable(),
    bin: digits.optional().nullable(),
    lastFour: digits.optional().nullable(),
    prefixDigits: digits.optional().nullable(),
    currency: z.string().length(3).default("USD"),
    creditLimit: z.number().positive().optional().nullable(),
    statementDay: z.number().int().min(1).max(31).optional().nullable(),
    dueDay: z.number().int().min(1).max(31).optional().nullable(),
    status: z.enum(["ACTIVE", "BLOCKED", "EXPIRED", "CLOSED"]).default("ACTIVE"),
})
    .refine(d => d.cardType !== "DEBIT" || d.accountId != null, {
        message: "Una tarjeta de débito debe estar atada a una cuenta",
        path: ["accountId"],
    })
    .refine(d => d.cardType !== "CREDIT" || d.accountId == null, {
        message: "Una tarjeta de crédito no se ata a una cuenta",
        path: ["accountId"],
    })
    .refine(
        d => d.cardType !== "DEBIT" ||
            (d.creditLimit == null && d.statementDay == null && d.dueDay == null),
        { message: "Una tarjeta de débito no tiene cupo ni ciclo", path: ["creditLimit"] },
    );

export const balanceSnapshotSchema = z.object({
    accountId: uuid,
    balance: z.number(),
    asOf: z.string().datetime(),
    note: z.string().max(280).optional().nullable(),
});

export const statementTotalSchema = z.object({
    statementId: uuid,
    totalAmount: z.number().nonnegative(),
});

export const payStatementSchema = z.object({
    statementId: uuid,
    sourceAccountId: uuid,
    amount: z.number().positive("El monto debe ser mayor que cero"),
    date: z.string().datetime(),
});
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/validators/bank-schemas.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Escribir las server actions**

Crear `src/app/actions/bank.ts`. Mismo patrón que `src/app/actions/financial-settings.ts`:

```ts
"use server";

import { bankService } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import {
    createInstitutionSchema, createAccountSchema, createCardSchema,
    balanceSnapshotSchema, statementTotalSchema,
} from "@/lib/validators/bank-schemas";
import { z } from "zod";
import { revalidatePath } from "next/cache";

function formatZodError(error: z.ZodError): string {
    return error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
}

export async function getBankOverviewAction() {
    try {
        const userId = await requireUserId();
        const data = await bankService.getOverview(userId);
        return { success: true as const, data };
    } catch (error) {
        console.error("Error loading bank overview:", error);
        return { success: false as const, error: (error as Error).message };
    }
}

export async function getBankAccountDetailAction(accountId: string) {
    try {
        const userId = await requireUserId();
        const data = await bankService.getAccountDetail(userId, accountId);
        if (!data) return { success: false as const, error: "Cuenta no encontrada" };
        return { success: true as const, data };
    } catch (error) {
        console.error("Error loading account detail:", error);
        return { success: false as const, error: (error as Error).message };
    }
}

export async function getBankCardDetailAction(cardId: string) {
    try {
        const userId = await requireUserId();
        const data = await bankService.getCardDetail(userId, cardId);
        if (!data) return { success: false as const, error: "Tarjeta no encontrada" };
        return { success: true as const, data };
    } catch (error) {
        console.error("Error loading card detail:", error);
        return { success: false as const, error: (error as Error).message };
    }
}

export async function createBankAccountAction(input: unknown) {
    try {
        const validated = createAccountSchema.parse(input);
        const userId = await requireUserId();
        const data = await bankService.createAccount(userId, validated);
        revalidatePath("/financial/banks");
        return { success: true as const, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false as const, error: formatZodError(error) };
        }
        console.error("Error creating bank account:", error);
        return { success: false as const, error: (error as Error).message };
    }
}

export async function registerBalanceSnapshotAction(input: unknown) {
    try {
        const validated = balanceSnapshotSchema.parse(input);
        const userId = await requireUserId();
        const data = await bankService.registerBalanceSnapshot(
            userId, validated.accountId, validated.balance,
            validated.asOf, validated.note ?? undefined,
        );
        revalidatePath(`/financial/banks/accounts/${validated.accountId}`);
        revalidatePath("/financial/banks");
        return { success: true as const, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false as const, error: formatZodError(error) };
        }
        console.error("Error registering balance snapshot:", error);
        return { success: false as const, error: (error as Error).message };
    }
}

export async function setStatementTotalAction(input: unknown) {
    try {
        const validated = statementTotalSchema.parse(input);
        await requireUserId();
        const data = await bankService.setStatementTotal(
            validated.statementId, validated.totalAmount,
        );
        return { success: true as const, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false as const, error: formatZodError(error) };
        }
        console.error("Error setting statement total:", error);
        return { success: false as const, error: (error as Error).message };
    }
}
```

Y la del pago, que además revalida el dashboard porque crea una transacción real:

```ts
export async function payStatementAction(input: unknown) {
    try {
        const validated = payStatementSchema.parse(input);
        const userId = await requireUserId();
        const data = await bankService.payStatement(
            userId, validated.statementId, validated.sourceAccountId,
            validated.amount, validated.date,
        );
        revalidatePath("/financial/banks");
        revalidatePath("/financial");
        return { success: true as const, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false as const, error: formatZodError(error) };
        }
        console.error("Error paying statement:", error);
        return { success: false as const, error: (error as Error).message };
    }
}
```

Escribir con la misma forma las restantes: `createBankInstitutionAction`, `updateBankInstitutionAction`, `deleteBankInstitutionAction`, `updateBankAccountAction`, `deleteBankAccountAction`, `createBankCardAction`, `updateBankCardAction`, `deleteBankCardAction`. Las de update validan con `.partial()` sobre el esquema de creación; las de delete solo validan que el id sea uuid.

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/lib/validators/bank-schemas.ts src/app/actions/bank.ts __tests__/validators/bank-schemas.test.ts
git commit -m "feat(bancos): agrega esquemas Zod y server actions"
```

---

## Task 14: Pantalla de resumen

**Files:**
- Create: `src/app/financial/banks/page.tsx`
- Create: `src/app/financial/banks/loading.tsx`
- Create: `src/presentation/bank/components/BankOverviewClient.tsx`
- Create: `src/presentation/bank/components/BankBalanceHero.tsx`
- Create: `src/presentation/bank/components/AccountRow.tsx`
- Create: `src/presentation/bank/components/CardRow.tsx`
- Test: `__tests__/components/bank-overview.test.tsx`

**Interfaces:**
- Consumes: `getBankOverviewAction`, `formatBankNumber`, tipos `BankOverview`, `BankAccountWithBalance`, `BankCardWithDebt`
- Produce: componentes `BankOverviewClient`, `BankBalanceHero`, `AccountRow`, `CardRow`

Referencia visual: `src/presentation/financial/components/BalanceHeroCard.tsx`. Mobile-first.

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/bank-overview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { BankOverviewClient } from "@/presentation/bank/components/BankOverviewClient";
import type { BankOverview } from "@/application/services/bank-service";

const overview: BankOverview = {
    institutions: [{
        id: "i1", ownerUserId: "u", name: "Banco del Austro", kind: "BANK",
        isUnconfirmed: false, createdAt: "", updatedAt: "", isDeleted: false,
    }],
    accounts: [{
        id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
        accountType: "SAVINGS", lastFour: "0814", currency: "USD", status: "ACTIVE",
        isUnconfirmed: false, balance: 2104.18, lastSnapshotAt: "2026-08-01T00:00:00Z",
        createdAt: "", updatedAt: "", isDeleted: false,
    }],
    cards: [{
        id: "c1", ownerUserId: "u", institutionId: "i1", name: "Pacificard Mastercard",
        cardType: "CREDIT", lastFour: "8361", currency: "USD", creditLimit: 3000,
        statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
        debt: 842.15, availableCredit: 2157.85, openStatement: null,
        createdAt: "", updatedAt: "", isDeleted: false,
    }],
    totalAvailable: 2104.18, totalDebt: 842.15, totalAvailableCredit: 2157.85,
    cashBalance: 185, nextDueDate: "2026-08-28", unconfirmedCount: 0,
};

describe("BankOverviewClient", () => {
    it("muestra la cuenta con puntos y la tarjeta con equis", () => {
        render(<BankOverviewClient initialData={overview} />);
        expect(screen.getByText(/••••0814/)).toBeInTheDocument();
        expect(screen.getByText(/XXXX8361/)).toBeInTheDocument();
    });

    it("muestra el disponible y la deuda", () => {
        render(<BankOverviewClient initialData={overview} />);
        expect(screen.getByText(/2\.104,18/)).toBeInTheDocument();
        expect(screen.getByText(/842,15/)).toBeInTheDocument();
    });

    it("avisa cuando hay cuentas sin confirmar", () => {
        render(<BankOverviewClient initialData={{ ...overview, unconfirmedCount: 7 }} />);
        expect(screen.getByText(/7 cuentas sin identificar/i)).toBeInTheDocument();
    });

    it("no muestra el aviso cuando no hay ninguna", () => {
        render(<BankOverviewClient initialData={overview} />);
        expect(screen.queryByText(/sin identificar/i)).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- __tests__/components/bank-overview.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir los componentes**

`src/presentation/bank/components/AccountRow.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Landmark, Wallet } from "lucide-react";
import { formatBankNumber } from "@/lib/format-bank-number";
import type { BankAccountWithBalance } from "@/application/services/bank-service";

const TYPE_LABEL: Record<string, string> = {
    CHECKING: "Corriente", SAVINGS: "Ahorros",
    CASH: "Efectivo", INVESTMENT: "Inversión",
};

function money(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AccountRow({ account }: { account: BankAccountWithBalance }) {
    const number = formatBankNumber(account, "ACCOUNT");
    const Icon = account.accountType === "CASH" ? Wallet : Landmark;

    return (
        <Link
            href={`/financial/banks/accounts/${account.id}`}
            className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/50"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{account.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {TYPE_LABEL[account.accountType] ?? account.accountType}
                    {number && ` · ${number}`}
                </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
                <span className="block text-sm font-semibold text-emerald-400">
                    {money(account.balance)}
                </span>
                {account.lastSnapshotAt && (
                    <span className="block text-[10px] text-muted-foreground">
                        al {new Date(account.lastSnapshotAt).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}
                    </span>
                )}
            </span>
        </Link>
    );
}
```

`src/presentation/bank/components/CardRow.tsx`:

```tsx
"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { formatBankNumber } from "@/lib/format-bank-number";
import type { BankCardWithDebt } from "@/application/services/bank-service";

function money(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CardRow({ card }: { card: BankCardWithDebt }) {
    const isCredit = card.cardType === "CREDIT";
    const number = formatBankNumber(card, "CARD");

    return (
        <Link
            href={`/financial/banks/cards/${card.id}`}
            className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/50"
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isCredit ? "bg-rose-500/15 text-rose-400" : "bg-slate-500/15 text-slate-300"
            }`}>
                <CreditCard className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{card.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {isCredit ? "Crédito" : "Débito"}
                    {number && ` · ${number}`}
                    {isCredit && card.statementDay && ` · corte ${card.statementDay}`}
                    {!isCredit && card.accountName && ` → ${card.accountName}`}
                </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
                {isCredit ? (
                    <>
                        <span className="block text-sm font-semibold text-rose-400">
                            −{money(card.debt)}
                        </span>
                        {card.creditLimit != null && (
                            <span className="block text-[10px] text-muted-foreground">
                                de {money(card.creditLimit)}
                            </span>
                        )}
                    </>
                ) : (
                    // Una tarjeta de débito no tiene saldo propio: gasta el de su cuenta.
                    <span className="block text-[10px] leading-tight text-muted-foreground">
                        usa el saldo<br />de la cuenta
                    </span>
                )}
            </span>
        </Link>
    );
}
```

`src/presentation/bank/components/BankBalanceHero.tsx`: panel con gradiente siguiendo `BalanceHeroCard`, mostrando `totalAvailable`, y píldoras con la deuda total y el cupo libre.

`src/presentation/bank/components/BankOverviewClient.tsx`: agrupa cuentas y tarjetas por `institutionId`, renderiza el hero, dos KPI (efectivo, próximo pago) y los grupos. El aviso de sin confirmar solo aparece si `unconfirmedCount > 0`, con el texto `{n} cuentas sin identificar`, y enlaza a `/financial/banks/reconcile` (ruta que llega en el segundo plan; hasta entonces mostrará el 404 de Next, que es preferible a esconder el aviso).

`src/app/financial/banks/page.tsx` es un Server Component que llama a `getBankOverviewAction()` y pasa el resultado como `initialData`.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- __tests__/components/bank-overview.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verificar en el navegador**

Run: `npm run dev` y abrir `http://localhost:3000/financial/banks`
Expected: la página carga sin errores. Con la base vacía muestra el estado vacío, no una excepción.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/app/financial/banks src/presentation/bank __tests__/components/bank-overview.test.tsx
git commit -m "feat(bancos): agrega pantalla de resumen"
```

---

## Task 15: Detalle de cuenta

**Files:**
- Create: `src/app/financial/banks/accounts/[id]/page.tsx`
- Create: `src/presentation/bank/components/AccountDetailClient.tsx`
- Create: `src/presentation/bank/components/BalanceSnapshotSheet.tsx`
- Create: `src/presentation/bank/components/MovementRow.tsx`
- Test: `__tests__/components/bank-account-detail.test.tsx`

**Interfaces:**
- Consumes: `getBankAccountDetailAction`, `registerBalanceSnapshotAction`, tipo `BankAccountDetail`
- Produce: `AccountDetailClient`, `BalanceSnapshotSheet`, `MovementRow`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/bank-account-detail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { AccountDetailClient } from "@/presentation/bank/components/AccountDetailClient";
import type { BankAccountDetail } from "@/application/services/bank-service";

const detail: BankAccountDetail = {
    account: {
        id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
        accountType: "SAVINGS", lastFour: "0814", currency: "USD", status: "ACTIVE",
        isUnconfirmed: false, balance: 2104.18, lastSnapshotAt: "2026-08-01T00:00:00Z",
        institutionName: "Banco del Austro",
        createdAt: "", updatedAt: "", isDeleted: false,
    },
    snapshots: [{
        id: "s1", ownerUserId: "u", accountId: "a1", balance: 2310,
        asOf: "2026-08-01T00:00:00Z", source: "MANUAL",
        createdAt: "", updatedAt: "", isDeleted: false,
    }],
    movements: [
        {
            transactionId: "t1", ownerUserId: "u", date: "2026-08-12T00:00:00Z",
            accountId: "a1", cardId: null, direction: "OUT", amount: 96.41,
            currency: "USD", description: "Transferencia", merchant: "Banco Pacifico", categoryId: null,
        },
        {
            transactionId: "t2", ownerUserId: "u", date: "2026-08-11T00:00:00Z",
            accountId: "a1", cardId: null, direction: "IN", amount: 500,
            currency: "USD", description: "Anticipo", merchant: "Tymarq", categoryId: null,
        },
    ],
    running: [2104.18, 2200.59],
};

describe("AccountDetailClient", () => {
    it("muestra el saldo actual y el corte declarado", () => {
        render(<AccountDetailClient initialData={detail} />);
        expect(screen.getByText(/2\.104,18/)).toBeInTheDocument();
        expect(screen.getByText(/2\.310,00/)).toBeInTheDocument();
    });

    it("muestra el saldo corrido junto a cada movimiento", () => {
        render(<AccountDetailClient initialData={detail} />);
        expect(screen.getByText("2.200,59")).toBeInTheDocument();
    });

    it("distingue entradas de salidas por signo", () => {
        render(<AccountDetailClient initialData={detail} />);
        expect(screen.getByText(/−\$96,41/)).toBeInTheDocument();
        expect(screen.getByText(/\+\$500,00/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- __tests__/components/bank-account-detail.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir los componentes**

`MovementRow.tsx` recibe `movement` y `runningBalance` y renderiza: icono según dirección (`OUT` rosa flecha arriba-derecha, `IN` esmeralda flecha abajo-izquierda), descripción y comercio, monto con signo (`−$` para `OUT`, `+$` para `IN`), y debajo el saldo corrido en gris.

`BalanceSnapshotSheet.tsx` usa `FormSheet` de `@/components/ui/form-sheet` con dos campos —monto y fecha— y llama a `registerBalanceSnapshotAction`. Al volver `{ success: true }` cierra y refresca con `router.refresh()`; al fallar muestra `toast.error(result.error)`.

`AccountDetailClient.tsx` monta: cabecera con nombre e institución, hero con `balance` y píldoras (`Corte $X · fecha`, `N movimientos desde entonces`), panel de conciliación con las tres cifras —último corte, movimientos posteriores como diferencia, saldo calculado—, y la lista de movimientos agrupada por día con `MovementRow`.

El panel de conciliación calcula la cifra del medio como `balance − snapshotBalance`, mostrando el signo. Cuando no hay snapshot, el panel se reemplaza por una llamada a registrar el primero.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- __tests__/components/bank-account-detail.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/app/financial/banks/accounts src/presentation/bank/components __tests__/components/bank-account-detail.test.tsx
git commit -m "feat(bancos): agrega detalle de cuenta con saldo corrido y cortes"
```

---

## Task 16: Detalle de tarjeta de crédito

**Files:**
- Create: `src/app/financial/banks/cards/[id]/page.tsx`
- Create: `src/presentation/bank/components/CardDetailClient.tsx`
- Create: `src/presentation/bank/components/StatementPanel.tsx`
- Test: `__tests__/components/bank-card-detail.test.tsx`

**Interfaces:**
- Consumes: `getBankCardDetailAction`, `setStatementTotalAction`, `payStatementAction`, `computeStatementDue`, tipo `BankCardDetail`
- Produce: `CardDetailClient`, `StatementPanel`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/bank-card-detail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { CardDetailClient } from "@/presentation/bank/components/CardDetailClient";
import type { BankCardDetail } from "@/application/services/bank-service";

const statement = {
    id: "st1", ownerUserId: "u", cardId: "c1",
    periodStart: "2026-07-21", periodEnd: "2026-08-20", dueDate: "2026-08-28",
    computedAmount: 611.4, totalAmount: 658.9, paidAmount: 0, status: "OPEN" as const,
    createdAt: "", updatedAt: "", isDeleted: false,
};

const detail: BankCardDetail = {
    card: {
        id: "c1", ownerUserId: "u", institutionId: "i1", name: "Pacificard Mastercard",
        cardType: "CREDIT", lastFour: "8361", currency: "USD", creditLimit: 3000,
        statementDay: 20, dueDay: 28, status: "ACTIVE", isUnconfirmed: false,
        debt: 842.15, availableCredit: 2157.85, openStatement: statement,
        institutionName: "Banco del Austro",
        createdAt: "", updatedAt: "", isDeleted: false,
    },
    statements: [statement],
    movements: [],
    periodMovements: [],
    payableAccounts: [],
};

describe("CardDetailClient", () => {
    it("muestra deuda total y cupo libre", () => {
        render(<CardDetailClient initialData={detail} />);
        expect(screen.getByText(/842,15/)).toBeInTheDocument();
        expect(screen.getByText(/2\.157,85/)).toBeInTheDocument();
    });

    it("muestra el calculado, el declarado y la diferencia", () => {
        render(<CardDetailClient initialData={detail} />);
        expect(screen.getByText(/611,40/)).toBeInTheDocument();
        expect(screen.getByText(/658,90/)).toBeInTheDocument();
        expect(screen.getByText(/47,50/)).toBeInTheDocument();
    });

    it("no muestra la diferencia cuando el banco no declaró total", () => {
        const sinTotal = {
            ...detail,
            card: { ...detail.card, openStatement: { ...statement, totalAmount: null } },
            statements: [{ ...statement, totalAmount: null }],
        };
        render(<CardDetailClient initialData={sinTotal} />);
        expect(screen.queryByText(/diferencia sin explicar/i)).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- __tests__/components/bank-card-detail.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir los componentes**

`src/presentation/bank/components/StatementPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { computeStatementDue } from "@/domain/services/bank-balance";
import { payStatementAction } from "@/app/actions/bank";
import type { BankCardStatement } from "@/domain/entities/bank";
import type { BankAccountWithBalance } from "@/application/services/bank-service";

function money(value: number): string {
    return `$${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
    statement: BankCardStatement;
    accounts: BankAccountWithBalance[];
}

export function StatementPanel({ statement, accounts }: Props) {
    const router = useRouter();
    const [paying, setPaying] = useState(false);

    const declared = statement.totalAmount;
    // La diferencia solo existe cuando el banco declaró un total propio. Es la
    // medida de cuánto se le escapó al escaneo ese mes, no un error a esconder.
    const gap = declared != null
        ? Math.round((declared - statement.computedAmount) * 100) / 100
        : null;
    const due = computeStatementDue(statement);

    async function handlePay() {
        const source = accounts.find(a => a.accountType !== "CASH" && !a.isUnconfirmed);
        if (!source) {
            toast.error("Registra primero una cuenta desde la que pagar");
            return;
        }
        setPaying(true);
        const result = await payStatementAction({
            statementId: statement.id,
            sourceAccountId: source.id,
            amount: due,
            date: new Date().toISOString(),
        });
        setPaying(false);

        if (result.success) {
            toast.success("Pago registrado");
            router.refresh();
        } else {
            toast.error(result.error);
        }
    }

    return (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                    Estado de cuenta · {statement.periodStart} – {statement.periodEnd}
                </span>
                <span className="text-xs text-muted-foreground">
                    vence {statement.dueDate}
                </span>
            </div>

            <Row label="Calculado por la app" value={money(statement.computedAmount)} />
            {declared != null && (
                <Row label="Declarado por el banco" value={money(declared)} tone="warn" />
            )}
            {gap != null && gap !== 0 && (
                <Row
                    label="Diferencia sin explicar"
                    value={money(Math.abs(gap))}
                    tone="bad"
                />
            )}
            <Row label="Pagado" value={money(statement.paidAmount)} tone="good" />

            {due > 0 && (
                <Button onClick={handlePay} disabled={paying} className="w-full">
                    {paying ? "Registrando…" : `Pagar ${money(due)}`}
                </Button>
            )}
        </div>
    );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
    const color = tone === "good" ? "text-emerald-400"
        : tone === "warn" ? "text-amber-400"
        : tone === "bad" ? "text-rose-400"
        : "";
    return (
        <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
        </div>
    );
}
```

`CardDetailClient` le pasa `payableAccounts` como prop `accounts`.

El origen del pago se resuelve tomando la primera cuenta pagable. Es una simplificación consciente de esta fase: con una sola cuenta bancaria registrada acierta siempre, y elegir entre varias es un sheet que se añade cuando haga falta. Si no hay ninguna cuenta, avisa en vez de fallar.

`CardDetailClient.tsx` monta: cabecera con nombre e institución (número con `formatBankNumber(card, "CARD")`), hero en variante deuda con `debt` y píldoras (`Vence {dueDate} · en N días`, `Cupo libre $X`), panel de cupo usado con barra de progreso `debt / creditLimit`, el `StatementPanel` del estado abierto, la lista de `periodMovements`, y un panel de estados anteriores con los `statements` cerrados.

La barra de cupo solo se renderiza si `creditLimit != null`.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- __tests__/components/bank-card-detail.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/app/financial/banks/cards src/presentation/bank/components __tests__/components/bank-card-detail.test.tsx
git commit -m "feat(bancos): agrega detalle de tarjeta con ciclo de facturacion"
```

---

## Task 17: Formularios de alta y edición

**Files:**
- Create: `src/presentation/bank/components/InstitutionFormSheet.tsx`
- Create: `src/presentation/bank/components/AccountFormSheet.tsx`
- Create: `src/presentation/bank/components/CardFormSheet.tsx`
- Modify: `src/presentation/bank/components/BankOverviewClient.tsx` (botón «Nuevo»)
- Test: `__tests__/components/bank-card-form.test.tsx`

**Interfaces:**
- Consumes: las acciones de creación y actualización de la Task 13
- Produce: los tres sheets

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/bank-card-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardFormSheet } from "@/presentation/bank/components/CardFormSheet";

const institutions = [{
    id: "i1", ownerUserId: "u", name: "Banco del Austro", kind: "BANK" as const,
    isUnconfirmed: false, createdAt: "", updatedAt: "", isDeleted: false,
}];
const accounts = [{
    id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
    accountType: "SAVINGS" as const, currency: "USD", status: "ACTIVE" as const,
    isUnconfirmed: false, createdAt: "", updatedAt: "", isDeleted: false,
}];

describe("CardFormSheet", () => {
    it("en crédito pide cupo y ciclo, y no pide cuenta", async () => {
        render(<CardFormSheet open institutions={institutions} accounts={accounts} onOpenChange={() => {}} />);
        await userEvent.click(screen.getByRole("button", { name: /crédito/i }));

        expect(screen.getByLabelText(/cupo/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/día de corte/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/atar a la cuenta/i)).not.toBeInTheDocument();
    });

    it("en débito pide cuenta y esconde cupo y ciclo", async () => {
        render(<CardFormSheet open institutions={institutions} accounts={accounts} onOpenChange={() => {}} />);
        await userEvent.click(screen.getByRole("button", { name: /débito/i }));

        expect(screen.getByLabelText(/atar a la cuenta/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/cupo/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/día de corte/i)).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- __tests__/components/bank-card-form.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir los sheets**

Los tres usan `FormSheet`, `Field`, `Input` y `Select` de `@/components/ui`, igual que el desaparecido `AccountManager`.

`CardFormSheet` monta un selector segmentado Débito/Crédito arriba; el resto del formulario se re-renderiza según el valor:
- **Crédito** — institución, nombre, marca, últimos 4, cupo, día de corte, día de pago.
- **Débito** — institución, nombre, marca, últimos 4, cuenta a la que se ata.

Al cambiar de tipo se limpian los campos del otro rama, para que no viajen valores que el esquema Zod va a rechazar.

`AccountFormSheet` esconde el selector de institución cuando el tipo es `CASH`, espejando la regla del esquema.

`InstitutionFormSheet` pide nombre, tipo (`BANK`/`COOPERATIVE`/`WALLET`/`OTHER`) y color.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- __tests__/components/bank-card-form.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verificar el flujo completo en el navegador**

Run: `npm run dev`, ir a `/financial/banks`, crear una institución, una cuenta de ahorros y una tarjeta de crédito.
Expected: las tres aparecen en el resumen. La tarjeta de crédito muestra deuda $0,00 y el cupo completo disponible.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/presentation/bank/components __tests__/components/bank-card-form.test.tsx
git commit -m "feat(bancos): agrega formularios de institucion, cuenta y tarjeta"
```

---

## Task 18: Menú y paso de pago del wizard

**Files:**
- Modify: `src/config/menu-items.ts`
- Modify: `src/presentation/financial/components/transaction-wizard/steps/PaymentStep.tsx`
- Create: `src/presentation/bank/components/PaymentSourcePicker.tsx`
- Test: `__tests__/components/payment-source-picker.test.tsx`

**Interfaces:**
- Consumes: `getBankOverviewAction` (para poblar el selector), `formatBankNumber`
- Produce: `PaymentSourcePicker` con props `{ accounts, cards, value, onChange }` donde `value` es `{ accountId?: UUID; cardId?: UUID }`

- [ ] **Step 1: Añadir la entrada de menú**

En `src/config/menu-items.ts`, importar `Landmark` de `lucide-react` y añadir dentro de la sección Finanzas, entre Escaneos y Configuración:

```ts
{ label: "Bancos", icon: Landmark, href: "/financial/banks" },
```

- [ ] **Step 2: Escribir el test que falla**

Crear `__tests__/components/payment-source-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentSourcePicker } from "@/presentation/bank/components/PaymentSourcePicker";

const accounts = [{
    id: "a1", ownerUserId: "u", institutionId: "i1", name: "Ahorros Principal",
    accountType: "SAVINGS" as const, lastFour: "0814", currency: "USD",
    status: "ACTIVE" as const, isUnconfirmed: false, balance: 2104.18,
    createdAt: "", updatedAt: "", isDeleted: false,
}];
const cards = [{
    id: "c1", ownerUserId: "u", institutionId: "i1", name: "Pacificard Mastercard",
    cardType: "CREDIT" as const, lastFour: "8361", currency: "USD",
    status: "ACTIVE" as const, isUnconfirmed: false, debt: 0, availableCredit: 3000,
    createdAt: "", updatedAt: "", isDeleted: false,
}];

describe("PaymentSourcePicker", () => {
    it("avisa que el crédito no baja el saldo hoy", async () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        await userEvent.click(screen.getByText(/Pacificard Mastercard/));

        expect(onChange).toHaveBeenCalledWith({ cardId: "c1", paidWithCredit: true });
    });

    it("elegir una cuenta no marca pago con crédito", async () => {
        const onChange = jest.fn();
        render(<PaymentSourcePicker accounts={accounts} cards={cards} value={{}} onChange={onChange} />);
        await userEvent.click(screen.getByText(/Ahorros Principal/));

        expect(onChange).toHaveBeenCalledWith({ accountId: "a1", paidWithCredit: false });
    });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- __tests__/components/payment-source-picker.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 4: Escribir el selector**

`src/presentation/bank/components/PaymentSourcePicker.tsx` lista cuentas y tarjetas como filas seleccionables. Al elegir, emite:

```ts
onChange({ accountId: account.id, paidWithCredit: false })
// o
onChange({ cardId: card.id, paidWithCredit: card.cardType === "CREDIT" })
```

Para una tarjeta de débito emite además el `accountId` de su cuenta atada, porque el gasto sale de ahí:

```ts
onChange({ cardId: card.id, accountId: card.accountId!, paidWithCredit: false })
```

Debajo, un aviso permanente: «Si eliges una tarjeta de crédito, el gasto no baja tu saldo hoy. Baja cuando registres el pago de la tarjeta.»

- [ ] **Step 5: Integrar en el wizard**

En `PaymentStep.tsx`, reemplazar el toggle suelto de crédito por `PaymentSourcePicker`. El valor de `paidWithCredit` pasa a derivarse de lo seleccionado en vez de ser una pregunta propia. Mantener el toggle manual solo como salida de emergencia cuando el usuario no elige ninguna fuente.

- [ ] **Step 6: Correr toda la suite**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: todo en verde. Los tests existentes del wizard pueden necesitar ajuste si asumían el toggle; actualizarlos, no borrarlos.

- [ ] **Step 7: Verificar el flujo completo en el navegador**

Run: `npm run dev`. Crear una transacción de gasto desde el wizard eligiendo la tarjeta de crédito, y otra eligiendo la cuenta de ahorros.
Expected: en `/financial/banks`, la deuda de la tarjeta subió por el primero y el saldo de la cuenta bajó por el segundo. El balance global del dashboard financiero no cambió por el gasto con crédito.

- [ ] **Step 8: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/config/menu-items.ts src/presentation/financial/components/transaction-wizard src/presentation/bank/components/PaymentSourcePicker.tsx __tests__/components/payment-source-picker.test.tsx
git commit -m "feat(bancos): agrega Bancos al menu y selector de fuente en el wizard"
```

---

## Verificación final

- [ ] **Suite completa**

Run: `npm test`
Expected: todos los tests pasan, incluidos los que ya existían.

- [ ] **Tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Build de producción**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Recorrido manual**

1. `/financial/banks` carga y muestra el resumen.
2. Crear institución, cuenta y tarjeta de crédito funciona.
3. El detalle de cuenta muestra saldo corrido; registrar un corte lo re-ancla.
4. El detalle de tarjeta muestra el estado del período con corte y vencimiento.
5. El wizard permite elegir cuenta o tarjeta y la transacción queda atada.
6. Pagar el estado de cuenta baja la deuda de la tarjeta **y** el saldo de la cuenta, y el pago aparece como una transacción más en el listado financiero.
7. Un gasto con tarjeta de crédito sube la deuda pero **no** mueve el balance global hasta que se paga.
8. `/financial/settings` ya no tiene la pestaña Cuentas y sigue funcionando.

- [ ] **Actualizar el grafo**

Run: `graphify update .`

---

## Lo que sigue

Segundo plan, `docs/superpowers/plans/YYYY-MM-DD-modulo-bancos-identificacion.md`:

- `bank_number_observations` y su enum `bank_number_resolution`
- `src/lib/bank-number-fingerprint.ts` — parseo a huella, con las 94 cadenas crudas reales como fixtures
- `src/lib/bank-number-match.ts` — compatibilidad por sufijo contenido, guard de prefijo, BIN y marca
- Cascada de auto-creación al crear transacción, en `BankService`
- Migración de backfill sobre las 274 transacciones enlazables y el regex sobre `emailBody` para las 110 restantes
- `/financial/banks/reconcile` con sus tres secciones por confianza
- FK de `financial_transactions.bank_counterparty_observation_id`
