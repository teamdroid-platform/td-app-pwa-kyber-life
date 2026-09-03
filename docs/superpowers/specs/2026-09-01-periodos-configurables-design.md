# Periodos configurables — diseño

**Fecha:** 2026-09-01
**Estado:** pendiente de revisión del usuario
**Proyecto Supabase:** KyberLife (`xywkuwmhnfcdksamuypk`, us-east-2)

---

## 1. Problema

El rango de fechas precargado en toda pantalla con filtro va del 22 de un mes al 21 del
siguiente. Ese ciclo está escrito a mano en `defaultHubCustomRange()`
(`src/lib/date-range.ts`), una función pura, síncrona y sin noción de usuario:

```ts
const anchorMonth = reference.getDate() >= 22 ? reference.getMonth() : reference.getMonth() - 1;
const start = new Date(reference.getFullYear(), anchorMonth, 22);
const end = new Date(reference.getFullYear(), anchorMonth + 1, 21);
```

El 22 corresponde a la fecha de cobro de una persona concreta. Para cualquier otra el rango por
defecto es arbitrario, y no hay forma de cambiarlo salvo editar las fechas a mano en cada
pantalla, cada vez.

Y no es el único mes escrito a mano. Hay tres definiciones más de "mes", en tres archivos, con
dos semánticas distintas:

| Punto | Qué calcula | Tipo | Ruta |
|---|---|---|---|
| `FinancialDashboard.tsx:53` | ciclo 22→21 precargado en "Personalizado" | cliente | `/financial` |
| `FinancialDashboard.tsx:92` | preset "Mes" = día 1 → **hoy** | cliente | `/financial` |
| `TransactionFilters.tsx:47` | preset "Mes" = día 1 → **hoy** | cliente | `/financial/transactions` |
| `TransactionFilters.tsx:67` | ciclo 22→21 precargado | cliente | `/financial/transactions` |
| `transactions/page.tsx:54` | ciclo 22→21 por defecto | servidor | `/financial/transactions` |
| `MarketDateFilterBar.tsx:33` | preset "Mes" = día 1 → **último día del mes** | cliente | `/market/analytics` |
| `MarketDateFilterBar.tsx:97,150` | ciclo 22→21 al elegir "Personalizado" | cliente | `/market/analytics` |
| `dashboard/page.tsx:47` | `periods()` — mes actual y anterior para el KPI comparativo | servidor | `/dashboard` |

Cada punto vive bajo exactamente un layout, sin solapes.

Dos observaciones que condicionan el diseño y que conviene dejar escritas:

- **El preset "Mes" no significa lo mismo en los dos módulos.** En Finanzas es *lo que llevo*
  (día 1 → hoy); en Compras es *el mes entero* (día 1 → último día). La diferencia es
  deliberada en la práctica —una mide consumo acumulado, la otra analiza un periodo cerrado—
  aunque nunca se documentó.
- **`computeDateRange()` es código muerto en `src/`.** Solo la importan los tests; ningún
  componente la usa. Las dos ramas `"month"` reales son las copias inline de arriba.

## 2. Alcance

El día en que empieza el mes pasa a ser una preferencia del usuario, persistida, con dos
valores independientes: uno para Finanzas y otro para Compras. Cuando hay preferencia, todo
rango por defecto, el preset "Mes" y el KPI comparativo del tablero salen de ella.

**Fuera de alcance:**

- Ciclos con nombre que el usuario pueda crear y elegir; un ciclo por banco o por tarjeta;
  ciclos que no sean mensuales (quincenales, semanales).
- Recordar el último rango que el usuario escribió a mano.
- **La agrupación mensual de las gráficas.** `TransactionSummary.tsx:156` y
  `financial-dashboard-service.ts:286` agrupan transacciones en cubos por mes calendario para
  el eje de una gráfica. Eso es una etiqueta de agrupación, no un rango de consulta, y seguirá
  siendo mes calendario.
- **Los presets "Hoy" y "Semana".** No dependen del día de corte. Sus implementaciones también
  están duplicadas y difieren entre módulos (la semana de Compras es lunes→domingo completo, la
  de Finanzas es lunes→hoy), pero unificarlas cambiaría comportamiento sin relación con este
  trabajo.

## 3. Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Cómo se define un ciclo? | Solo el día de inicio, entero de 1 a 31. El fin se deriva: víspera del ancla siguiente. |
| ¿Por qué no guardar también el día de fin? | Dos campos admiten huecos (5→25 deja fuera del 26 al 4) y solapes. Con uno solo son imposibles por construcción. |
| ¿Cómo se expresa el mes natural? | Día de inicio 1. El fin sale 28, 29, 30 o 31 según el mes real, sin caso especial. |
| ¿Y si el día no existe en ese mes? | Se recorta al último día disponible: día 31 en febrero ancla el 28. |
| ¿Cuántos ciclos por usuario? | Dos, uno por ámbito: `FINANCIAL` y `MARKET`. Independientes. |
| Defecto de Finanzas | 22 — el ciclo que la app usa hoy. |
| Defecto de Compras | 1 — mes natural, que es lo que su preset "Mes" ya hace hoy. |
| ¿Market hereda de Finanzas? | No. La pantalla de Compras muestra el ciclo financiero solo como referencia informativa. |
| ¿Qué es el preset "Mes"? | Cada módulo conserva su semántica actual, con el día configurable: Finanzas *ciclo → hoy*, Compras *ciclo completo*. |
| ¿Qué es "Personalizado"? | El ciclo completo que contiene hoy, en los dos módulos. Solo cambia su valor precargado. |
| ¿El tablero de inicio? | Entra. `periods()` compara el ciclo que contiene hoy contra el ciclo anterior, con el día de `FINANCIAL`. |
| ¿Dónde se configura? | Pestaña "Periodos" en `/financial/settings` y otra en `/market/settings`. Cada módulo gestiona el suyo. |
| ¿Cómo llega el valor al cliente? | Un React Context montado en `financial/layout.tsx` y `market/layout.tsx`, que ya son server components async y ya resuelven el usuario. |
| ¿Se guarda el valor por defecto en la base? | No. Sin fila, el código aplica el defecto del ámbito. Una fila significa "el usuario lo cambió". |
| ¿Qué pasa con `computeDateRange()`? | Se elimina. Está muerta, y resucitarla sería una tercera copia de una lógica que ya está duplicada. |

### Por qué el defecto vive en código y no en el esquema

El valor por defecto depende del ámbito (22 en Finanzas, 1 en Compras), así que una cláusula
`DEFAULT` en la columna tendría que ser la misma para los dos. Dejarlo en un `Record` de
TypeScript mantiene la regla en un solo sitio legible, y añadir un tercer ámbito mañana es una
entrada más en ese `Record` sin tocar el esquema.

### Cambios visibles para un usuario que no configure nada

Cuatro, y ninguno afecta a datos: solo al rango que cada pantalla trae puesto al abrirse.

| Pantalla | Antes | Después (con los defectos 22 y 1) |
|---|---|---|
| `/financial`, preset "Mes" | 1 sep – hoy | 22 ago – hoy |
| `/financial/transactions`, preset "Mes" | 1 sep – hoy | 22 ago – hoy |
| `/dashboard`, KPI comparativo | 1–30 sep contra 1–31 ago | 22 ago – 21 sep contra 22 jul – 21 ago |
| `/market/analytics`, "Personalizado" | 22 ago – 21 sep | 1 sep – 30 sep |

Los tres primeros son consecuencia directa de aplicar el ciclo financiero donde antes había mes
calendario. El cuarto corrige una incoherencia que ya existía: esa pantalla precargaba un
ciclo 22→21 heredado de Finanzas mientras su propio preset "Mes" usaba el mes natural.

Lo que **no** cambia es el preset "Mes" de Compras: ya es día 1 → último día, y
`cycleRangeContaining(1)` produce exactamente eso.

## 4. Modelo de datos

Una tabla, hasta dos filas por usuario. Mismo patrón que `financial_balance_settings`: solo se
persiste lo que el usuario cambió.

```sql
-- supabase/migrations/20260901120000_period_settings.sql
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

El prefijo es `user_` y no `financial_` porque la tabla también manda en `/market`.

Tipos de dominio, en `src/domain/entities/period.ts`:

```ts
import { UUID } from "../core";

/** Los ámbitos que tienen ciclo propio. */
export type PeriodScope = 'FINANCIAL' | 'MARKET';

export const PERIOD_SCOPES: readonly PeriodScope[] = ['FINANCIAL', 'MARKET'] as const;

/**
 * El día de corte que se aplica mientras el usuario no guarde otro.
 * Finanzas conserva el 22 que la app usa hoy; Compras arranca en mes natural,
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

## 5. Matemática del ciclo

Vive en `src/lib/date-range.ts`, junto al resto del cálculo de rangos, para no abrir un segundo
hogar a la misma responsabilidad. Todo son funciones puras: reciben el día y la fecha de
referencia, no leen nada.

```ts
/** Días que tiene un mes. `month` puede desbordar: Date lo normaliza. */
function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/** El día de corte, recortado al último día real del mes: 31 en febrero → 28. */
function anchorDay(year: number, month: number, startDay: number): number {
    return Math.min(startDay, daysInMonth(year, month));
}

/**
 * Ciclo que contiene `reference`. El fin es la víspera del ancla siguiente, así
 * que dos ciclos consecutivos nunca dejan hueco ni se solapan.
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

/** El ciclo inmediatamente anterior al que contiene `reference` — el KPI comparativo. */
export function cyclePreviousRange(
    startDay: number,
    reference: Date = zonedNow(),
): { start: string; end: string } {
    const current = cycleRangeContaining(startDay, reference);
    const dayBeforeCurrent = new Date(`${current.start}T00:00:00`);
    dayBeforeCurrent.setDate(dayBeforeCurrent.getDate() - 1);
    return cycleRangeContaining(startDay, dayBeforeCurrent);
}
```

`reference` se resuelve por defecto en `APP_TIMEZONE` mediante `zonedNow()`, igual que hoy: el
ciclo tiene que avanzar con el día local del usuario y no con el día UTC del servidor.

`cyclePreviousRange` se define retrocediendo un día desde el inicio del ciclo actual, no
restando un mes: con día de corte 31 los ciclos no tienen la misma longitud, y restar meses
produciría solapes.

Resultados que definen el comportamiento:

| `startDay` | referencia | ciclo | por qué |
|---|---|---|---|
| 22 | 2 sep 2026 | 22 ago – 21 sep | día 2 < ancla 22, ancla el mes anterior |
| 22 | 22 sep 2026 | 22 sep – 21 oct | el ciclo rueda justo el día del corte |
| 1 | 15 sep 2026 | 1 sep – 30 sep | fin real del mes, derivado |
| 1 | 15 feb 2026 | 1 feb – 28 feb | febrero sale solo |
| 31 | 15 feb 2026 | 31 ene – 27 feb | ancla de febrero recortada a 28, víspera = 27 |
| 31 | 15 mar 2026 | 28 feb – 30 mar | encadena sin hueco con el ciclo anterior |
| 22 | 10 ene 2027 | 22 dic 2026 – 21 ene 2027 | mes −1 cruza el año; `Date` lo normaliza |

## 6. Capas y archivos

La cadena sigue el patrón ya establecido por Balances configurables, con el ámbito presente en
toda firma que toque persistencia.

| Archivo | Responsabilidad |
|---|---|
| `src/domain/entities/period.ts` | `PeriodScope`, `PeriodSettings`, `DEFAULT_CYCLE_START_DAY`, límites |
| `src/domain/repositories/period.ts` | `IPeriodSettingsRepository` |
| `src/infrastructure/repositories/supabase/supabase-period-settings-repository.ts` | implementación Supabase |
| `src/infrastructure/repositories/implementations.ts` | (modificado) implementación en memoria |
| `src/application/services/period-settings-service.ts` | `getCycleStartDay`, `getAllCycleStartDays`, `setCycleStartDay` |
| `src/infrastructure/container.ts` | (modificado) cableado del repositorio y el servicio |
| `src/lib/validators/period-schemas.ts` | esquemas Zod |
| `src/app/actions/period-settings.ts` | server actions |
| `src/lib/date-range.ts` | (modificado) `anchorDay`, `cycleRangeContaining`, `cycleToDate`, `cyclePreviousRange`; se eliminan `defaultHubCustomRange` y `computeDateRange` |
| `src/presentation/components/period/PeriodSettingsProvider.tsx` | context cliente + `useCycleStartDay`, `useCycleRange` |
| `src/presentation/components/period/PeriodSettingsManager.tsx` | panel de configuración, compartido por los dos ámbitos |
| `supabase/migrations/20260901120000_period_settings.sql` | esquema |

Interfaz del repositorio:

```ts
export interface IPeriodSettingsRepository {
    findByOwner(ownerUserId: UUID, scope: PeriodScope): Promise<PeriodSettings | null>;
    findAllByOwner(ownerUserId: UUID): Promise<PeriodSettings[]>;
    upsert(ownerUserId: UUID, scope: PeriodScope, cycleStartDay: number): Promise<PeriodSettings>;
}
```

`findAllByOwner` existe para que la pestaña de Compras pueda mostrar el ciclo financiero como
referencia sin una segunda consulta.

El servicio resuelve el defecto, de modo que ningún consumidor tiene que conocerlo:

```ts
async getCycleStartDay(ownerUserId: UUID, scope: PeriodScope): Promise<number> {
    const found = await this.repository.findByOwner(ownerUserId, scope);
    return found?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY[scope];
}
```

`setCycleStartDay` valida contra el esquema Zod (`z.number().int().min(1).max(31)`) antes de
escribir, de forma que el `CHECK` de la base es la segunda línea de defensa y no la primera.

Las server actions devuelven `{ success, data } | { success, error }` y nunca lanzan al cliente,
como el resto de `src/app/actions/`. `setCycleStartDayAction` revalida `/dashboard`,
`/financial`, `/financial/transactions` y `/market/analytics`.

## 7. Propagación del valor

Dos caminos, según quién necesita el dato.

**Componentes cliente — context por layout.** `financial/layout.tsx` y `market/layout.tsx` ya
son server components async que resuelven el usuario y ya envuelven `children` en providers.
Cada uno lee el día de **su** ámbito desde el servicio del contenedor y monta el mismo provider:

```tsx
// financial/layout.tsx
const cycleStartDay = await periodSettingsService.getCycleStartDay(user.id, 'FINANCIAL');
return <PeriodSettingsProvider cycleStartDay={cycleStartDay}> … </PeriodSettingsProvider>;
```

El hook no sabe de ámbitos: lo resuelve el layout, y cada componente cliente recibe el ciclo
correcto por estar donde está. El valor viaja en el HTML del servidor, así que el `useState`
inicial arranca ya con él y no hay parpadeo ni desajuste de hidratación.

**Componentes servidor — servicio directo.** `transactions/page.tsx` y `dashboard/page.tsx` ya
resuelven el usuario en su propio render; llaman al servicio y a las funciones puras sin pasar
por el provider.

Los siete puntos del inventario quedan así:

| Punto | Después |
|---|---|
| `FinancialDashboard.tsx:53` | `useCycleRange()` |
| `FinancialDashboard.tsx:92` | `cycleToDate(useCycleStartDay())` |
| `TransactionFilters.tsx:67` | `useCycleRange()` |
| `transactions/page.tsx:54` | servicio + `cycleRangeContaining` |
| `MarketDateFilterBar.tsx:33` | `cycleRangeContaining(useCycleStartDay())` |
| `MarketDateFilterBar.tsx:97,150` | `useCycleRange()` |
| `dashboard/page.tsx:47` | servicio + `cycleRangeContaining` y `cyclePreviousRange` |

Migrados los siete, `defaultHubCustomRange()` y `computeDateRange()` se eliminan junto con sus
tests: la primera queda sin llamantes y la segunda ya no los tenía.

## 8. Interfaz

Un solo componente, `PeriodSettingsManager({ scope })`, montado dos veces. La pestaña se llama
"Periodos" en ambos sitios, con icono `CalendarRange`. `SettingsDashboard` y
`MarketSettingsDashboard` pasan de tres a cuatro pestañas (`grid-cols-3` → `grid-cols-4`).

```
/financial/settings                          /market/settings
[Instit.][Categorías][Balances][Periodos]    [Superm.][Categorías][Unidades][Periodos]

  ¿Qué día empieza tu mes financiero?          ¿Qué día empieza tu mes de compras?

   ┌──┬──┬──┬──┬──┬──┬──┐              ┌──┬──┬──┬──┬──┬──┬──┐
   │ 1│ 2│ 3│ 4│ 5│ 6│ 7│              │▓1│ 2│ 3│ 4│ 5│ 6│ 7│
   │ 8│ 9│10│11│12│13│14│              │ 8│ 9│10│11│12│13│14│
   │15│16│17│18│19│20│21│              │15│16│17│18│19│20│21│
   │▓2│23│24│25│26│27│28│              │22│23│24│25│26│27│28│
   │29│30│31│  │  │  │  │              │29│30│31│  │  │  │  │
   └──┴──┴──┴──┴──┴──┴──┘              └──┴──┴──┴──┴──┴──┴──┘
   El día 1 es el mes natural. Los     (los 29–31 con borde discontinuo)
   días 29 a 31 no existen en
   todos los meses.

  Tu ciclo actual                              Tu ciclo actual
    22 ago – 21 sep 2026                         1 sep – 30 sep 2026

  Siguientes                                   Siguientes
    22 sep – 21 oct · 22 oct – 21 nov            1 oct – 31 oct · 1 nov – 30 nov

  ⚠ Con día 29–31, los meses cortos            Tu ciclo financiero es 22 ago – 21 sep
    empiezan el último día disponible
    (31 ene – 27 feb).

              [ Guardar ]                                  [ Guardar ]
```

Detalles que fija el diseño:

- **Mobile-first.** El selector es una rejilla de 7 columnas con los 31 días, no un desplegable:
  a ancho de móvil un `Select` gastaba toda la fila para mostrar un número de dos cifras, y
  obligaba a abrir un popover para ver las opciones. La rejilla llena el ancho, deja los 31 días
  a un toque y hace innecesario el botón "Mes natural — día 1", porque el día 1 es una celda más.
  Cada celda es un `input type="radio"` visualmente oculto con su `label`, así que la navegación
  con flechas y el anuncio del lector de pantalla salen del comportamiento nativo del grupo de
  radios; el `aria-label` marca los dos extremos con significado ("Día 1 — mes natural",
  "Día 29 — mes corto"). Los días 29 a 31 llevan borde discontinuo, para advertir del recorte
  antes de elegirlos y no solo después.
- **Vista previa en vivo.** El ciclo actual y los dos siguientes se recalculan con
  `cycleRangeContaining` sobre el día marcado en la rejilla, antes de guardar. El usuario ve el
  efecto de su elección sin comprometerla.
- **Aviso de recorte.** Visible solo si el día elegido es ≥ 29, porque es el único caso en que
  el ciclo puede resultar más corto que un mes.
- **Referencia cruzada.** La pestaña de Compras muestra el ciclo financiero vigente como texto
  informativo. No hay botón de sincronizar: los ámbitos son independientes por decisión.
- **Al guardar:** server action, `toast` de confirmación y `router.refresh()` para que los
  rangos ya montados se recarguen con el ciclo nuevo.

## 9. Tests

- `__tests__/lib/date-range.test.ts` — reescrito. Los casos actuales del 22 pasan a
  `cycleRangeContaining(22, …)` y siguen verificando el comportamiento de hoy. Casos nuevos:
  día 1 con meses de 28, 30 y 31 días; día 31 con recorte en febrero; continuidad sin huecos ni
  solapes entre ciclos consecutivos con día 31; rollover exactamente en el día del corte; cruce
  de año; `cycleToDate`; y `cyclePreviousRange` incluida la cadena de ciclos desiguales con día
  31. Se borran los casos de `computeDateRange`.
- `__tests__/services/period-settings-service.test.ts` — defecto por ámbito sin fila
  (`FINANCIAL` → 22, `MARKET` → 1); una fila de un ámbito no filtra al otro; rechazo de 0, 32 y
  no enteros.
- `__tests__/components/PeriodSettingsManager.test.tsx` — jsdom: la rejilla ofrece los 31 días y
  marca el guardado; la vista previa sigue a la celda elegida sin guardar; el aviso de recorte
  aparece solo con días ≥ 29; el guardado llama la acción con el `scope` correcto y con el día
  elegido en la rejilla, no con el que llegó por props.

## 10. Riesgos

- **El recorte de meses cortos es visible.** Con día de corte 29, 30 o 31, febrero produce un
  ciclo de menos de un mes. No hay forma de evitarlo sin inventar días que no existen; el
  diseño lo hace explícito con el aviso en la pantalla de configuración.
- **Dos cifras cambian sin que nadie configure nada** — el preset "Mes" de `/financial` y el KPI
  comparativo de `/dashboard`, detallados en la sección 3. Son el precio de que el ciclo del
  usuario mande en todas las pantallas en vez de solo en el rango precargado.
- **Se borra código con tests que hoy pasan** (`computeDateRange`). Los tests van con la
  función; conviene revisar en el PR que ninguno cubría un caso que las funciones nuevas no
  cubran.
