# Análisis de rendimiento — Carga de los Dashboards

> Análisis de la cadena de carga (cliente → server actions → servicios → repositorios → Postgres) de `/financial`, `/dashboard` y `/financial/transactions`.

## 0. Verificación contra la base real (actualización)

El análisis original se hizo de forma estática, sobre el código y las migraciones del repo. Al contrastarlo después con el proyecto real, **dos supuestos cambiaron** y conviene leer el resto del documento con esto en mente:

| Supuesto original | Realidad medida |
|---|---|
| Faltaba el índice `(owner_user_id, date DESC)` | **Ya existía** en la base (`idx_financial_transactions_owner_date`), igual que otros índices ausentes de las migraciones del repo. El esquema vivo ha derivado del versionado. |
| El volumen hacía costosas las lecturas completas | **301 transacciones (736 kB)** y 508 del escáner. A ese tamaño Postgres resuelve cualquiera de estas consultas de forma trivial. |

**Conclusión revisada:** a día de hoy el cuello de botella **no es la base de datos** sino el **número de round-trips** (B3) y, en menor medida, el volumen de datos serializados por respuesta (B1/B2). La Fase 2 (una sola acción y una sola lectura) es la que produce la mejora perceptible; la Fase 1 quedó reducida a los índices realmente ausentes (dos FK sin indexar y el compuesto del escáner), valiosos como higiene y de cara al crecimiento, no como ganancia inmediata.

Los cuellos de botella B1/B2 siguen siendo correctos como **problema de diseño** —el coste crece sin techo con el historial—, pero su impacto *actual* es pequeño.

---

## 1. Resumen ejecutivo

La lentitud no viene de un punto único, sino de tres factores que se multiplican entre sí:

| # | Cuello de botella | Impacto | Esfuerzo |
|---|---|---|---|
| **B1** | Cada bloque del dashboard **relee el historial completo** de transacciones (6 veces por carga) | 🔴 Muy alto | Medio |
| **B2** | El filtrado por fecha/estado ocurre **en Node, no en SQL** | 🔴 Muy alto | Bajo |
| **B3** | **6 server actions** por carga (cada una es un request HTTP con su propio auth) | 🟠 Alto | Bajo |
| **B4** | Falta el índice compuesto `(owner_user_id, date DESC)` y los de FK | 🟠 Alto | Muy bajo |
| **B5** | Sin caché ni agregación: el polling repite todo cada 60 s | 🟡 Medio | Bajo |

**El cambio de mayor impacto/esfuerzo** es unificar el fan-out en una sola acción que lea las transacciones **una vez** y filtre en SQL (B1+B2+B3 juntos). Los índices (B4) son ~15 minutos de trabajo y benefician a toda la app.

---

## 2. Cuellos de botella detallados

### B1 — N lecturas completas de la misma tabla por carga

`FinancialDashboardService` resuelve cada bloque de forma independiente, y **cada uno abre su propia lectura del historial completo**:

```ts
// financial-dashboard-service.ts — se repite en 6 métodos
async getKPIs(userId, startDate, endDate) {
    const transactions = await this.transactionRepo.findByOwnerId(userId); // ← TODO el historial
    const confirmed = this.filterActive(transactions, startDate, endDate); // ← filtra en memoria
```

Una carga de `/financial` dispara:

| Server action | Lecturas SQL que provoca |
|---|---|
| `getFinancialKPIsAction` | transacciones (todas) + scanner pendientes + categorías |
| `getMonthlyBreakdownAction` | transacciones (todas) |
| `getTypeBreakdownAction` | transacciones (todas) |
| `getCategoryBreakdownAction` | transacciones (todas) + categorías |
| `getInstitutionBreakdownAction` | transacciones (todas) + instituciones |
| `getDailyBreakdownAction` | transacciones (todas) |

> **6 lecturas completas de `financial_transactions`**, + 2 de categorías, + 1 de instituciones, + 1 de scanner — **por cada carga y por cada cambio de filtro**.

`/dashboard` (hub) repite el patrón a menor escala: 3 lecturas completas (KPIs, daily, categories) + 2 de mercado.

### B2 — El filtro de rango y estado no llega a Postgres

```ts
async findByOwnerId(userId: UUID): Promise<FinancialTransaction[]> {
    return supabase.from('financial_transactions')
        .select('*')                       // ← todas las columnas
        .eq('owner_user_id', userId)       // ← sin rango de fechas
        .order('date', { ascending: false }); // ← sin límite
}
```

El rango ("22 jun – 21 jul") y el estado (`CONFIRMED`/`REVIEWED`/`MANUAL`) se aplican **después**, en `filterActive()`. Consecuencias:

- Para pintar **30 días** se transfiere **todo el histórico** del usuario, con todas las columnas (incluidos `origin_stats` JSONB y `notes`, que el dashboard no usa).
- El coste crece de forma lineal e ilimitada con la antigüedad de la cuenta: un usuario con 3 años de datos paga 36× lo que necesita.
- **Riesgo de correctitud a vigilar:** PostgREST puede aplicar un tope de filas por respuesta (`max-rows`). Si está configurado, los KPIs se calcularían sobre datos **truncados en silencio**. Conviene verificar el valor efectivo en el proyecto Supabase.

El repositorio **ya sabe filtrar en SQL** (`applyFilters` de `findPaginated` cubre fechas, tipos, categoría, institución, montos). El dashboard simplemente no lo usa.

### B3 — Fan-out de server actions

`useFinancialDashboard` lanza 6 acciones; `useHomeDashboard` lanza 5 (3 + 2). Cada server action es **un request HTTP independiente**, con su propio `auth.getUser()` y evaluación de RLS.

Dos efectos:

1. **Latencia acumulada:** Next.js encola las server actions de un mismo cliente, así que un `Promise.all` de 6 no se solapa como se espera; las latencias tienden a sumarse en lugar de superponerse.
2. **Riesgo de refresh de token concurrente:** es exactamente el fallo que ya se corrigió en los formularios de transacción (PR #88). `React.cache` memoiza `getAuthUser` **por request**, no entre requests, así que con el access token expirado varias acciones intentan refrescar a la vez y Supabase **rota (un solo uso)** el refresh token → las perdedoras fallan. En los dashboards esto se manifiesta como bloques vacíos o en 0.

### B4 — Índices ausentes para el patrón de acceso real

Índices actuales sobre `financial_transactions`:

```sql
idx_financial_transactions_owner     ON (owner_user_id)
idx_financial_transactions_date      ON (date DESC)
idx_financial_transactions_status    ON (status)
idx_financial_transactions_merchant  GIN (to_tsvector(merchant))
```

El patrón real de todas las consultas es `WHERE owner_user_id = ? [AND date BETWEEN ? AND ?] ORDER BY date DESC`. Con índices de una sola columna, Postgres filtra por `owner_user_id` y **ordena después**. Falta:

- **`(owner_user_id, date DESC)`** — elimina el sort y permite *range scan* directo por fecha. Es el índice más rentable de toda la app.
- **`category_id`** e **`institution_id`** — no tienen índice pese a ser FK usadas por los breakdowns, por los filtros de la lista y por las funciones de conteo/reasignación/fusión (PR #83, #85).
- Índice **parcial** por estado activo, que es el 100 % de lo que lee el dashboard:
  `(owner_user_id, date DESC) WHERE status IN ('CONFIRMED','REVIEWED','MANUAL')`.
- En `financial_scanner_transactions`: `(owner_user_id, date)` y `execution_id` (usados por los conteos por día del escáner).

### B5 — Sin caché, y el polling multiplica todo

- Las acciones de dashboard **no cachean** (ni `unstable_cache` ni memoización por request): dos bloques que necesitan las mismas transacciones las piden dos veces.
- El *fallback* de polling refresca **cada 60 s** (`NEXT_PUBLIC_FINANCIAL_POLLING_INTERVAL_MS`) llamando a `refresh()`, es decir **el fan-out completo otra vez** — también con la pestaña en segundo plano.
- Categorías e instituciones se releen en cada bloque aunque cambian rarísima vez.

### B6 — Derroches puntuales

| Punto | Problema |
|---|---|
| `getRecentTransactions` | Pide **1000** filas (`findRecent(userId, 1000)`) para devolver 5. |
| `/financial/transactions` | Además de la página paginada, `searchAllFilteredTransactionsAction` trae **todas** las transacciones del rango para el "Resumen visual". |
| `select('*')` | Se traen columnas pesadas que el dashboard no usa (`origin_stats` JSONB, `notes`, `tags`). |

---

## 3. Optimizaciones propuestas

### P1 — Una acción agregadora con una sola lectura (impacto máximo)

Unificar los 6 bloques en `getDashboardOverviewAction(startDate, endDate)` que:

1. Resuelva el usuario **una vez** (elimina B3 y el riesgo de refresh concurrente).
2. Lea las transacciones del rango **una sola vez**.
3. Derive los 6 bloques en memoria a partir de ese único conjunto.

Ya existe el precedente exacto en el repo: `getTransactionFormOptionsAction` (PR #88).

> **6 requests + 6 lecturas completas → 1 request + 1 lectura acotada.**

### P2 — Empujar el filtro a SQL

Añadir rango y estado a la lectura del dashboard (reutilizando `applyFilters`, que ya existe):

```ts
findForDashboard(userId, { startDate, endDate, statuses: ACTIVE_STATUSES })
```

y seleccionar solo las columnas necesarias (`date, type, amount, currency, category_id, institution_id, paid_with_credit, status`) en vez de `select('*')`.

### P3 — Índices (rápido y transversal)

```sql
-- Patrón real: filtrar por dueño + rango de fechas, ordenado por fecha
CREATE INDEX CONCURRENTLY idx_ft_owner_date
    ON financial_transactions (owner_user_id, date DESC);

-- Solo lo que el dashboard consulta (índice parcial, más pequeño y rápido)
CREATE INDEX CONCURRENTLY idx_ft_owner_date_active
    ON financial_transactions (owner_user_id, date DESC)
    WHERE status IN ('CONFIRMED', 'REVIEWED', 'MANUAL');

-- FK usadas por breakdowns, filtros, conteos y fusiones
CREATE INDEX CONCURRENTLY idx_ft_category ON financial_transactions (category_id);
CREATE INDEX CONCURRENTLY idx_ft_institution ON financial_transactions (institution_id);

-- Conteos por día del escáner
CREATE INDEX CONCURRENTLY idx_fst_owner_date ON financial_scanner_transactions (owner_user_id, date);
CREATE INDEX CONCURRENTLY idx_fst_execution ON financial_scanner_transactions (execution_id);
```

`CONCURRENTLY` evita bloquear escrituras (requiere ejecutarlo fuera de una transacción; si la herramienta de migración envuelve todo en una, omitirlo dado el tamaño actual de las tablas).

### P4 — Agregar en Postgres (mayor impacto con históricos grandes)

Un RPC que devuelva los agregados ya calculados — el proyecto ya usa este patrón en `get_unique_financial_tags`:

```sql
CREATE OR REPLACE FUNCTION get_financial_dashboard(
  p_user_id uuid, p_start timestamptz, p_end timestamptz
) RETURNS jsonb ...
```

Con esto se transfieren **decenas de filas agregadas** en vez de miles de filas crudas, y la agregación la hace el motor (que para eso está). Es la opción con mejor escalado, aunque mueve lógica de negocio a SQL: conviene mantener los cálculos de dominio (`computeNetBalance`, buckets de crédito) como fuente de verdad y cubrir el RPC con tests.

### P5 — Caché e invalidación

- Cachear por `(userId, rango)` con `unstable_cache` + `revalidateTag` en las mutaciones de transacciones.
- Categorías/instituciones: caché más larga (cambian rara vez).
- Pausar el polling con la pestaña oculta (`document.visibilityState`) y subir el intervalo cuando Realtime está activo.

### P6 — Ajustes puntuales

- `getRecentTransactions`: aplicar `limit` real en SQL en vez de traer 1000 filas.
- "Resumen visual" de la lista: alimentarlo con agregados en vez de con todas las transacciones del rango.
- Evitar `select('*')` en las rutas de lectura masiva.

---

## 4. Orden de implementación sugerido

| Fase | Acción | Riesgo | Beneficio esperado |
|---|---|---|---|
| **1** | P3 (índices) | Muy bajo | Mejora inmediata y transversal |
| **2** | P1 + P2 (acción agregadora + filtro en SQL) | Bajo | El grueso de la mejora percibida |
| **3** | P6 (derroches puntuales) | Muy bajo | Menos datos en vuelo |
| **4** | P5 (caché y polling) | Medio | Menos carga recurrente |
| **5** | P4 (RPC de agregación) | Medio-alto | Escalado a largo plazo |

Las fases 1 y 2 deberían resolver la mayor parte del problema; conviene medir antes de abordar la 4.

---

## 5. Qué medir para confirmar

Este análisis es estático. Para validarlo con datos:

1. **`EXPLAIN (ANALYZE, BUFFERS)`** sobre la query del dashboard, antes y después de los índices.
2. **Supabase → Reports / `pg_stat_statements`**: qué consultas dominan el tiempo total.
3. **`get_advisors`** (Supabase) para índices faltantes o FK sin indexar.
4. **Waterfall del navegador** en `/financial`: confirmar si las 6 server actions se solapan o se encolan.
5. **Volumen real**: `SELECT count(*) FROM financial_transactions WHERE owner_user_id = ...` — define cuánto duele B1/B2.
6. **Verificar `max-rows`** efectivo de PostgREST (riesgo de truncado silencioso descrito en B2).
