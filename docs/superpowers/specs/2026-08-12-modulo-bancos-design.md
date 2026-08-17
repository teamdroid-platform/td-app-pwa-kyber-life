# Módulo Bancos — diseño

**Fecha:** 2026-08-12
**Estado:** aprobado para pasar a plan de implementación
**Proyecto Supabase:** KyberLife (`xywkuwmhnfcdksamuypk`, us-east-2)

---

## 1. Problema

Hoy el módulo financiero mezcla dos conceptos en una sola tabla. `financial_institutions`
tiene 139 filas: 115 sin tipo y algunas tipadas como restaurante, tienda o servicio
—todas comercios— más 4 tipadas como "Institución Financiera" (Banco del Austro, Banco del
Pacifico, Banco Pichincha, COAC Jardín Azuayo) y una billetera digital (Deuna). Un banco y una
farmacia son la misma clase de fila.

`financial_accounts` existe con su UI (`AccountManager.tsx`) pero tiene **0 filas**: nunca se
usó. `financial_transactions.account_id` está siempre en null. El saldo que muestra la app es
un único número global calculado por `computeNetBalance`, sin noción de cuenta.

Al mismo tiempo, los escaneos ya traen la información que haría falta:
`financial_scanner_transactions.accounts` es un jsonb con origen y destino enmascarados
(`[{"type":"origen","account":"AHO - XXXXXX0814"},{"type":"destino","account":"XXXXXX6655"}]`),
y `financial_transactions.origin_stats` conserva el correo entero del banco.

Lo que no se puede responder hoy:

- ¿Cuánto tengo en cada cuenta?
- ¿Cuánto debo por una tarjeta de crédito específica?
- ¿A dónde se movió el dinero cuando transferí entre mis cuentas?
- ¿Cuánto efectivo tengo en mano después de los retiros?

## 2. Alcance

Un módulo nuevo, **Bancos**, dueño de las relaciones entre instituciones emisoras, cuentas,
tarjetas y el movimiento de dinero entre ellas. Todas sus tablas llevan el prefijo `bank_`.
Vive por ahora dentro de la sección de menú Finanzas.

El módulo financiero conserva el concepto de institución, que a partir de aquí significa
inequívocamente **comercio**.

## 3. Decisiones

Cada una se tomó explícitamente durante el diseño; la columna de razón es lo que hay que
releer antes de revertir alguna.

| # | Decisión | Razón |
|---|---|---|
| 1 | Los bancos que ya existen en `financial_institutions` se **duplican** a `bank_institutions`, no se mueven | Hay retiros cuyo comercio *es* el banco (`type = withdrawal`, `merchant = "Banco del Austro"`). Borrar la fila dejaría esas transacciones sin comercio. Un puente `financial_institution_id` une ambas |
| 2 | El saldo se ancla en un **corte manual** y corre con los movimientos posteriores | El escaneo solo ve lo que llega por correo o SMS. Un saldo inicial único desalinea para siempre en cuanto se pierde un movimiento; el corte permite re-anclar sin reescribir historia |
| 3 | Tarjetas de crédito con **ciclo completo** de facturación | Lo pidió el usuario. Estados de cuenta congelados al corte, editables contra lo que declara el banco |
| 4 | `bank_accounts` y `bank_cards` son tablas **separadas** | En Ecuador la tarjeta de débito golpea el saldo de la cuenta a la que está atada; la de crédito la emite la institución directo al cliente y no cuelga de ninguna cuenta. Una tarjeta de crédito no es una cuenta y no debe fingir serlo |
| 5 | La transacción se ata a cuentas por **columnas**, y una **vista** las explota en libro mayor | La transacción sigue siendo la única fuente de verdad. Una tabla ledger física exigiría regenerar filas en cada edición y podría derivar en silencio |
| 6 | El efectivo es una **cuenta virtual** `CASH` auto-creada por usuario | Un retiro pasa a ser transferencia cuenta → efectivo: baja aquí, sube allá, neto cero. Preserva exactamente la neutralidad que `computeNetBalance` ya le da a `WITHDRAWAL` |
| 7 | El backfill del historial es **asistido**, nunca automático | Los enmascarados chocan y se truncan. Un mapeo errado entra silencioso al cálculo de saldos y no hay forma de detectarlo después |
| 8 | Los números **no se canonizan a un string**: se parsean a huella y se guarda cada forma vista | Ver sección 5. Cada máscara revela una parte distinta del número; colapsarlas a una sola cadena tira información que hace falta para emparejar |
| 9 | Los estados de cuenta se cierran de forma **perezosa**, no por cron | La app no tiene proceso programado propio. Al leer una tarjeta se cierra el período vencido y se abre el siguiente; la operación es idempotente y el resultado no depende de cuándo se leyó |

### 3.1 Decisiones tomadas por defecto

Estas tres se resolvieron con la recomendación por defecto y son revisables sin costo antes
de implementar:

- **La diferencia entre `computed_amount` y `total_amount` en el estado de cuenta se conserva
  y se muestra.** Mide cuánto se le escapó al escaneo ese mes. Sin ella, un consumo perdido
  queda invisible para siempre.
- **`bank_institution_id` se mantiene en la transacción** aunque sea redundante cuando ya hay
  cuenta o tarjeta identificada. El escaneo casi siempre sabe el banco antes que el número.
- **Las observaciones `INFERRED` cuentan hacia los saldos** sin esperar revisión del usuario,
  porque su candidato es único y compatible en las cuatro dimensiones. Ver el riesgo en §14.

## 4. Modelo de datos

### 4.1 Enums

```sql
create type bank_institution_kind as enum ('BANK', 'COOPERATIVE', 'WALLET', 'OTHER');
create type bank_account_type     as enum ('CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT');
create type bank_account_status   as enum ('ACTIVE', 'CLOSED');
create type bank_card_type        as enum ('DEBIT', 'CREDIT');
create type bank_card_status      as enum ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CLOSED');
create type bank_snapshot_source  as enum ('MANUAL', 'SCAN', 'INITIAL');
create type bank_statement_status as enum ('OPEN', 'CLOSED', 'PAID', 'OVERDUE');
create type bank_number_resolution as enum ('EXACT', 'INFERRED', 'MANUAL', 'EXTERNAL', 'PENDING');
```

### 4.2 `bank_institutions`

```sql
create table bank_institutions (
  id                       uuid primary key default gen_random_uuid(),
  owner_user_id            uuid not null references auth.users(id) on delete cascade,
  name                     text not null,
  short_name               text,
  kind                     bank_institution_kind not null default 'BANK',
  logo_url                 text,
  color                    text,
  country                  text default 'EC',
  financial_institution_id uuid references financial_institutions(id) on delete set null,
  is_unconfirmed           boolean not null default false,
  created_at               timestamptz not null default timezone('utc', now()),
  updated_at               timestamptz not null default timezone('utc', now()),
  is_deleted               boolean not null default false
);

create unique index bank_institutions_owner_name_uq
  on bank_institutions (owner_user_id, lower(name)) where is_deleted = false;
```

`financial_institution_id` es el puente al gemelo comercio. Es nullable: un banco puede
existir sin que nunca se haya comprado nada en él.

### 4.3 `bank_accounts`

```sql
create table bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  institution_id uuid references bank_institutions(id) on delete restrict,
  name           text not null,
  account_type   bank_account_type not null,
  last_four      text,          -- cuando se conocen los 4 últimos
  prefix_digits  text,          -- cuando la máscara solo revela el inicio
  currency       text not null default 'USD',
  status         bank_account_status not null default 'ACTIVE',
  is_unconfirmed boolean not null default false,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now()),
  is_deleted     boolean not null default false,

  -- El efectivo no tiene emisor; todo lo demás sí
  constraint bank_accounts_cash_has_no_institution
    check ((account_type = 'CASH') = (institution_id is null))
);

create unique index bank_accounts_one_cash_per_owner
  on bank_accounts (owner_user_id) where account_type = 'CASH' and is_deleted = false;

create index bank_accounts_owner_lastfour_idx
  on bank_accounts (owner_user_id, last_four) where is_deleted = false;
```

La cuenta `CASH` se crea junto con el perfil, o de forma perezosa la primera vez que se
registra un retiro.

### 4.4 `bank_cards`

```sql
create table bank_cards (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  institution_id uuid not null references bank_institutions(id) on delete restrict,
  account_id     uuid references bank_accounts(id) on delete restrict,
  name           text not null,
  card_type      bank_card_type not null,
  brand          text,
  bin            text,
  last_four      text,
  prefix_digits  text,
  currency       text not null default 'USD',
  credit_limit   numeric(14,2),
  statement_day  smallint check (statement_day between 1 and 31),
  due_day        smallint check (due_day between 1 and 31),
  status         bank_card_status not null default 'ACTIVE',
  is_unconfirmed boolean not null default false,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now()),
  is_deleted     boolean not null default false,

  -- El débito vive sobre una cuenta; el crédito lo emite la institución
  constraint bank_cards_debit_requires_account
    check (card_type <> 'DEBIT' or account_id is not null),
  constraint bank_cards_credit_has_no_account
    check (card_type <> 'CREDIT' or account_id is null),
  -- Solo el crédito tiene ciclo y cupo
  constraint bank_cards_debit_has_no_credit_fields
    check (card_type <> 'DEBIT'
           or (credit_limit is null and statement_day is null and due_day is null))
);

create index bank_cards_owner_lastfour_idx
  on bank_cards (owner_user_id, last_four) where is_deleted = false;
```

Los tres CHECK hacen que el estado inválido sea imposible de escribir, no algo que el
servicio tenga que recordar validar.

### 4.5 `bank_account_balance_snapshots`

```sql
create table bank_account_balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references bank_accounts(id) on delete cascade,
  balance       numeric(14,2) not null,
  as_of         timestamptz not null,
  source        bank_snapshot_source not null default 'MANUAL',
  note          text,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  is_deleted    boolean not null default false
);

create index bank_snapshots_account_asof_idx
  on bank_account_balance_snapshots (account_id, as_of desc) where is_deleted = false;
```

### 4.6 `bank_card_statements`

```sql
create table bank_card_statements (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  card_id         uuid not null references bank_cards(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  due_date        date not null,
  computed_amount numeric(14,2) not null default 0,
  total_amount    numeric(14,2),
  paid_amount     numeric(14,2) not null default 0,
  status          bank_statement_status not null default 'OPEN',
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  is_deleted      boolean not null default false,

  constraint bank_card_statements_period_order check (period_end >= period_start)
);

create unique index bank_card_statements_card_period_uq
  on bank_card_statements (card_id, period_start) where is_deleted = false;
```

`computed_amount` es lo que la app sumó de consumos detectados. `total_amount` es lo que
declara el banco y lo edita el usuario; cuando es null, se asume igual al calculado. La
diferencia entre ambos es el indicador de cobertura del escaneo.

### 4.7 `bank_number_observations`

Cada forma distinta en que se ha visto escrito un número, con sus partes parseadas. Es la
tabla que hace que el emparejamiento mejore solo con el uso: una máscara nueva se resuelve
una vez y queda aprendida.

```sql
create table bank_number_observations (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null references auth.users(id) on delete cascade,

  raw               text not null,          -- la cadena cruda, tal cual llegó
  prefix_digits     text not null default '',
  suffix_digits     text not null default '',
  total_length      smallint,
  bin               text,
  brand             text,
  account_type_hint text,                   -- AHO, CTE, ...
  institution_hint  text,                   -- "Coop Jardín Azuayo" embebido en la cadena

  account_id        uuid references bank_accounts(id) on delete set null,
  card_id           uuid references bank_cards(id) on delete set null,
  resolution        bank_number_resolution not null default 'PENDING',
  occurrences       integer not null default 1,

  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now()),

  constraint bank_number_observations_one_target
    check (account_id is null or card_id is null)
);

create unique index bank_number_observations_owner_raw_uq
  on bank_number_observations (owner_user_id, raw);

create index bank_number_observations_suffix_idx
  on bank_number_observations (owner_user_id, suffix_digits);
```

Los valores de `resolution`:

- `EXACT` — el sufijo tenía 4 dígitos o más y coincidió sin ambigüedad.
- `INFERRED` — se resolvió por contención de sufijo con menos de 4 dígitos, candidato único.
  Cuenta hacia los saldos, pero aparece listado en conciliación para revisión.
- `MANUAL` — lo asignó el usuario.
- `EXTERNAL` — cuenta de un tercero; no le corresponde fila propia.
- `PENDING` — ambigua o sin candidato.

### 4.8 Columnas nuevas en `financial_transactions`

```sql
alter table financial_transactions
  add column bank_source_account_id      uuid references bank_accounts(id) on delete set null,
  add column bank_destination_account_id uuid references bank_accounts(id) on delete set null,
  add column bank_card_id                uuid references bank_cards(id) on delete set null,
  add column bank_institution_id         uuid references bank_institutions(id) on delete set null,
  add column bank_card_statement_id      uuid references bank_card_statements(id) on delete set null,
  add column bank_counterparty_observation_id uuid references bank_number_observations(id) on delete set null;

create index financial_transactions_bank_source_idx
  on financial_transactions (bank_source_account_id, date desc);
create index financial_transactions_bank_dest_idx
  on financial_transactions (bank_destination_account_id, date desc);
create index financial_transactions_bank_card_idx
  on financial_transactions (bank_card_id, date desc);
```

`bank_counterparty_observation_id` apunta a la observación del otro lado cuando ese otro lado
no es del usuario —el beneficiario de una transferencia, por ejemplo. No le corresponde una
fila de cuenta, pero sí conserva su cadena cruda y su huella, así que el detalle de la
transacción puede mostrar a dónde fue el dinero.

### 4.9 Lo que se elimina

```sql
drop table financial_accounts;  -- 0 filas, nunca se usó
```

Y con ella `AccountManager.tsx`, `AccountSelect.tsx`, la entidad `FinancialAccount`, la
interfaz `IFinancialAccountRepository`, sus implementaciones, su cableado en el container y
las acciones `createAccountAction` / `updateAccountAction` / `deleteAccountAction` /
`getAccountsAction`. `financial_transactions.account_id` (siempre null) se elimina también.

### 4.10 RLS

Todas las tablas nuevas con RLS activo y la misma política que el resto del esquema:

```sql
alter table bank_institutions enable row level security;
create policy bank_institutions_owner on bank_institutions
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
```

Idéntico para las otras cuatro.

## 5. Identificación de números

Cada banco enmascara distinto, y cada máscara revela **una parte diferente** del mismo
número. Colapsar todo a una sola cadena canónica tira justo la información que hace falta
para emparejar. El diseño separa dos cosas:

- La **identidad** —la cuenta o tarjeta que el usuario posee y nombra.
- Las **observaciones** —cada forma en que se ha visto escrito su número.

### 5.1 La huella

`src/lib/bank-number-fingerprint.ts`, función pura. Parsea una cadena cruda a:

```ts
type NumberFingerprint = {
  raw: string;              // sin tocar
  prefixDigits: string;     // dígitos antes de la primera máscara
  suffixDigits: string;     // dígitos después de la última máscara
  totalLength: number;      // largo de la cadena normalizada
  bin: string | null;       // prefijo de 6 dígitos en una tarjeta
  brand: string | null;     // "Visa", "Mastercard", ...
  accountTypeHint: string | null;   // "AHO", "CTE"
  institutionHint: string | null;   // nombre de institución embebido
};
```

Ejemplos reales de la base:

| Cadena cruda | prefix | suffix | len | bin | brand | hints |
|---|---|---|---|---|---|---|
| `XXXXXX0814` | — | `0814` | 10 | — | — | — |
| `AHO - XXXXXX0814` | — | `0814` | 13 | — | — | tipo `AHO` |
| `493176XXXXXX2780` | `493176` | `2780` | 16 | `493176` | Visa | — |
| `••••2780` | — | `2780` | 8 | — | — | — |
| `Mastercard8361` | — | `8361` | 14 | — | Mastercard | — |
| `542258XXXXXXX361` | `542258` | `361` | 16 | `542258` | Mastercard | — |
| `CoopJardínAzuayo***5010` | — | `5010` | 23 | — | — | institución |
| `25XXX10` | `25` | `10` | 7 | — | — | — |
| `10XXXXXX11` | `10` | `11` | 10 | — | — | — |

Nada se descarta y nada se inventa. La cadena cruda se conserva íntegra en
`bank_number_observations.raw`.

### 5.2 Emparejamiento por compatibilidad

Dos huellas pueden ser el mismo número si **ninguna parte conocida se contradice**:

1. **Sufijo contenido** — el sufijo más corto es sufijo del más largo. `361` ⊂ `8361`,
   `620` ⊂ `9620`, `58` ⊂ `9558`.
2. **Prefijo compatible** — uno vacío, o uno es prefijo del otro.
3. **BIN y marca sin conflicto** — si ambos los declaran, deben coincidir.
4. **Largo compatible** — señal débil, solo desempata. El número de caracteres de máscara no
   es fiable: la misma cuenta aparece como `*****9558` (9) y `******9558` (10).

Resolución sobre las observaciones ya ligadas del usuario:

| Situación | Resultado |
|---|---|
| Coincidencia exacta de `raw` con una observación resuelta | Reusa su vínculo. **Cada máscara se aprende una vez** |
| Exactamente un candidato compatible y sufijo ≥ 4 dígitos | `EXACT`, se liga solo |
| Exactamente un candidato compatible y sufijo < 4 dígitos | `INFERRED`, se liga y queda listado en conciliación |
| Más de un candidato, o ninguno | `PENDING`, no se liga y no toca ningún saldo |

### 5.3 El guard de prefijo no es opcional

Sin la regla 2, `25XXX61` —una cuenta de 7 caracteres de la cooperativa— emparejaría con
`8361`, que es una Mastercard de 16 dígitos, porque `61` es sufijo de `8361` y es el único
candidato. El prefijo `25` contra el `542258` de la tarjeta es lo que lo descarta: `542258`
no empieza por `25`. Son **8 ocurrencias** que la contención de sufijo sola habría ligado mal.

Del mismo modo, el prefijo es lo que **salva** los casos de Banco Pacífico, donde la máscara
conserva los primeros dígitos: `13XXXXXX14` liga con `0814`, `10XXXXXX11` con `9511`,
`77XXXXXX19` con `1419`, `22XXXXXX82` con `1582`. La regla anterior los descartaba a todos.

### 5.4 Efecto medido sobre la base actual

De las **288 ocurrencias** con menos de 4 dígitos finales —las que un canónico de 4 dígitos
descartaba por completo:

| Resultado | Ocurrencias | Detalle |
|---|---|---|
| Se ligan solas | ~250 | Candidato único y compatible |
| Ambiguas | 13 | `22XXXXXX58` y `28XXX58` (3 candidatos: `9558`, `4058`, `2204339558`); `40XXXXXXXX00` (2: `0100`, `3700`) |
| Sin candidato | 17 | 9 grupos, casi todos contrapartes vistas una o dos veces |
| Rechazadas por el guard | 8 | `25XXX61` |

Las 449 ocurrencias con 4 dígitos o más siguen ligando en `EXACT` como antes.

### 5.5 Nunca se rellenan dígitos

Prefijo y sufijo se guardan en campos separados justamente para que no se puedan confundir.
Una normalización que borrara los no-dígitos convertiría `25XXX10` en `2510` —un número que
no existe, indistinguible de uno real y con saldo propio. Son **157 ocurrencias** con máscara
de prefijo en la base actual. Con la huella, `25XXX10` es `prefix=25, suffix=10, len=7` y eso
es todo lo que se afirma de él.

### 5.6 Cómo se muestra

`formatBankNumber(entity)` vive en la capa de presentación y decide por **tipo de entidad**,
no por el largo del número —una tarjeta sin BIN conocido sigue siendo tarjeta.

| Entidad | Formato | Ejemplo |
|---|---|---|
| Tarjeta de crédito o débito | `XXXX` + 4 últimos | `XXXX2780` |
| Cuenta corriente o de ahorros | `••••` + 4 últimos | `••••0814` |
| Cuenta con solo prefijo y sufijo | prefijo + 4 puntos + sufijo | `22••••58` |

Cuatro caracteres de máscara en ambos casos: lo que distingue es el glifo, no el largo.

El bloque de letras contra los puntos distingue tarjeta de cuenta sin leer la etiqueta. El
nombre que puso el usuario manda sobre el número, que es la línea secundaria.

La cadena cruda nunca sale de la pantalla de conciliación, y nada de esto toca lo guardado:
`last_four` y `prefix_digits` son dígitos pelados.

### 5.7 Qué se conserva crudo

`financial_scanner_transactions.accounts` **no se modifica**: es la evidencia del origen,
igual que `origin_stats` conserva el correo entero. Y `bank_number_observations.raw` guarda
cada cadena íntegra. Si las reglas de compatibilidad mejoran después, todo el emparejamiento
se puede recalcular desde cero sin haber perdido nada.

El workflow de n8n no necesita cambiar: parsear es responsabilidad del borde de entrada de
kyber-life, que además atiende la captura manual, no solo el escaneo.

### 5.8 Cuentas propias y ajenas

No toda cuenta detectada es del usuario. `XXXXXX6655` es la cuenta de Hair Craft Studio, el
destino de un pago; crear una `bank_accounts` para ella sería inventar patrimonio ajeno.

**Regla:** una cuenta detectada se vuelve fila propia solo si aparece como `origen` al menos
una vez —solo se puede enviar dinero desde una cuenta propia. Las que solo aparecen como
`destino` se guardan en `bank_counterparty_account` sobre la transacción y llegan a
conciliación marcadas «ajena» por defecto. El usuario puede invertir la marca: una
transferencia entre dos cuentas propias tiene ambos lados suyos.

## 6. Vista `bank_movements`

Explota cada transacción en líneas de libro mayor. Sin tabla física.

```sql
create view bank_movements as
  -- salida de la cuenta origen
  select t.id as transaction_id, t.owner_user_id, t.date,
         t.bank_source_account_id as account_id, null::uuid as card_id,
         'OUT' as direction, t.amount, t.currency,
         t.description, t.merchant, t.category_id
    from financial_transactions t
   where t.bank_source_account_id is not null
     and t.status not in ('REJECTED', 'DELETED', 'DUPLICATE')
  union all
  -- entrada a la cuenta destino
  select t.id, t.owner_user_id, t.date,
         t.bank_destination_account_id, null::uuid,
         'IN', t.amount, t.currency, t.description, t.merchant, t.category_id
    from financial_transactions t
   where t.bank_destination_account_id is not null
     and t.status not in ('REJECTED', 'DELETED', 'DUPLICATE')
  union all
  -- consumo con tarjeta de crédito
  select t.id, t.owner_user_id, t.date,
         null::uuid, t.bank_card_id,
         'CHARGE', t.amount, t.currency, t.description, t.merchant, t.category_id
    from financial_transactions t
    join bank_cards c on c.id = t.bank_card_id
   where c.card_type = 'CREDIT' and t.paid_with_credit = true
     and t.status not in ('REJECTED', 'DELETED', 'DUPLICATE')
  union all
  -- pago de la tarjeta
  select t.id, t.owner_user_id, t.date,
         null::uuid, s.card_id,
         'PAYMENT', t.amount, t.currency, t.description, t.merchant, t.category_id
    from financial_transactions t
    join bank_card_statements s on s.id = t.bank_card_statement_id
   where t.status not in ('REJECTED', 'DELETED', 'DUPLICATE');
```

### 6.1 Las seis reglas de escritura

| Caso | Columnas que pone el servicio | Líneas que emite la vista |
|---|---|---|
| Gasto con débito | `bank_source_account_id` + `bank_card_id` (DEBIT) | `OUT` en la cuenta atada |
| Ingreso | `bank_destination_account_id` | `IN` en la cuenta |
| Transferencia entre cuentas propias | origen + destino | `OUT` origen y `IN` destino |
| Retiro en cajero | origen = cuenta del banco, destino = cuenta `CASH` | `OUT` banco y `IN` efectivo → neto cero |
| Consumo con tarjeta de crédito | `bank_card_id` (CREDIT) + `paid_with_credit = true` | `CHARGE` en la tarjeta, ninguna cuenta |
| Pago de la tarjeta | `bank_card_statement_id` + `bank_source_account_id` | `OUT` en la cuenta y `PAYMENT` en la tarjeta |

La última regla es la que evita el doble conteo. **`computeNetBalance` no cambia**: ya difiere
los gastos `paidWithCredit`, y el pago de la tarjeta entra como gasto real una sola vez cuando
ocurre.

## 7. Saldos y deuda

Funciones puras en `src/domain/services/bank-balance.ts`, espejo de
`src/domain/services/financial-balance.ts`.

```
saldo_cuenta     = snapshot más reciente con as_of <= now
                   + Σ IN − Σ OUT  sobre movimientos con date > as_of
deuda_tarjeta    = Σ CHARGE − Σ PAYMENT   (histórico completo)
deuda_periodo    = statement OPEN: coalesce(total_amount, computed_amount) − paid_amount
cupo_disponible  = credit_limit − deuda_tarjeta
```

Las cuentas y tarjetas con `is_unconfirmed = true` quedan **fuera** de todo agregado hasta
que se confirmen.

El saldo corrido que muestra el detalle de cuenta se calcula hacia atrás desde el saldo
actual; no se guarda.

## 8. Auto-creación en el flujo de captura

Se mantiene el contrato que ya existe: crear una transacción crea lo que falte. Al crear
—desde el wizard, la captura por voz, el inbox de escaneos o la edición manual— en cascada:

1. **Comercio** → `financial_institutions` si no existe. *Sin cambios respecto a hoy.*
2. **Banco** → `bank_institutions` si no existe, con `financial_institution_id` apuntando al
   gemelo comercio (creándolo si hiciera falta).
3. **Número** → parsear a huella, registrar la observación (o incrementar `occurrences` si el
   `raw` ya se vio) y resolver según la tabla de la sección 5.2. Si resuelve a nada y no es
   ambigua, crear `bank_accounts` o `bank_cards` con `is_unconfirmed = true`.
4. **Atar** la transacción a origen, destino y/o tarjeta según las reglas de la sección 6.1.

Heurísticas de clasificación, en `src/lib/bank-number-fingerprint.ts`:

- `accountTypeHint` `AHO` → `SAVINGS`. `CTE` → `CHECKING`.
- Hay BIN de 6 dígitos → es tarjeta. `493176` Visa, `542258` Mastercard.
- `institutionHint` o el `merchant` del escaneo sugieren el banco cuando coinciden con una
  institución conocida.

El paso 3 es el que mejora con el uso: la primera vez que aparece una máscara nueva se
resuelve —sola o en conciliación— y a partir de ahí el match de `raw` es directo.

## 9. Backfill y conciliación

### 9.1 De dónde sale la data

- Join por `(origin_stats->>'originalExecutionId', amount)` contra
  `financial_scanner_transactions`: **274 de 384** transacciones, **257** con datos de cuenta.
- Las 110 restantes se resuelven con regex sobre `origin_stats->>'emailBody'`, que conserva
  el correo crudo del banco.

### 9.2 La migración

Puebla `bank_number_observations` con las 94 cadenas crudas distintas y sus huellas, corre el
emparejamiento de la sección 5.2, y crea `bank_accounts` y `bank_cards` con
`is_unconfirmed = true` para los grupos resueltos. No re-apunta ninguna transacción todavía.

### 9.3 La pantalla

`/financial/banks/reconcile` muestra un grupo por identidad candidata: sus observaciones
crudas, el conteo de transacciones, el banco sugerido, y si aparece como origen. Por grupo:
crear cuenta, fusionar con una existente, o marcar como ajena.

Tres secciones, en orden de esfuerzo:

1. **Resueltas** (`EXACT`) — solo falta nombrarlas y confirmar el tipo.
2. **Inferidas** (`INFERRED`) — resueltas por sufijo corto sin ambigüedad. Se muestran con la
   evidencia que las ligó, para aceptar en bloque o separar.
3. **Pendientes** (`PENDING`) — las 3 ambiguas con sus candidatos lado a lado, y las 9 sin
   candidato.

Al confirmar, se re-apuntan las transacciones del grupo en bloque y se quita
`is_unconfirmed`. Nada entra a ningún saldo antes de ese momento.

## 10. Arquitectura

Sigue la Clean Architecture del repo. Dirección de dependencias sin cambios.

```
src/domain/entities/bank.ts
    BankInstitution · BankAccount · BankCard
    BankAccountBalanceSnapshot · BankCardStatement · BankMovement
src/domain/repositories/bank.ts
    IBankInstitutionRepository · IBankAccountRepository · IBankCardRepository
    IBankAccountBalanceSnapshotRepository · IBankCardStatementRepository
    IBankMovementRepository  (solo lectura, sobre la vista)
src/domain/services/bank-balance.ts        cálculos puros
src/application/services/bank-service.ts   orquestación
src/application/services/bank-reconciliation-service.ts
src/infrastructure/repositories/supabase/bank-*.ts
src/infrastructure/repositories/implementations.ts   (in-memory, para MOCK/MEMORY)
src/infrastructure/container.ts            cableado
src/app/actions/bank.ts                    server actions
src/lib/validators/bank-schemas.ts         Zod
src/lib/bank-number-fingerprint.ts         parseo de cadena cruda a huella
src/lib/bank-number-match.ts               compatibilidad y resolución
src/presentation/bank/components/
supabase/migrations/20260812120000_bank_module_init.sql
```

Las server actions siguen el patrón establecido: validar con Zod, resolver el usuario con
`requireUserId()`, llamar al servicio del container, devolver `{ success, data }` o
`{ success, error }` sin lanzar al cliente.

## 11. UI y navegación

`MENU_ITEMS` en `src/config/menu-items.ts`, sección Finanzas, entre Escaneos y Configuración:

```ts
{ label: "Bancos", icon: Landmark, href: "/financial/banks" }
```

| Ruta | Contenido |
|---|---|
| `/financial/banks` | Total disponible, deuda de tarjetas, cupo libre, efectivo, próximo pago. Cuentas y tarjetas agrupadas por emisor |
| `/financial/banks/accounts/[id]` | Saldo, panel de conciliación con las tres cifras, movimientos con saldo corrido |
| `/financial/banks/cards/[id]` | Deuda, cupo usado, estado de cuenta del período con calculado vs declarado, consumos, historial |
| `/financial/banks/reconcile` | Conciliación del historial |

Cambios en pantallas existentes:

- `/financial/settings` pierde la pestaña Cuentas. `InstitutionManager` no cambia de código;
  a partir de ahora solo gestiona comercios.
- `PaymentStep.tsx` del wizard gana un selector de cuenta o tarjeta. El toggle
  «pagado con crédito» pasa a derivarse del `card_type` de lo seleccionado en vez de ser una
  pregunta suelta.
- El dashboard financiero no cambia. El saldo por cuenta es un cálculo nuevo al lado, no un
  reemplazo del balance global.

Diseño mobile-first obligatorio, preservando la estética del módulo financiero
(`BalanceHeroCard` como referencia de los paneles de saldo).

## 12. Testing

Jest, siguiendo la separación que ya usa el repo.

- `__tests__/lib/bank-number-fingerprint.test.ts` — parseo. **Fixtures: las 94 cadenas crudas
  reales extraídas de la base**, incluidas las trampas (`25XXX10`, `10XXXXXX11`, `620`,
  `MASTERCARD`, `5422-58XX-XXXX-X361`, `CoopJardínAzuayo***5010`).
- `__tests__/lib/bank-number-match.test.ts` — compatibilidad. Casos obligatorios:
  `361` liga con `8361`; `620` liga con `9620`; `13XXXXXX14` liga con `0814`;
  **`25XXX61` NO liga con `8361`** (guard de prefijo);
  `22XXXXXX58` queda `PENDING` por tener tres candidatos;
  y `25XXX10` nunca produce el número `2510`.
- `__tests__/domain/bank-balance.test.ts` — saldo con y sin snapshot, deuda, cupo, exclusión
  de `is_unconfirmed`, neutralidad del retiro.
- `__tests__/services/bank-service.test.ts` — cascada de auto-creación, con
  `jest.unit.config.js`.
- `__tests__/services/bank-reconciliation-service.test.ts` — agrupación, propia vs ajena,
  re-apuntado en bloque.
- `__tests__/integration/bank-movements.test.ts` — las seis reglas de la sección 6.1, cada
  caso verificando las líneas emitidas.

## 13. Fuera de alcance

Multi-moneda con conversión, préstamos y amortizaciones, proyección de flujo de caja, diferido
de tarjeta (meses sin intereses), sección de menú propia fuera de Finanzas, alertas push de
vencimiento de pago, importación de estados de cuenta en PDF.

## 14. Riesgos

- **El cierre perezoso deja el statement desactualizado hasta que alguien mire la tarjeta.**
  Es aceptable para saldos que se consultan, pero descarta —por ahora— cualquier alerta de
  vencimiento, que necesitaría un disparador real. Ya está fuera de alcance por eso.
- **Las observaciones `INFERRED` cuentan hacia los saldos antes de que el usuario las
  revise.** Es una apuesta deliberada: el candidato es único y compatible en las cuatro
  dimensiones. El costo de equivocarse es un saldo desviado hasta que se corrija en
  conciliación; el costo de no apostar es dejar ~250 movimientos fuera. La mitigación es que
  el detalle de cuenta muestra cuántos de sus movimientos son inferidos.
- **Solo 30 ocurrencias quedan realmente fuera** (13 ambiguas, 17 sin candidato). El saldo
  seguirá necesitando el primer corte manual por cuenta para ser exacto.
- **Eliminar `financial_accounts` toca el container y los tests existentes** que la mockean,
  aunque la tabla esté vacía.
