# Módulo Bancos — Identificación y conciliación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una transacción capturada o escaneada quede atada sola a la cuenta o tarjeta correcta, y que las 739 ocurrencias de números enmascarados del historial se conecten a esas identidades mediante una pantalla de conciliación.

**Architecture:** Separa la **identidad** (la cuenta o tarjeta que el usuario posee) de las **observaciones** (cada forma en que se ha visto escrito su número). Una cadena cruda se parsea a huella; la huella se compara por compatibilidad contra las identidades ya conocidas; el resultado se registra con su nivel de confianza. Una máscara nueva se resuelve una vez y queda aprendida.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estricto, Supabase (Postgres 17 + RLS), Zod 4, Tailwind v4, shadcn/ui, Jest.

**Spec:** [docs/superpowers/specs/2026-08-12-modulo-bancos-design.md](../specs/2026-08-12-modulo-bancos-design.md) — secciones 4.7, 5, 8 y 9.

**Depende de:** [2026-08-12-modulo-bancos-nucleo.md](2026-08-12-modulo-bancos-nucleo.md), completo. El esquema, el dominio, los repos, `BankService` y las cinco pantallas ya existen en `feat/modulo-bancos`.

## Global Constraints

- **Nunca commitear, pushear, abrir PRs ni desplegar sin permiso explícito del usuario.**
- TypeScript estricto. Nada de `any` salvo necesidad demostrada.
- Mobile-first obligatorio; preservar la estética del módulo.
- Archivos temporales en `scratch/` (gitignored).
- RLS con las cuatro políticas sobre `auth.uid() = owner_user_id` en toda tabla nueva.
- Migraciones con el MCP de Supabase (`apply_migration`) sobre **KyberLife `xywkuwmhnfcdksamuypk`**, y el archivo versionado en `supabase/migrations/`.
- Server actions: validar con Zod, `requireUserId()`, servicio del container, devolver `{ success, data }` o `{ success, error }`. Nunca lanzar al cliente.
- `IRepository<T>` del proyecto usa **entidades completas** en `create` y `update`, no parciales. El servicio construye la entidad con `randomUUID()` y timestamps.
- Tests: `npm test` corre todo; `npx jest --config jest.unit.config.js` corre solo los `*.test.ts` en entorno node.
- **Nunca inventar dígitos.** Prefijo y sufijo van en campos separados justamente para que no se puedan confundir.

---

## La data real

Todo el plan se apoya en estas cifras, medidas sobre `financial_scanner_transactions.accounts`:

| Medida | Valor |
|---|---|
| Ocurrencias totales | 739 |
| Cadenas crudas distintas | 98 |
| Con 4 o más dígitos útiles | 449 ocurrencias, 59 variantes → ~35 identidades |
| Con menos de 4 | 288 ocurrencias, 35 variantes |
| Transacciones enlazables por join | 274 de 384 (257 con datos de cuenta) |

Las 98 cadenas cubren nueve formas distintas de enmascarar. Estas son las que rompen cualquier parser ingenuo:

| Cadena | Por qué importa |
|---|---|
| `493176XXXXXX2780` | BIN de 6 + máscara + 4 finales |
| `••••2780` | La misma tarjeta, sin BIN |
| `4043615213` | **Número completo, sin una sola máscara** |
| `2204339558` | Completo; resuelve la ambigüedad de `22XXXXXX58` |
| `22XXXXXX58` | Máscara que conserva el **prefijo**: termina en `58`, no en `2258` |
| `25XXX10` | Prefijo conservado, largo 7 (cooperativa) |
| `MASTERCARD Banco del Austro 548244XXXXXX8001` | Marca **e** institución embebidas |
| `Coop. Jardín Azuayo ***5010` | Institución embebida |
| `•••• •••• •••• 1860` | Bullets con espacios |
| `5422-58XX-XXXX-X361` | Guiones dentro de la máscara |
| `AHO - XXXXXX0814` | Tipo de cuenta embebido |
| `MASTERCARD` | Marca **sin un solo dígito** |
| `Mastercard 8361` | Marca + 4 dígitos sueltos, sin máscara |
| `620` | Tres dígitos sueltos |

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260813120000_bank_number_observations.sql` | Enum, tabla, FK pendiente de `financial_transactions` |
| `src/lib/bank-number-fingerprint.ts` | Cadena cruda → huella. Puro |
| `src/lib/bank-number-match.ts` | Compatibilidad entre huellas y resolución. Puro |
| `src/domain/entities/bank.ts` | Entidad `BankNumberObservation` (se extiende) |
| `src/domain/repositories/bank.ts` | `IBankNumberObservationRepository` (se extiende) |
| `src/infrastructure/repositories/supabase/supabase-bank-observation-repository.ts` | Persistencia |
| `src/infrastructure/repositories/bank-in-memory.ts` | Versión in-memory (se extiende) |
| `src/application/services/bank-identification-service.ts` | Resolver, registrar, conciliar |
| `src/app/actions/bank-reconcile.ts` | Server actions de conciliación |
| `src/presentation/bank/components/ReconcileClient.tsx` | Pantalla, tres secciones |
| `src/presentation/bank/components/ReconcileGroupCard.tsx` | Un grupo candidato |
| `src/app/financial/banks/reconcile/page.tsx` | Ruta |
| `supabase/migrations/20260813120100_bank_backfill_observations.sql` | Backfill del historial |
| `__tests__/lib/bank-number-fingerprint.test.ts` | Las 98 cadenas reales como fixtures |
| `__tests__/lib/bank-number-match.test.ts` | Compatibilidad, guard de prefijo |
| `__tests__/services/bank-identification-service.test.ts` | Cascada y conciliación |

---

## Task 1: Tabla de observaciones

**Files:**
- Create: `supabase/migrations/20260813120000_bank_number_observations.sql`

**Interfaces:**
- Consumes: `bank_accounts`, `bank_cards`, `financial_transactions` (del plan anterior)
- Produce: enum `bank_number_resolution`; tabla `bank_number_observations`; FK sobre `financial_transactions.bank_counterparty_observation_id`

- [ ] **Step 1: Escribir la migración**

```sql
-- Cada forma distinta en que se ha visto escrito un número, con sus partes
-- parseadas. Es lo que hace que el emparejamiento mejore solo con el uso: una
-- máscara nueva se resuelve una vez y queda aprendida.
CREATE TYPE bank_number_resolution AS ENUM ('EXACT', 'INFERRED', 'MANUAL', 'EXTERNAL', 'PENDING');

CREATE TABLE bank_number_observations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    raw               TEXT NOT NULL,           -- la cadena cruda, tal cual llegó
    prefix_digits     TEXT NOT NULL DEFAULT '',
    suffix_digits     TEXT NOT NULL DEFAULT '',
    total_length      SMALLINT,
    bin               TEXT,
    brand             TEXT,
    account_type_hint TEXT,                    -- AHO, CTE
    institution_hint  TEXT,                    -- nombre embebido en la cadena
    is_complete       BOOLEAN NOT NULL DEFAULT FALSE,

    account_id        UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    card_id           UUID REFERENCES bank_cards(id) ON DELETE SET NULL,
    resolution        bank_number_resolution NOT NULL DEFAULT 'PENDING',
    occurrences       INTEGER NOT NULL DEFAULT 1,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Una observación apunta a una cuenta o a una tarjeta, nunca a ambas.
    CONSTRAINT bank_number_observations_one_target
        CHECK (account_id IS NULL OR card_id IS NULL)
);

-- La misma cadena cruda se ve una sola vez por usuario: es la clave del
-- aprendizaje, `occurrences` cuenta cuántas veces reapareció.
CREATE UNIQUE INDEX bank_number_observations_owner_raw_uq
    ON bank_number_observations (owner_user_id, raw);

CREATE INDEX bank_number_observations_suffix_idx
    ON bank_number_observations (owner_user_id, suffix_digits) WHERE is_deleted = FALSE;
CREATE INDEX bank_number_observations_pending_idx
    ON bank_number_observations (owner_user_id, resolution) WHERE is_deleted = FALSE;

ALTER TABLE bank_number_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bank_number_observations"   ON bank_number_observations FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can insert own bank_number_observations" ON bank_number_observations FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own bank_number_observations" ON bank_number_observations FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own bank_number_observations" ON bank_number_observations FOR DELETE USING (auth.uid() = owner_user_id);

-- La columna se declaró sin FK en el plan anterior, porque su destino no
-- existía todavía. Ahora sí.
ALTER TABLE financial_transactions
    ADD CONSTRAINT financial_transactions_bank_counterparty_observation_fkey
    FOREIGN KEY (bank_counterparty_observation_id)
    REFERENCES bank_number_observations(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Aplicar la migración**

MCP de Supabase, `apply_migration`, nombre `bank_number_observations`.

- [ ] **Step 3: Verificar la tabla, el RLS y la FK**

```sql
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'bank_number_observations';
```
Esperado: una fila con `relrowsecurity = true`.

```sql
SELECT conname FROM pg_constraint
WHERE conname = 'financial_transactions_bank_counterparty_observation_fkey';
```
Esperado: una fila.

- [ ] **Step 4: Verificar que el CHECK rechaza apuntar a los dos a la vez**

Bloque que revierte, como en el plan anterior:

```sql
DO $$
DECLARE usr uuid; inst uuid; acc uuid; card uuid; rechazado boolean := false;
BEGIN
  SELECT owner_user_id, id INTO usr, inst FROM bank_institutions LIMIT 1;
  INSERT INTO bank_accounts (owner_user_id, institution_id, name, account_type)
  VALUES (usr, inst, 'tmp', 'SAVINGS') RETURNING id INTO acc;
  INSERT INTO bank_cards (owner_user_id, institution_id, name, card_type)
  VALUES (usr, inst, 'tmp-tc', 'CREDIT') RETURNING id INTO card;

  BEGIN
    INSERT INTO bank_number_observations (owner_user_id, raw, account_id, card_id)
    VALUES (usr, 'tmp-raw', acc, card);
  EXCEPTION WHEN check_violation THEN rechazado := true;
  END;

  RAISE EXCEPTION 'CHECK una-sola-identidad funciona: %', rechazado;
END $$;
```
Esperado: el mensaje termina en `t`, y no queda residuo.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add supabase/migrations/20260813120000_bank_number_observations.sql
git commit -m "feat(bancos): agrega bank_number_observations y cierra la FK de contraparte"
```

---

## Task 2: Parseo de la huella

**Files:**
- Create: `src/lib/bank-number-fingerprint.ts`
- Test: `__tests__/lib/bank-number-fingerprint.test.ts`

**Interfaces:**
- Produce: tipo `NumberFingerprint`; `parseBankNumber(raw: string): NumberFingerprint`

**Nota sobre `isComplete`:** una cadena sin máscara puede ser un número entero (`4043615213`) o solo los cuatro últimos (`Mastercard 8361`). El umbral es 8 dígitos: por debajo se trata como sufijo suelto, nunca como número completo.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/lib/bank-number-fingerprint.test.ts`:

```ts
import { parseBankNumber } from "@/lib/bank-number-fingerprint";

describe("parseBankNumber — máscara al final", () => {
    it("máscara de equis con 4 finales", () => {
        expect(parseBankNumber("XXXXXX0814")).toMatchObject({
            prefixDigits: "", suffixDigits: "0814", totalLength: 10,
            bin: null, brand: null, isComplete: false,
        });
    });

    it("asteriscos y equis producen la misma huella", () => {
        const a = parseBankNumber("XXXXXX0814");
        const b = parseBankNumber("******0814");
        expect(b.suffixDigits).toBe(a.suffixDigits);
        expect(b.prefixDigits).toBe(a.prefixDigits);
    });

    it("bullets con espacios", () => {
        expect(parseBankNumber("•••• •••• •••• 1860")).toMatchObject({
            prefixDigits: "", suffixDigits: "1860", totalLength: 16,
        });
    });
});

describe("parseBankNumber — BIN y marca", () => {
    it("extrae el BIN de una tarjeta", () => {
        expect(parseBankNumber("493176XXXXXX2780")).toMatchObject({
            prefixDigits: "493176", suffixDigits: "2780",
            bin: "493176", totalLength: 16,
        });
    });

    it("la marca sale del texto, no de los dígitos", () => {
        expect(parseBankNumber("Visa ••••9620")).toMatchObject({
            brand: "Visa", suffixDigits: "9620", prefixDigits: "",
        });
    });

    it("los guiones dentro de la máscara no cambian nada", () => {
        expect(parseBankNumber("5422-58XX-XXXX-X361")).toMatchObject({
            prefixDigits: "542258", suffixDigits: "361", bin: "542258",
        });
    });

    it("marca e institución embebidas a la vez", () => {
        expect(parseBankNumber("MASTERCARD Banco del Austro 548244XXXXXX8001")).toMatchObject({
            brand: "Mastercard", institutionHint: "Banco del Austro",
            prefixDigits: "548244", suffixDigits: "8001", bin: "548244",
        });
    });

    it("institución embebida sin marca", () => {
        expect(parseBankNumber("Coop. Jardín Azuayo ***5010")).toMatchObject({
            institutionHint: "Coop. Jardín Azuayo", suffixDigits: "5010", brand: null,
        });
    });

    it("una marca sin dígitos no afirma ningún número", () => {
        expect(parseBankNumber("MASTERCARD")).toMatchObject({
            brand: "Mastercard", prefixDigits: "", suffixDigits: "", isComplete: false,
        });
    });
});

describe("parseBankNumber — máscara que conserva el prefijo", () => {
    it("prefijo y sufijo van a campos separados", () => {
        expect(parseBankNumber("22XXXXXX58")).toMatchObject({
            prefixDigits: "22", suffixDigits: "58", totalLength: 10, bin: null,
        });
    });

    it("NUNCA fabrica el número pegando prefijo y sufijo", () => {
        const f = parseBankNumber("25XXX10");
        expect(f.prefixDigits).toBe("25");
        expect(f.suffixDigits).toBe("10");
        // 2510 no existe: es la trampa que este parser está para evitar.
        expect(f.suffixDigits).not.toBe("2510");
        expect(f.isComplete).toBe(false);
    });

    it("un prefijo de 6 sí es un BIN, uno de 2 no", () => {
        expect(parseBankNumber("22XXXXXX58").bin).toBeNull();
        expect(parseBankNumber("542258XXXXXXX361").bin).toBe("542258");
    });
});

describe("parseBankNumber — sin máscara", () => {
    it("un número largo sin máscara es completo", () => {
        expect(parseBankNumber("4043615213")).toMatchObject({
            isComplete: true, prefixDigits: "404361", suffixDigits: "5213", totalLength: 10,
        });
    });

    it("otro completo, el que resuelve la ambigüedad de 22XXXXXX58", () => {
        expect(parseBankNumber("2204339558")).toMatchObject({
            isComplete: true, prefixDigits: "220433", suffixDigits: "9558", totalLength: 10,
        });
    });

    it("cuatro dígitos sueltos son un sufijo, no un número completo", () => {
        expect(parseBankNumber("Mastercard 8361")).toMatchObject({
            isComplete: false, prefixDigits: "", suffixDigits: "8361", brand: "Mastercard",
        });
    });

    it("tres dígitos sueltos también", () => {
        expect(parseBankNumber("620")).toMatchObject({
            isComplete: false, prefixDigits: "", suffixDigits: "620",
        });
    });
});

describe("parseBankNumber — tipo de cuenta embebido", () => {
    it("AHO se guarda como hint, no como parte del número", () => {
        expect(parseBankNumber("AHO - XXXXXX0814")).toMatchObject({
            accountTypeHint: "SAVINGS", suffixDigits: "0814", prefixDigits: "",
        });
    });

    it("CTE también", () => {
        expect(parseBankNumber("CTE - XXXXXX9511").accountTypeHint).toBe("CHECKING");
    });
});

describe("parseBankNumber — robustez", () => {
    it("conserva la cadena cruda intacta", () => {
        const raw = "AHO - XXXXXX0814";
        expect(parseBankNumber(raw).raw).toBe(raw);
    });

    it("una cadena vacía no revienta", () => {
        expect(parseBankNumber("")).toMatchObject({
            prefixDigits: "", suffixDigits: "", isComplete: false,
        });
    });

    it("una máscara de equis no se confunde con el nombre de un banco", () => {
        // Las equis son letras: sin filtrarlas, el hint saldría "XXXXXX".
        expect(parseBankNumber("XXXXXX0814").institutionHint).toBeNull();
        expect(parseBankNumber("AHO - XXXXXX0814").institutionHint).toBeNull();
        expect(parseBankNumber("PACIFICARD TITULAR MASTERCARD 542258XXXXXXX361").institutionHint).toBeNull();
    });

    it("las 98 cadenas reales se parsean sin excepción", () => {
        for (const raw of REAL_STRINGS) {
            expect(() => parseBankNumber(raw)).not.toThrow();
        }
    });

    it("ninguna cadena real produce un sufijo mayor que sus dígitos visibles", () => {
        for (const raw of REAL_STRINGS) {
            const f = parseBankNumber(raw);
            const visibles = raw.replace(/[^0-9]/g, "");
            expect(visibles).toContain(f.suffixDigits);
        }
    });
});

/** Las 98 formas distintas que los bancos han usado en la base real. */
const REAL_STRINGS = [
    "493176XXXXXX2780", "620", "25XXX10", "******9558", "******1419",
    "******0814", "XXXXXX0814", "Visa ••••9620", "***5010", "************1860",
    "13XXXXXX14", "10XXXXXX11", "******620", "••••9620", "Mastercard-8361",
    "******9511", "25XXX61", "77XXXXXX19", "****9620", "22XXXXXX58",
    "542258XXXXXXX361", "MASTERCARD 542258XXXXXXX361", "XXXXXX1419", "XXXXXX1582",
    "XXXXXX9558", "****361", "22XXXXXX82", "AHO - XXXXXX0814", "XXXXXX5028",
    "******4734", "22XXXXXX99", "40XXXXXXXX00", "4043615213", "MASTERCARD",
    "XXXXXX4058", "******0091", "******0100", "******0736", "******3159",
    "******361", "******5286", "******5296", "******5324", "******7590",
    "******8729", "******8973", "******9160", "****620", "•••• •••• •••• 1860",
    "••••2780", "00XXXXXX23", "10XXX49", "2204339558", "25XXX47", "26XXX18",
    "26XXX40", "28XXX58", "78XXX36", "Coop. Jardín Azuayo ***5010",
    "MasterCard - 548244XXXXXX8001", "MASTERCARD •••• 8361",
    "PACIFICARD 542258XXXXXXX361", "PACIFICARD TITULAR MASTERCARD 542258XXXXXXX361",
    "TITULAR MASTERCARD 542258XXXXXXX361", "XXX5010", "XXXXXX6655", "XXXXXXX1608",
    "XXXXXXXX4204", "XXXXXXXX7903", "XXXXXXXXXXXX9620", "**** **** **** *620",
    "********361", "*******361", "******0450", "******1582", "******1860",
    "******2621", "******2780", "******3639", "******3700", "******8164",
    "******8361", "******9620", "******9968", "*****9558", "•••• 9620",
    "20XXX42", "22XXX81", "26XXX07", "5422-58XX-XXXX-X361", "542258XXXXXXXX361",
    "MASTERCARD 548244XXXXXX8001", "Mastercard 8361",
    "MASTERCARD Banco del Austro 548244XXXXXX8001",
    "PacifiCard TITULAR MASTERCARD 542258XXXXXXX361", "Visa ****9620", "Visa 9620",
    "XXXXXX9511",
] as const;
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/lib/bank-number-fingerprint.test.ts`
Expected: FAIL — `Cannot find module '@/lib/bank-number-fingerprint'`.

- [ ] **Step 3: Escribir el parser**

Crear `src/lib/bank-number-fingerprint.ts`:

```ts
export interface NumberFingerprint {
    /** La cadena tal cual llegó. Nunca se modifica. */
    raw: string;
    /** Dígitos antes de la primera máscara. Vacío si la máscara va delante. */
    prefixDigits: string;
    /** Dígitos después de la última máscara. */
    suffixDigits: string;
    /** Largo de la parte numérica y de máscara, sin letras ni separadores. */
    totalLength: number;
    /** Prefijo de 6 dígitos: identifica al emisor de una tarjeta. */
    bin: string | null;
    brand: string | null;
    /** SAVINGS | CHECKING, cuando el banco lo abrevió en la cadena. */
    accountTypeHint: string | null;
    /** Nombre de institución embebido en la cadena. */
    institutionHint: string | null;
    /** El número entero, sin ocultar nada. */
    isComplete: boolean;
}

/** Caracteres que los bancos usan para tapar dígitos. */
const MASK = /[X×x*•·●#]/;
const MASK_GLOBAL = /[X×x*•·●#]/g;

const BRANDS: readonly { pattern: RegExp; label: string }[] = [
    { pattern: /american\s*express|amex/i, label: "American Express" },
    { pattern: /mastercard/i, label: "Mastercard" },
    { pattern: /diners/i, label: "Diners Club" },
    { pattern: /visa/i, label: "Visa" },
];

/** Palabras que no son el nombre de una institución aunque lo parezcan. */
const NOT_INSTITUTION = /^(titular|tarjeta|cuenta|card|account|aho|cte|ahorros|corriente)$/i;

const TYPE_HINTS: readonly { pattern: RegExp; type: string }[] = [
    { pattern: /\bAHO\b|\bahorros?\b/i, type: "SAVINGS" },
    { pattern: /\bCTE\b|\bcorriente\b/i, type: "CHECKING" },
];

/** Por debajo de esto, una cadena sin máscara son los últimos dígitos, no el número. */
const COMPLETE_MIN_DIGITS = 8;

/**
 * Parsea una cadena cruda a su huella.
 *
 * La regla que gobierna todo: **nunca se inventan dígitos**. Prefijo y sufijo
 * van a campos separados justamente para que no se puedan pegar. `25XXX10`
 * es `prefix=25, suffix=10` y eso es todo lo que se afirma de él — no es la
 * cuenta 2510, que no existe.
 */
export function parseBankNumber(raw: string): NumberFingerprint {
    const brand = BRANDS.find(b => b.pattern.test(raw))?.label ?? null;
    const accountTypeHint = TYPE_HINTS.find(t => t.pattern.test(raw))?.type ?? null;
    const institutionHint = extractInstitutionHint(raw, brand);

    // Deja solo dígitos y máscaras: las letras y separadores ya dieron lo suyo.
    const core = raw.replace(/[^0-9X×x*•·●#]/g, "");

    const maskIndex = core.search(MASK);
    const hasMask = maskIndex !== -1;

    if (!hasMask) {
        const digits = core;
        const isComplete = digits.length >= COMPLETE_MIN_DIGITS;
        return {
            raw,
            prefixDigits: isComplete ? digits.slice(0, 6) : "",
            suffixDigits: isComplete ? digits.slice(-4) : digits,
            totalLength: digits.length,
            bin: isComplete && looksLikeCard(digits) ? digits.slice(0, 6) : null,
            brand, accountTypeHint, institutionHint,
            isComplete,
        };
    }

    const prefixDigits = core.slice(0, maskIndex);
    const lastMask = lastIndexOfMask(core);
    const suffixDigits = core.slice(lastMask + 1);

    return {
        raw,
        prefixDigits,
        suffixDigits,
        totalLength: core.length,
        // Un prefijo de 6 dígitos es un BIN; uno de 2 es solo el inicio de una
        // cuenta que el banco decidió no tapar.
        bin: prefixDigits.length >= 6 ? prefixDigits.slice(0, 6) : null,
        brand, accountTypeHint, institutionHint,
        isComplete: false,
    };
}

function lastIndexOfMask(value: string): number {
    let last = -1;
    for (const match of value.matchAll(MASK_GLOBAL)) last = match.index;
    return last;
}

/** Un número completo de 15-16 dígitos que empieza por 3-5 es una tarjeta. */
function looksLikeCard(digits: string): boolean {
    return digits.length >= 15 && /^[3-5]/.test(digits);
}

/**
 * El nombre de institución que el banco metió en la cadena, si lo hizo.
 * Se queda con las palabras alfabéticas que no son la marca ni ruido.
 */
function extractInstitutionHint(raw: string, brand: string | null): string | null {
    const words = raw.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]+/g);
    if (!words) return null;

    const kept = words.filter(word => {
        const clean = word.replace(/\./g, "");
        if (!clean) return false;
        // Las equis de la máscara son letras: sin esto, `AHO - XXXXXX0814`
        // reportaría "XXXXXX" como el nombre de la institución.
        if (/^[X×x]+$/.test(clean)) return false;
        if (NOT_INSTITUTION.test(clean)) return false;
        if (BRANDS.some(b => b.pattern.test(clean))) return false;
        // PACIFICARD y similares son nombres de producto, no de institución.
        if (/card$/i.test(clean)) return false;
        return true;
    });

    if (kept.length === 0) return null;

    const hint = kept.join(" ").trim();
    // Una sola palabra corta no identifica a nadie.
    return hint.length >= 4 ? hint : null;
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/lib/bank-number-fingerprint.test.ts`
Expected: PASS, 20 tests.

Si `extractInstitutionHint` falla en `MASTERCARD Banco del Austro 548244XXXXXX8001` porque `del` es corto, ajustar el filtro para conservar palabras de enlace cuando van entre dos palabras conservadas. No relajar `NOT_INSTITUTION`.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/lib/bank-number-fingerprint.ts __tests__/lib/bank-number-fingerprint.test.ts
git commit -m "feat(bancos): agrega parseo de numero de cuenta a huella"
```

---

## Task 3: Compatibilidad y resolución

**Files:**
- Create: `src/lib/bank-number-match.ts`
- Test: `__tests__/lib/bank-number-match.test.ts`

**Interfaces:**
- Consumes: `NumberFingerprint` de la Task 2
- Produce: tipo `IdentityFingerprint`; `mergeFingerprints`, `areCompatible`, `resolveFingerprint`

**El guard de prefijo no es opcional.** Sin él, `25XXX61` —una cuenta de 7 caracteres de la cooperativa— emparejaría con `8361`, que es una Mastercard de 16 dígitos: `61` es sufijo de `8361` y sería el único candidato. Lo que lo descarta es que el prefijo `25` choca con el `542258` de la tarjeta. Son 8 ocurrencias.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/lib/bank-number-match.test.ts`:

```ts
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { areCompatible, mergeFingerprints, resolveFingerprint } from "@/lib/bank-number-match";

const fp = parseBankNumber;

describe("areCompatible — sufijo contenido", () => {
    it("361 es sufijo de 8361", () => {
        expect(areCompatible(fp("Mastercard 8361"), fp("****361"))).toBe(true);
    });

    it("620 es sufijo de 9620", () => {
        expect(areCompatible(fp("Visa 9620"), fp("******620"))).toBe(true);
    });

    it("dos sufijos que no se contienen no son compatibles", () => {
        expect(areCompatible(fp("XXXXXX0814"), fp("XXXXXX9511"))).toBe(false);
    });
});

describe("areCompatible — guard de prefijo", () => {
    it("RECHAZA 25XXX61 contra la Mastercard 542258XXXXXXX361", () => {
        // 61 es sufijo de 361, pero el prefijo 25 choca con 542258.
        expect(areCompatible(fp("25XXX61"), fp("542258XXXXXXX361"))).toBe(false);
    });

    it("acepta cuando un prefijo está vacío", () => {
        expect(areCompatible(fp("13XXXXXX14"), fp("XXXXXX0814"))).toBe(true);
    });

    it("acepta cuando un prefijo es prefijo del otro", () => {
        // 2204339558 completo: prefijo 220433, del que 22 es prefijo.
        expect(areCompatible(fp("22XXXXXX58"), fp("2204339558"))).toBe(true);
    });
});

describe("areCompatible — BIN y marca", () => {
    it("dos BIN distintos nunca son la misma tarjeta", () => {
        expect(areCompatible(fp("493176XXXXXX2780"), fp("548244XXXXXX8001"))).toBe(false);
    });

    it("dos marcas distintas tampoco", () => {
        expect(areCompatible(fp("Visa ••••9620"), fp("Mastercard 9620"))).toBe(false);
    });

    it("una marca ausente no contradice a ninguna", () => {
        expect(areCompatible(fp("••••9620"), fp("Visa ••••9620"))).toBe(true);
    });
});

describe("areCompatible — sin dígitos", () => {
    it("una marca sin dígitos no empareja con nada", () => {
        expect(areCompatible(fp("MASTERCARD"), fp("Mastercard 8361"))).toBe(false);
    });
});

describe("mergeFingerprints", () => {
    it("acumula lo que cada observación aporta", () => {
        const merged = mergeFingerprints([fp("••••2780"), fp("493176XXXXXX2780")]);
        expect(merged).toMatchObject({
            suffixDigits: "2780", prefixDigits: "493176", bin: "493176",
        });
    });

    it("se queda con el sufijo más largo conocido", () => {
        const merged = mergeFingerprints([fp("****361"), fp("Mastercard 8361")]);
        expect(merged.suffixDigits).toBe("8361");
    });
});

describe("resolveFingerprint", () => {
    const cuenta0814 = { id: "a1", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX0814")]) };
    const cuenta9511 = { id: "a2", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX9511")]) };
    const tarjeta8361 = { id: "c1", kind: "CARD" as const, fingerprint: mergeFingerprints([fp("542258XXXXXXX361"), fp("Mastercard 8361")]) };

    it("sufijo de 4 y candidato único: EXACT", () => {
        const r = resolveFingerprint(fp("******0814"), [cuenta0814, cuenta9511]);
        expect(r).toMatchObject({ resolution: "EXACT", targetId: "a1" });
    });

    it("sufijo corto y candidato único: INFERRED", () => {
        const r = resolveFingerprint(fp("****361"), [tarjeta8361, cuenta0814]);
        expect(r).toMatchObject({ resolution: "INFERRED", targetId: "c1" });
    });

    it("varios candidatos: PENDING, sin elegir", () => {
        const cuenta4058 = { id: "a3", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX4058")]) };
        const cuenta9558 = { id: "a4", kind: "ACCOUNT" as const, fingerprint: mergeFingerprints([fp("XXXXXX9558")]) };
        const r = resolveFingerprint(fp("28XXX58"), [cuenta4058, cuenta9558]);
        expect(r).toMatchObject({ resolution: "PENDING", targetId: null });
        expect(r.candidateIds).toEqual(expect.arrayContaining(["a3", "a4"]));
    });

    it("sin candidatos: PENDING", () => {
        const r = resolveFingerprint(fp("22XXXXXX99"), [cuenta0814]);
        expect(r).toMatchObject({ resolution: "PENDING", targetId: null, candidateIds: [] });
    });

    it("el guard de prefijo evita el falso positivo de 25XXX61", () => {
        const r = resolveFingerprint(fp("25XXX61"), [tarjeta8361]);
        expect(r.resolution).toBe("PENDING");
        expect(r.candidateIds).toEqual([]);
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/lib/bank-number-match.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir el emparejador**

Crear `src/lib/bank-number-match.ts`:

```ts
import type { NumberFingerprint } from "./bank-number-fingerprint";

/** Lo que se sabe del número de una identidad, sumando sus observaciones. */
export type IdentityFingerprint = Pick<
    NumberFingerprint,
    "prefixDigits" | "suffixDigits" | "bin" | "brand" | "totalLength" | "accountTypeHint" | "institutionHint"
>;

export interface IdentityCandidate {
    id: string;
    kind: "ACCOUNT" | "CARD";
    fingerprint: IdentityFingerprint;
}

export type Resolution = "EXACT" | "INFERRED" | "PENDING";

export interface ResolutionResult {
    resolution: Resolution;
    /** La identidad elegida, o null si no hubo una sola. */
    targetId: string | null;
    targetKind: "ACCOUNT" | "CARD" | null;
    /** Todo lo compatible, para que la conciliación muestre las opciones. */
    candidateIds: string[];
}

/** Sufijo de 4 o más: suficiente para afirmar sin pedir confirmación. */
const STRONG_SUFFIX = 4;

/** Suma lo que cada observación aporta sobre el mismo número. */
export function mergeFingerprints(
    fingerprints: readonly NumberFingerprint[],
): IdentityFingerprint {
    const longest = (a: string, b: string) => (b.length > a.length ? b : a);

    return fingerprints.reduce<IdentityFingerprint>((acc, f) => ({
        prefixDigits: longest(acc.prefixDigits, f.prefixDigits),
        suffixDigits: longest(acc.suffixDigits, f.suffixDigits),
        bin: acc.bin ?? f.bin,
        brand: acc.brand ?? f.brand,
        // El largo de la máscara no es fiable (la misma cuenta aparece como
        // *****9558 y ******9558), así que se conserva solo como pista.
        totalLength: Math.max(acc.totalLength, f.totalLength),
        accountTypeHint: acc.accountTypeHint ?? f.accountTypeHint,
        institutionHint: acc.institutionHint ?? f.institutionHint,
    }), {
        prefixDigits: "", suffixDigits: "", bin: null, brand: null,
        totalLength: 0, accountTypeHint: null, institutionHint: null,
    });
}

/** El más corto es sufijo del más largo, y ninguno está vacío. */
function suffixContained(a: string, b: string): boolean {
    if (!a || !b) return false;
    return a.length <= b.length ? b.endsWith(a) : a.endsWith(b);
}

/** Uno vacío, o uno es prefijo del otro. */
function prefixCompatible(a: string, b: string): boolean {
    if (!a || !b) return true;
    return a.length <= b.length ? b.startsWith(a) : a.startsWith(b);
}

function noConflict(a: string | null, b: string | null): boolean {
    if (a === null || b === null) return true;
    return a.toLowerCase() === b.toLowerCase();
}

/**
 * Dos huellas pueden ser el mismo número si ninguna parte conocida se
 * contradice. El largo queda fuera a propósito: contar caracteres de máscara
 * no es fiable, así que solo sirve para desempatar, nunca para rechazar.
 */
export function areCompatible(
    a: NumberFingerprint | IdentityFingerprint,
    b: NumberFingerprint | IdentityFingerprint,
): boolean {
    return suffixContained(a.suffixDigits, b.suffixDigits)
        && prefixCompatible(a.prefixDigits, b.prefixDigits)
        && noConflict(a.bin, b.bin)
        && noConflict(a.brand, b.brand);
}

/**
 * A qué identidad pertenece una huella.
 *
 * Con sufijo de 4 o más y un solo candidato la afirmación es firme (`EXACT`).
 * Con menos, el candidato único sigue siendo la única lectura posible pero se
 * marca `INFERRED` para que la conciliación lo muestre con su evidencia.
 * Varios candidatos, o ninguno, quedan `PENDING` y no tocan ningún saldo.
 */
export function resolveFingerprint(
    fingerprint: NumberFingerprint,
    candidates: readonly IdentityCandidate[],
): ResolutionResult {
    const compatible = candidates.filter(c => areCompatible(fingerprint, c.fingerprint));

    if (compatible.length !== 1) {
        return {
            resolution: "PENDING",
            targetId: null,
            targetKind: null,
            candidateIds: compatible.map(c => c.id),
        };
    }

    const [only] = compatible;
    return {
        resolution: fingerprint.suffixDigits.length >= STRONG_SUFFIX ? "EXACT" : "INFERRED",
        targetId: only.id,
        targetKind: only.kind,
        candidateIds: [only.id],
    };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/lib/bank-number-match.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/lib/bank-number-match.ts __tests__/lib/bank-number-match.test.ts
git commit -m "feat(bancos): agrega emparejamiento de huellas por compatibilidad"
```

---

## Task 4: Entidad, repositorio y cableado

**Files:**
- Modify: `src/domain/entities/bank.ts`
- Modify: `src/domain/repositories/bank.ts`
- Create: `src/infrastructure/repositories/supabase/supabase-bank-observation-repository.ts`
- Modify: `src/infrastructure/repositories/supabase/index.ts`
- Modify: `src/infrastructure/repositories/bank-in-memory.ts`
- Modify: `src/infrastructure/container.ts`

**Interfaces:**
- Produce: `BankNumberObservation`, `BankNumberResolution`, `IBankNumberObservationRepository`, `SupabaseBankNumberObservationRepository`, `InMemoryBankNumberObservationRepository`, y el singleton `bankObservationRepository`

- [ ] **Step 1: Añadir la entidad**

En `src/domain/entities/bank.ts`:

```ts
export type BankNumberResolution = 'EXACT' | 'INFERRED' | 'MANUAL' | 'EXTERNAL' | 'PENDING';

/**
 * Una forma concreta en que se vio escrito un número, con sus partes parseadas.
 * La cadena cruda se conserva íntegra: si las reglas de emparejamiento mejoran,
 * todo se puede recalcular sin haber perdido nada.
 */
export interface BankNumberObservation extends BaseEntity {
    ownerUserId: UUID;
    raw: string;
    prefixDigits: string;
    suffixDigits: string;
    totalLength?: number | null;
    bin?: string | null;
    brand?: string | null;
    accountTypeHint?: string | null;
    institutionHint?: string | null;
    isComplete: boolean;
    accountId?: UUID | null;
    cardId?: UUID | null;
    resolution: BankNumberResolution;
    occurrences: number;
}
```

- [ ] **Step 2: Añadir la interfaz de repositorio**

En `src/domain/repositories/bank.ts`:

```ts
export interface IBankNumberObservationRepository extends IRepository<BankNumberObservation> {
    findByOwnerId(userId: UUID): Promise<BankNumberObservation[]>;
    /** La observación de esta cadena exacta, si ya se vio. */
    findByRaw(userId: UUID, raw: string): Promise<BankNumberObservation | null>;
    findByResolution(userId: UUID, resolution: BankNumberResolution): Promise<BankNumberObservation[]>;
    /** Las que ya apuntan a una identidad; alimentan el emparejamiento. */
    findResolved(userId: UUID): Promise<BankNumberObservation[]>;
}
```

- [ ] **Step 3: Escribir el repositorio Supabase**

Copiar `supabase-bank-snapshot-repository.ts` a `supabase-bank-observation-repository.ts`, clase `SupabaseBankNumberObservationRepository`, tabla `"bank_number_observations"`. Mapeo: `raw`, `prefix_digits ↔ prefixDigits`, `suffix_digits ↔ suffixDigits`, `total_length ↔ totalLength`, `bin`, `brand`, `account_type_hint ↔ accountTypeHint`, `institution_hint ↔ institutionHint`, `is_complete ↔ isComplete`, `account_id ↔ accountId`, `card_id ↔ cardId`, `resolution`, `occurrences`. Métodos extra:

```ts
    async findByRaw(userId: UUID, raw: string): Promise<BankNumberObservation | null> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("raw", raw).maybeSingle();

        if (error || !data) return null;
        return mapToEntity(data);
    }

    async findByResolution(userId: UUID, resolution: BankNumberResolution): Promise<BankNumberObservation[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("resolution", resolution)
            .eq("is_deleted", false).order("occurrences", { ascending: false });

        if (error) throw new Error(`Error loading observations: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }

    async findResolved(userId: UUID): Promise<BankNumberObservation[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("bank_number_observations").select("*")
            .eq("owner_user_id", userId).eq("is_deleted", false)
            .in("resolution", ["EXACT", "INFERRED", "MANUAL"]);

        if (error) throw new Error(`Error loading observations: ${error.message}`);
        return (data ?? []).map(mapToEntity);
    }
```

- [ ] **Step 4: Escribir la versión in-memory**

En `src/infrastructure/repositories/bank-in-memory.ts`:

```ts
export class InMemoryBankNumberObservationRepository
    extends InMemoryRepository<BankNumberObservation>
    implements IBankNumberObservationRepository {

    async findByOwnerId(userId: UUID): Promise<BankNumberObservation[]> {
        return (await this.findAll()).filter(o => o.ownerUserId === userId);
    }

    async findByRaw(userId: UUID, raw: string): Promise<BankNumberObservation | null> {
        return (await this.findByOwnerId(userId)).find(o => o.raw === raw) ?? null;
    }

    async findByResolution(userId: UUID, resolution: BankNumberResolution): Promise<BankNumberObservation[]> {
        return (await this.findByOwnerId(userId))
            .filter(o => o.resolution === resolution)
            .sort((a, b) => b.occurrences - a.occurrences);
    }

    async findResolved(userId: UUID): Promise<BankNumberObservation[]> {
        return (await this.findByOwnerId(userId))
            .filter(o => ["EXACT", "INFERRED", "MANUAL"].includes(o.resolution));
    }
}
```

- [ ] **Step 5: Cablear el container**

En `src/infrastructure/container.ts`, junto a los otros repos del módulo:

```ts
export const bankObservationRepository = singleton("bankObservationRepo", () => isSupabase
    ? new SupabaseBankNumberObservationRepository()
    : new InMemoryBankNumberObservationRepository());
```

Y añadir los exports en los dos `index.ts` de repositorios.

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: solo los 7 errores preexistentes (`aliases` en `BrandProduct`, `.total` en `PaginatedResult`).

- [ ] **Step 7: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/domain src/infrastructure
git commit -m "feat(bancos): agrega entidad y repositorios de observaciones de numero"
```

---

## Task 5: Servicio de identificación

**Files:**
- Create: `src/application/services/bank-identification-service.ts`
- Modify: `src/infrastructure/container.ts`
- Test: `__tests__/services/bank-identification-service.test.ts`

**Interfaces:**
- Consumes: `bankObservationRepository`, `bankAccountRepository`, `bankCardRepository`, `bankInstitutionRepository`, y las funciones puras de las tasks 2 y 3
- Produce: clase `BankIdentificationService` con `observe`, `identityCandidates`, `pendingGroups`, `assignObservation`, `markExternal`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/services/bank-identification-service.test.ts`:

```ts
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";

const USER = "11111111-1111-4111-8111-111111111111";

async function buildService() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const observations = new InMemoryBankNumberObservationRepository();
    const service = new BankIdentificationService(observations, accounts, cards, institutions);

    const now = new Date().toISOString();
    const stamps = { createdAt: now, updatedAt: now, isDeleted: false };
    const inst = await institutions.create({
        id: crypto.randomUUID(), ownerUserId: USER, name: "Banco del Austro",
        kind: "BANK", isUnconfirmed: false, ...stamps,
    });
    const cuenta = await accounts.create({
        id: crypto.randomUUID(), ownerUserId: USER, institutionId: inst.id,
        name: "Ahorros Principal", accountType: "SAVINGS", lastFour: "0814",
        currency: "USD", status: "ACTIVE", isUnconfirmed: false, ...stamps,
    });

    return { service, observations, accounts, cards, institutions, inst, cuenta };
}

describe("observe", () => {
    it("liga una cadena de 4 dígitos a la cuenta existente como EXACT", async () => {
        const { service, cuenta } = await buildService();
        const result = await service.observe(USER, "******0814");

        expect(result.resolution).toBe("EXACT");
        expect(result.accountId).toBe(cuenta.id);
    });

    it("la misma cadena dos veces no duplica la observación", async () => {
        const { service, observations } = await buildService();
        await service.observe(USER, "******0814");
        await service.observe(USER, "******0814");

        const all = await observations.findByOwnerId(USER);
        expect(all).toHaveLength(1);
        expect(all[0].occurrences).toBe(2);
    });

    it("una máscara nueva del mismo número se liga sola", async () => {
        const { service, cuenta } = await buildService();
        await service.observe(USER, "******0814");
        const otra = await service.observe(USER, "AHO - XXXXXX0814");

        expect(otra.accountId).toBe(cuenta.id);
    });

    it("una cadena sin candidato queda PENDING y no inventa cuenta", async () => {
        const { service, accounts } = await buildService();
        const result = await service.observe(USER, "22XXXXXX99");

        expect(result.resolution).toBe("PENDING");
        expect(result.accountId).toBeNull();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("el guard de prefijo evita ligar 25XXX61 a la Mastercard", async () => {
        const { service, cards, institutions } = await buildService();
        const [inst] = await institutions.findByOwnerId(USER);
        const now = new Date().toISOString();
        await cards.create({
            id: crypto.randomUUID(), ownerUserId: USER, institutionId: inst.id,
            name: "Pacificard", cardType: "CREDIT", bin: "542258", lastFour: "8361",
            prefixDigits: "542258", currency: "USD", status: "ACTIVE",
            isUnconfirmed: false, createdAt: now, updatedAt: now, isDeleted: false,
        });

        const result = await service.observe(USER, "25XXX61");
        expect(result.resolution).toBe("PENDING");
        expect(result.cardId).toBeNull();
    });
});

describe("pendingGroups", () => {
    it("agrupa las pendientes por sufijo y cuenta sus ocurrencias", async () => {
        const { service } = await buildService();
        await service.observe(USER, "22XXXXXX99");
        await service.observe(USER, "22XXXXXX99");
        await service.observe(USER, "00XXXXXX23");

        const groups = await service.pendingGroups(USER);
        const g99 = groups.find(g => g.suffixDigits === "99");
        expect(g99?.occurrences).toBe(2);
        expect(g99?.samples).toContain("22XXXXXX99");
    });
});

describe("assignObservation", () => {
    it("asignar a mano marca MANUAL y liga la identidad", async () => {
        const { service, observations, cuenta } = await buildService();
        const pending = await service.observe(USER, "22XXXXXX99");

        const updated = await service.assignObservation(USER, pending.id, {
            kind: "ACCOUNT", targetId: cuenta.id,
        });

        expect(updated.resolution).toBe("MANUAL");
        expect(updated.accountId).toBe(cuenta.id);
        expect((await observations.findByRaw(USER, "22XXXXXX99"))?.accountId).toBe(cuenta.id);
    });

    it("marcar como ajena no crea ninguna identidad", async () => {
        const { service, accounts } = await buildService();
        const pending = await service.observe(USER, "XXXXXX6655");

        const updated = await service.markExternal(USER, pending.id);

        expect(updated.resolution).toBe("EXTERNAL");
        expect(updated.accountId).toBeNull();
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-identification-service.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir el servicio**

Crear `src/application/services/bank-identification-service.ts`. Núcleo del diseño:

```ts
import { randomUUID } from "crypto";
import type { UUID } from "@/domain/core";
import type { BankNumberObservation, BankAccount, BankCard } from "@/domain/entities/bank";
import type {
    IBankNumberObservationRepository, IBankAccountRepository,
    IBankCardRepository, IBankInstitutionRepository,
} from "@/domain/repositories/bank";
import { parseBankNumber, type NumberFingerprint } from "@/lib/bank-number-fingerprint";
import {
    resolveFingerprint, mergeFingerprints, type IdentityCandidate,
} from "@/lib/bank-number-match";

export interface PendingGroup {
    suffixDigits: string;
    prefixDigits: string;
    occurrences: number;
    /** Las cadenas crudas del grupo, como evidencia para el usuario. */
    samples: string[];
    observationIds: UUID[];
    /** Identidades compatibles, cuando hay más de una. */
    candidateIds: UUID[];
    institutionHint: string | null;
    brand: string | null;
    accountTypeHint: string | null;
}

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
     * Si el `raw` exacto ya se vio, solo incrementa el contador y reutiliza el
     * vínculo: **cada máscara se aprende una sola vez**, y a partir de ahí el
     * emparejamiento es una lectura directa.
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
        const candidates = await this.identityCandidates(userId);
        const resolved = resolveFingerprint(fingerprint, candidates);

        const now = new Date().toISOString();
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
            createdAt: now, updatedAt: now, isDeleted: false,
        });
    }

    /**
     * Las identidades del usuario con su huella acumulada: lo que cada cuenta o
     * tarjeta sabe de su propio número, sumando lo declarado en el alta y todo
     * lo que aportaron sus observaciones ya resueltas.
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

    // pendingGroups, assignObservation y markExternal: ver los pasos siguientes.
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
```

- [ ] **Step 4: Añadir `pendingGroups`**

Agrupa las `PENDING` por `(prefixDigits, suffixDigits)`, que es lo que el usuario reconoce a simple vista:

```ts
    async pendingGroups(userId: UUID): Promise<PendingGroup[]> {
        const [pending, candidates] = await Promise.all([
            this.observations.findByResolution(userId, "PENDING"),
            this.identityCandidates(userId),
        ]);

        const byKey = new Map<string, PendingGroup>();

        for (const observation of pending) {
            const key = `${observation.prefixDigits}|${observation.suffixDigits}`;
            const group = byKey.get(key) ?? {
                suffixDigits: observation.suffixDigits,
                prefixDigits: observation.prefixDigits,
                occurrences: 0, samples: [], observationIds: [], candidateIds: [],
                institutionHint: null, brand: null, accountTypeHint: null,
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
```

- [ ] **Step 5: Añadir `assignObservation` y `markExternal`**

```ts
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
    async markExternal(userId: UUID, observationId: UUID): Promise<BankNumberObservation> {
        const observation = await this.requireObservation(userId, observationId);
        return this.observations.update({
            ...observation,
            accountId: null, cardId: null,
            resolution: "EXTERNAL",
            updatedAt: new Date().toISOString(),
        });
    }

    private async requireObservation(userId: UUID, id: UUID): Promise<BankNumberObservation> {
        const found = await this.observations.findById(id);
        if (!found || found.ownerUserId !== userId) throw new Error("Observación no encontrada");
        return found;
    }
```

- [ ] **Step 6: Cablear el servicio**

En `src/infrastructure/container.ts`:

```ts
export const bankIdentificationService = new BankIdentificationService(
    bankObservationRepository, bankAccountRepository, bankCardRepository, bankInstitutionRepository,
);
```

- [ ] **Step 7: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-identification-service.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/application/services/bank-identification-service.ts src/infrastructure/container.ts __tests__/services/bank-identification-service.test.ts
git commit -m "feat(bancos): agrega servicio de identificacion de numeros"
```

---

## Task 6: Cascada de auto-creación al capturar

**Files:**
- Modify: `src/application/services/bank-service.ts`
- Modify: `src/application/services/financial-inbox-service.ts`
- Modify: `src/infrastructure/container.ts`
- Test: `__tests__/services/bank-autocreate.test.ts`

**Interfaces:**
- Produce: `BankService.resolveScannedAccounts(userId, scan)` → `{ bankSourceAccountId, bankDestinationAccountId, bankCardId, bankInstitutionId, bankCounterpartyObservationId }`

**La regla de propiedad:** una cuenta detectada se vuelve identidad propia solo si aparece como `origen` al menos una vez — solo se puede enviar dinero desde una cuenta propia. Las que solo salen como `destino` quedan `EXTERNAL` y se referencian desde la transacción.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/services/bank-autocreate.test.ts`:

Crear `__tests__/services/bank-autocreate.test.ts`:

```ts
import { BankService } from "@/application/services/bank-service";
import { BankIdentificationService } from "@/application/services/bank-identification-service";
import {
    InMemoryBankInstitutionRepository, InMemoryBankAccountRepository,
    InMemoryBankCardRepository, InMemoryBankAccountBalanceSnapshotRepository,
    InMemoryBankCardStatementRepository, InMemoryBankMovementRepository,
    InMemoryBankNumberObservationRepository,
} from "@/infrastructure/repositories/bank-in-memory";
import { InMemoryFinancialTransactionRepository } from "@/infrastructure/repositories/implementations";

const USER = "11111111-1111-4111-8111-111111111111";

interface ScannedAccount { type: string; account: string; }

async function buildService() {
    const institutions = new InMemoryBankInstitutionRepository();
    const accounts = new InMemoryBankAccountRepository();
    const cards = new InMemoryBankCardRepository();
    const snapshots = new InMemoryBankAccountBalanceSnapshotRepository();
    const statements = new InMemoryBankCardStatementRepository();
    const transactions = new InMemoryFinancialTransactionRepository();
    const movements = new InMemoryBankMovementRepository(transactions, cards, statements);
    const observations = new InMemoryBankNumberObservationRepository();

    const identification = new BankIdentificationService(observations, accounts, cards, institutions);
    const service = new BankService(
        institutions, accounts, cards, snapshots, statements, movements, transactions, identification,
    );

    const inst = await service.createInstitution(USER, { name: "Banco del Austro", kind: "BANK" });
    return { service, identification, observations, accounts, cards, institutions, inst };
}

function scan(accounts: ScannedAccount[], merchant = "Banco del Austro") {
    return { accounts, merchant, currency: "USD" };
}

describe("resolveScannedAccounts", () => {
    it("el origen de un gasto se vuelve identidad propia", async () => {
        const { service, accounts } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "AHO - XXXXXX0814" }]),
        );

        expect(result.bankSourceAccountId).toBeTruthy();
        const created = await accounts.findById(result.bankSourceAccountId!);
        expect(created).toMatchObject({
            lastFour: "0814", accountType: "SAVINGS", isUnconfirmed: true,
        });
    });

    it("un destino que nunca aparece como origen queda EXTERNAL", async () => {
        const { service, accounts, observations } = await buildService();

        const result = await service.resolveScannedAccounts(USER, scan([
            { type: "origen", account: "XXXXXX0814" },
            { type: "destino", account: "XXXXXX6655" },
        ]));

        expect(result.bankSourceAccountId).toBeTruthy();
        expect(result.bankDestinationAccountId).toBeNull();
        expect(result.bankCounterpartyObservationId).toBeTruthy();

        const ajena = await observations.findByRaw(USER, "XXXXXX6655");
        expect(ajena?.resolution).toBe("EXTERNAL");
        // Solo la propia existe como cuenta.
        expect(await accounts.findByOwnerId(USER)).toHaveLength(1);
    });

    it("una transferencia entre dos cuentas propias liga ambas", async () => {
        const { service, inst } = await buildService();
        const origen = await service.createAccount(USER, {
            institutionId: inst.id, name: "Ahorros", accountType: "SAVINGS", lastFour: "0814",
        });
        const destino = await service.createAccount(USER, {
            institutionId: inst.id, name: "Corriente", accountType: "CHECKING", lastFour: "9511",
        });
        // El destino ya es propio porque fue origen antes.
        await service.resolveScannedAccounts(USER, scan([{ type: "origen", account: "XXXXXX9511" }]));

        const result = await service.resolveScannedAccounts(USER, scan([
            { type: "origen", account: "XXXXXX0814" },
            { type: "destino", account: "XXXXXX9511" },
        ]));

        expect(result.bankSourceAccountId).toBe(origen.id);
        expect(result.bankDestinationAccountId).toBe(destino.id);
    });

    it("el banco sale del merchant cuando coincide con una institución conocida", async () => {
        const { service, inst } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "XXXXXX0814" }], "Banco del Austro"),
        );

        expect(result.bankInstitutionId).toBe(inst.id);
    });

    it("una cadena ambigua no crea nada y deja la transacción sin cuenta", async () => {
        const { service, inst, accounts, observations } = await buildService();
        await service.createAccount(USER, {
            institutionId: inst.id, name: "A", accountType: "SAVINGS", lastFour: "4058",
        });
        await service.createAccount(USER, {
            institutionId: inst.id, name: "B", accountType: "SAVINGS", lastFour: "9558",
        });
        const antes = (await accounts.findByOwnerId(USER)).length;

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "28XXX58" }]),
        );

        expect(result.bankSourceAccountId).toBeNull();
        expect((await observations.findByRaw(USER, "28XXX58"))?.resolution).toBe("PENDING");
        expect(await accounts.findByOwnerId(USER)).toHaveLength(antes);
    });

    it("un consumo con tarjeta liga la tarjeta, no una cuenta", async () => {
        const { service, cards } = await buildService();

        const result = await service.resolveScannedAccounts(
            USER, scan([{ type: "origen", account: "493176XXXXXX2780" }]),
        );

        expect(result.bankCardId).toBeTruthy();
        expect(result.bankSourceAccountId).toBeNull();
        const created = await cards.findById(result.bankCardId!);
        expect(created).toMatchObject({ bin: "493176", lastFour: "2780", isUnconfirmed: true });
    });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-autocreate.test.ts`
Expected: FAIL — `resolveScannedAccounts` no existe.

- [ ] **Step 3: Implementar la cascada**

`BankIdentificationService` se suma como octava dependencia de `BankService`. Añadir:

```ts
export interface ScannedAccountEntry {
    /** "origen" | "destino", tal cual lo escribe el escáner. */
    type: string;
    account: string;
}

export interface ScannedTransactionInput {
    accounts: ScannedAccountEntry[];
    merchant?: string | null;
    currency?: string | null;
}

export interface ResolvedBankLinks {
    bankSourceAccountId: UUID | null;
    bankDestinationAccountId: UUID | null;
    bankCardId: UUID | null;
    bankInstitutionId: UUID | null;
    /** La cuenta del otro lado cuando no es del usuario. */
    bankCounterpartyObservationId: UUID | null;
}

/** Sufijo mínimo para crear una identidad sin preguntar. */
const AUTOCREATE_MIN_SUFFIX = 4;

/**
 * Resuelve a qué cuenta o tarjeta pertenece cada número de un escaneo, creando
 * las identidades que falten.
 *
 * La regla de propiedad manda: una cuenta se vuelve identidad propia solo si
 * aparece como **origen**, porque solo se puede enviar dinero desde una cuenta
 * propia. Las que solo salen como destino son de un tercero y quedan como
 * observación `EXTERNAL`, referenciada desde la transacción para que el detalle
 * pueda mostrar a dónde fue el dinero.
 */
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
        const isOrigin = entry.type?.toLowerCase().startsWith("orig");

        // Solo el origen puede fundar una identidad propia.
        if (isOrigin
            && observation.resolution === "PENDING"
            && observation.suffixDigits.length >= AUTOCREATE_MIN_SUFFIX
            && institutionId) {
            await this.createIdentityFrom(userId, observation, institutionId, scan.currency);
            // Re-observar para que quede ligada a lo recién creado.
            observation = await this.identification.reobserve(userId, raw);
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

        // Sin identidad y no es origen: es de un tercero.
        if (!isOrigin) {
            if (observation.resolution === "PENDING") {
                observation = await this.identification.markExternal(userId, observation.id);
            }
            links.bankCounterpartyObservationId = observation.id;
        }
    }

    return links;
}

/** Crea la cuenta o la tarjeta que la observación describe, sin confirmar. */
private async createIdentityFrom(
    userId: UUID, observation: BankNumberObservation,
    institutionId: UUID, currency?: string | null,
): Promise<void> {
    const common = {
        lastFour: observation.suffixDigits,
        prefixDigits: observation.prefixDigits || null,
        currency: currency ?? "USD",
    };

    // Un BIN de 6 dígitos solo lo tienen las tarjetas.
    if (observation.bin) {
        const card = await this.createCard(userId, {
            institutionId,
            name: [observation.brand, `••••${observation.suffixDigits}`].filter(Boolean).join(" "),
            cardType: "CREDIT",
            brand: observation.brand ?? null,
            bin: observation.bin,
            ...common,
        });
        await this.cards.update({ ...card, isUnconfirmed: true });
        return;
    }

    const account = await this.createAccount(userId, {
        institutionId,
        name: `Cuenta ••••${observation.suffixDigits}`,
        accountType: (observation.accountTypeHint as BankAccountType) ?? "SAVINGS",
        ...common,
    });
    await this.accounts.update({ ...account, isUnconfirmed: true });
}

/**
 * El emisor del movimiento. Sale del nombre embebido en la cadena o del
 * merchant del escaneo; si no existe todavía, se crea sin confirmar junto a su
 * puente al comercio gemelo.
 */
private async resolveInstitution(
    userId: UUID, scan: ScannedTransactionInput,
): Promise<UUID | null> {
    const name = scan.merchant?.trim();
    if (!name) return null;

    const existing = await this.institutions.findByName(userId, name);
    if (existing) return existing.id;

    // Solo se crea cuando el nombre suena a emisor: un escaneo de FARMASHOP no
    // debe fundar un banco llamado FARMASHOP.
    if (!/banco|coop|coac|cooperativa|mutualista|billetera|pacificard/i.test(name)) return null;

    const created = await this.createInstitution(userId, {
        name,
        kind: /coop|coac|cooperativa/i.test(name) ? "COOPERATIVE" : "BANK",
    });
    await this.institutions.update({ ...created, isUnconfirmed: true });
    return created.id;
}
```

`BankIdentificationService` necesita un método más para el re-ligado:

```ts
/** Re-resuelve una observación ya registrada contra las identidades actuales. */
async reobserve(userId: UUID, raw: string): Promise<BankNumberObservation> {
    const observation = await this.observations.findByRaw(userId, raw);
    if (!observation) return this.observe(userId, raw);
    if (observation.resolution === "MANUAL" || observation.resolution === "EXTERNAL") {
        return observation;
    }

    const resolved = resolveFingerprint(
        parseBankNumber(raw), await this.identityCandidates(userId),
    );
    return this.observations.update({
        ...observation,
        accountId: resolved.targetKind === "ACCOUNT" ? resolved.targetId : null,
        cardId: resolved.targetKind === "CARD" ? resolved.targetId : null,
        resolution: resolved.resolution,
        updatedAt: new Date().toISOString(),
    });
}
```

- [ ] **Step 4: Conectar al flujo de inbox**

En `FinancialInboxService.mapAndConfirmTransaction`, antes de construir la transacción, llamar a `resolveScannedAccounts` con el `accounts` jsonb del escaneo y volcar el resultado en las columnas `bank_*`. Lo que el usuario eligió a mano en el wizard **gana** sobre lo resuelto automáticamente.

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-autocreate.test.ts && npm test`
Expected: los nuevos pasan y las 75 suites siguen verdes.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/application __tests__/services/bank-autocreate.test.ts
git commit -m "feat(bancos): auto-crea y liga cuentas al confirmar un escaneo"
```

---

## Task 7: Backfill del historial

**Files:**
- Create: `supabase/migrations/20260813120100_bank_backfill_observations.sql`

**Interfaces:**
- Produce: `bank_number_observations` poblada desde el historial, todas en `PENDING`

**Por qué SQL y no un script:** la migración corre una vez, es idempotente por el índice único `(owner_user_id, raw)`, y deja el resultado auditable en la misma base. No liga nada: solo registra lo visto. La resolución la hace el servicio en la Task 8.

- [ ] **Step 1: Escribir la migración**

```sql
-- Puebla las observaciones desde el historial de escaneos. No liga ninguna
-- identidad: eso lo decide el servicio, que sabe de compatibilidad. Aquí solo
-- se registra qué cadenas se han visto y cuántas veces.
INSERT INTO bank_number_observations (owner_user_id, raw, occurrences, resolution)
SELECT owner.id,
       x.raw,
       count(*),
       'PENDING'
FROM (
    SELECT s.owner_user_id AS scanner_owner,
           jsonb_array_elements(s.accounts)->>'account' AS raw
    FROM financial_scanner_transactions s
    WHERE s.accounts IS NOT NULL AND jsonb_array_length(s.accounts) > 0
) x
CROSS JOIN LATERAL (
    -- financial_scanner_transactions.owner_user_id es TEXT, no uuid.
    SELECT u.id FROM auth.users u WHERE u.id::text = x.scanner_owner
) owner
WHERE x.raw IS NOT NULL AND btrim(x.raw) <> ''
GROUP BY owner.id, x.raw
ON CONFLICT (owner_user_id, raw) DO NOTHING;
```

- [ ] **Step 2: Aplicar la migración**

`apply_migration`, nombre `bank_backfill_observations`.

- [ ] **Step 3: Verificar contra las cifras conocidas**

```sql
SELECT count(*) AS variantes, sum(occurrences) AS ocurrencias
FROM bank_number_observations;
```
Esperado: **98 variantes, 739 ocurrencias**. Si sale menos, el `owner_user_id` de algún escaneo no casó con `auth.users` — investigar antes de seguir, no ajustar el número esperado.

```sql
SELECT resolution, count(*) FROM bank_number_observations GROUP BY resolution;
```
Esperado: 98 en `PENDING`.

- [ ] **Step 4: Commit** *(requiere permiso explícito del usuario)*

```bash
git add supabase/migrations/20260813120100_bank_backfill_observations.sql
git commit -m "feat(bancos): puebla las observaciones desde el historial de escaneos"
```

---

## Task 8: Parseo y resolución del historial

**Files:**
- Modify: `src/application/services/bank-identification-service.ts`
- Create: `src/app/actions/bank-reconcile.ts`
- Test: extender `__tests__/services/bank-identification-service.test.ts`

**Interfaces:**
- Produce: `BankIdentificationService.reparseAll(userId)`; acciones `getReconcileStateAction`, `assignObservationAction`, `markExternalAction`, `createIdentityFromGroupAction`, `confirmReconcileAction`

- [ ] **Step 1: Escribir el test de `reparseAll`**

```ts
describe("reparseAll", () => {
    it("rellena las partes de las observaciones que llegaron sin parsear", async () => {
        const { service, observations } = await buildService();
        const now = new Date().toISOString();
        // Como las deja el backfill: raw y occurrences, nada más.
        await observations.create({
            id: crypto.randomUUID(), ownerUserId: USER, raw: "493176XXXXXX2780",
            prefixDigits: "", suffixDigits: "", isComplete: false,
            resolution: "PENDING", occurrences: 97,
            createdAt: now, updatedAt: now, isDeleted: false,
        });

        await service.reparseAll(USER);

        const updated = await observations.findByRaw(USER, "493176XXXXXX2780");
        expect(updated).toMatchObject({
            prefixDigits: "493176", suffixDigits: "2780", bin: "493176",
        });
    });

    it("no pisa lo que el usuario ya asignó a mano", async () => {
        const { service, observations, cuenta } = await buildService();
        const obs = await service.observe(USER, "22XXXXXX99");
        await service.assignObservation(USER, obs.id, { kind: "ACCOUNT", targetId: cuenta.id });

        await service.reparseAll(USER);

        const after = await observations.findByRaw(USER, "22XXXXXX99");
        expect(after?.resolution).toBe("MANUAL");
        expect(after?.accountId).toBe(cuenta.id);
    });
});
```

- [ ] **Step 2: Implementar `reparseAll`**

Recorre las observaciones del usuario, re-parsea cada `raw`, actualiza las partes, y re-resuelve **solo** las que están en `PENDING` — `MANUAL` y `EXTERNAL` son decisiones del usuario y no se tocan. Es idempotente: correrla dos veces da el mismo resultado.

- [ ] **Step 3: Escribir las server actions**

Crear `src/app/actions/bank-reconcile.ts` siguiendo el patrón de `src/app/actions/bank.ts` (el helper `run`, `requireUserId`, Zod, `revalidatePath`). El tipo que la pantalla consume:

```ts
export interface ReconcileGroup {
    /** `${prefixDigits}|${suffixDigits}`, estable entre recargas. */
    key: string;
    prefixDigits: string;
    suffixDigits: string;
    /** Veces que se vio la cadena. */
    occurrences: number;
    /** Transacciones que se re-apuntarían al confirmar este grupo. */
    transactions: number;
    /** Las cadenas crudas, como evidencia. */
    samples: string[];
    observationIds: string[];
    /** Identidades compatibles. Con más de una, el grupo es ambiguo. */
    candidateIds: string[];
    institutionHint: string | null;
    brand: string | null;
    accountTypeHint: string | null;
    /** Solo lo que aparece como origen puede ser una cuenta propia. */
    appearsAsOrigin: boolean;
    kind: "ACCOUNT" | "CARD" | null;
    /** Por qué se ligó. Presente solo en las inferidas. */
    evidence?: string;
}

export interface ReconcileIdentity {
    id: string;
    kind: "ACCOUNT" | "CARD";
    /** Nombre y número ya formateados, listos para mostrar. */
    label: string;
}

export interface ReconcileState {
    exact: ReconcileGroup[];
    inferred: ReconcileGroup[];
    pending: ReconcileGroup[];
    /** Todas las identidades del usuario, para los selectores de los ambiguos. */
    identities: ReconcileIdentity[];
    totalMovements: number;
}
```

Acciones:

- `getReconcileStateAction()` → `ReconcileState`. Mapea los `PendingGroup` del servicio añadiendo `key`, `transactions`, `kind` y `evidence`, y arma `identities` con `formatBankNumber`.
- `assignObservationAction(observationId, { kind, targetId })`
- `markExternalAction(observationId)`
- `createIdentityFromGroupAction(input)` — crea la cuenta o tarjeta desde un grupo y liga todas sus observaciones.
- `confirmReconcileAction()` — re-apunta en bloque las transacciones cuyo `accounts` jsonb contiene una observación ya resuelta, y quita `isUnconfirmed` de las identidades tocadas.

- [ ] **Step 4: Verificar**

Run: `npx jest --config jest.unit.config.js __tests__/services/bank-identification-service.test.ts && npx tsc --noEmit`
Expected: tests verdes, solo los 7 errores preexistentes de tipos.

- [ ] **Step 5: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/application src/app/actions/bank-reconcile.ts __tests__/services
git commit -m "feat(bancos): re-parsea el historial y agrega acciones de conciliacion"
```

---

## Task 9: Pantalla de conciliación

**Files:**
- Create: `src/app/financial/banks/reconcile/page.tsx`
- Create: `src/app/financial/banks/reconcile/loading.tsx`
- Create: `src/presentation/bank/components/ReconcileClient.tsx`
- Create: `src/presentation/bank/components/ReconcileGroupCard.tsx`
- Test: `__tests__/components/bank-reconcile.test.tsx`

**Interfaces:**
- Consumes: las acciones de la Task 8, `formatBankNumber`, `SegmentedChoice`
- Produce: `ReconcileClient`, `ReconcileGroupCard`

**Tres secciones, en orden de esfuerzo:** resueltas (solo nombrar), inferidas (con su evidencia a la vista), pendientes (ambiguas y sin candidato).

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/bank-reconcile.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ReconcileClient } from "@/presentation/bank/components/ReconcileClient";
import type { ReconcileState } from "@/app/actions/bank-reconcile";

jest.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const state: ReconcileState = {
    exact: [{
        key: "|0814", suffixDigits: "0814", prefixDigits: "",
        occurrences: 52, transactions: 52,
        samples: ["XXXXXX0814", "******0814", "AHO - XXXXXX0814"],
        observationIds: ["o1", "o2", "o3"], candidateIds: [],
        institutionHint: "Banco del Austro", brand: null, accountTypeHint: "SAVINGS",
        appearsAsOrigin: true, kind: "ACCOUNT",
    }],
    inferred: [{
        key: "542258|361", suffixDigits: "361", prefixDigits: "542258",
        occurrences: 22, transactions: 22,
        samples: ["****361", "542258XXXXXXX361", "Mastercard 8361"],
        observationIds: ["o4"], candidateIds: ["c1"],
        institutionHint: null, brand: "Mastercard", accountTypeHint: null,
        appearsAsOrigin: true, kind: "CARD",
        evidence: "361 es sufijo de 8361 y no hay otro candidato",
    }],
    pending: [{
        key: "22|58", suffixDigits: "58", prefixDigits: "22",
        occurrences: 9, transactions: 9,
        samples: ["22XXXXXX58", "28XXX58"],
        observationIds: ["o5"], candidateIds: ["a3", "a4"],
        institutionHint: null, brand: null, accountTypeHint: null,
        appearsAsOrigin: false, kind: null,
    }],
    identities: [
        { id: "a3", kind: "ACCOUNT", label: "Ahorros ••••9558" },
        { id: "a4", kind: "ACCOUNT", label: "Corriente ••••4058" },
        { id: "c1", kind: "CARD", label: "Pacificard XXXX8361" },
    ],
    totalMovements: 83,
};

describe("ReconcileClient", () => {
    it("agrupa en resueltas, inferidas y pendientes", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/resueltas/i)).toBeInTheDocument();
        expect(screen.getByText(/inferidas/i)).toBeInTheDocument();
        expect(screen.getByText(/pendientes/i)).toBeInTheDocument();
    });

    it("una inferida muestra por qué se ligó", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/361 es sufijo de 8361/)).toBeInTheDocument();
    });

    it("una ambigua ofrece sus candidatos y no preselecciona ninguno", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText("Ahorros ••••9558")).toBeInTheDocument();
        expect(screen.getByText("Corriente ••••4058")).toBeInTheDocument();
        // Ninguno viene marcado: elegir es del usuario.
        for (const b of screen.getAllByRole("button", { pressed: true })) {
            expect(b).not.toHaveTextContent(/9558|4058/);
        }
    });

    it("las cadenas crudas se muestran como evidencia", () => {
        // Es la única pantalla donde el raw sale a la superficie.
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText("AHO - XXXXXX0814")).toBeInTheDocument();
        expect(screen.getByText("542258XXXXXXX361")).toBeInTheDocument();
    });

    it("dice cuántos movimientos re-apuntará al confirmar", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/83 movimientos/)).toBeInTheDocument();
    });

    it("avisa que nada entra a los saldos antes de confirmar", () => {
        render(<ReconcileClient initialData={state} />);
        expect(screen.getByText(/no entra a tus saldos hasta que lo confirmes/i)).toBeInTheDocument();
    });

    it("sin nada que conciliar muestra el estado vacío", () => {
        render(<ReconcileClient initialData={{
            exact: [], inferred: [], pending: [], identities: [], totalMovements: 0,
        }} />);
        expect(screen.getByText(/no hay nada que conciliar/i)).toBeInTheDocument();
    });
});
```

`ReconcileState` y `ReconcileGroup` se exportan desde `src/app/actions/bank-reconcile.ts`; el fixture de arriba fija su forma exacta.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- __tests__/components/bank-reconcile.test.tsx`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Escribir los componentes**

`ReconcileGroupCard` recibe un grupo y renderiza: el número formateado como título, la píldora de resolución y el conteo de transacciones, las cadenas crudas en mono como evidencia, las pistas (banco sugerido, tipo, marca), y las acciones según la sección —crear cuenta, fusionar, es ajena— o los candidatos cuando hay varios.

`ReconcileClient` monta la cabecera con el conteo, las tres secciones, y el botón de confirmar con el total de movimientos a re-apuntar. Nada entra a ningún saldo antes de confirmar, y el texto lo dice.

- [ ] **Step 4: Escribir la ruta**

`page.tsx` llama `getReconcileStateAction()` y pasa el resultado; `loading.tsx` usa `RouteLoading`, igual que las otras rutas del módulo.

- [ ] **Step 5: Verificar**

Run: `npm test && npm run build`
Expected: todo verde, `/financial/banks/reconcile` en la lista de rutas.

- [ ] **Step 6: Commit** *(requiere permiso explícito del usuario)*

```bash
git add src/app/financial/banks/reconcile src/presentation/bank __tests__/components/bank-reconcile.test.tsx
git commit -m "feat(bancos): agrega pantalla de conciliacion del historial"
```

---

## Verificación final

- [ ] **Suite completa**

Run: `npm test`
Expected: 0 fallos. La línea base tras el primer plan es **75 suites / 581 tests en verde**; este plan solo suma.

- [ ] **Config de unidad**

Run: `npx jest --config jest.unit.config.js`
Expected: 0 fallos.

- [ ] **Tipos y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: los 7 errores de tipos preexistentes y ninguno nuevo; lint sin errores nuevos.

- [ ] **Build**

Run: `npm run build`
Expected: compila; `/financial/banks/reconcile` aparece entre las rutas.

- [ ] **Recorrido manual**

1. `/financial/banks` muestra el aviso con el conteo real de sin identificar.
2. La conciliación lista las tres secciones con las cadenas crudas visibles.
3. Nombrar un grupo resuelto crea la cuenta y la liga.
4. Una inferida muestra la evidencia que la ligó y se puede separar.
5. Una ambigua ofrece sus candidatos sin preseleccionar.
6. Confirmar re-apunta las transacciones y el saldo de la cuenta cambia.
7. Confirmar un escaneo nuevo liga la cuenta sola, sin pasar por conciliación.

- [ ] **Verificar contra la base**

```sql
SELECT resolution, count(*), sum(occurrences)
FROM bank_number_observations GROUP BY resolution ORDER BY 2 DESC;
```
Esperado tras conciliar: la mayoría en `EXACT`/`INFERRED`/`MANUAL`, un puñado en `EXTERNAL`, y `PENDING` solo con los grupos que el usuario dejó fuera.

- [ ] **Actualizar el grafo**

Run: `graphify update .`

---

## Riesgos

- **El backfill depende de que `financial_scanner_transactions.owner_user_id` (TEXT) case con `auth.users.id`.** Si algún escaneo trae un valor que no es un uuid, esa fila se pierde en silencio por el `CROSS JOIN LATERAL`. El Step 3 de la Task 7 lo detecta comparando contra 98/739; si no cuadra, hay que mirar antes de seguir.
- **Las observaciones `INFERRED` cuentan hacia los saldos sin esperar revisión**, según la decisión de §3.1 de la spec. El costo de equivocarse es un saldo desviado hasta que se corrija; la mitigación es que la conciliación las lista con su evidencia.
- **Las 110 transacciones sin join** (384 − 274) necesitan regex sobre `origin_stats->>'emailBody'`. No está en este plan: primero conviene ver cuánto resuelve el join, que es la fuente estructurada. Si el resultado deja demasiado historial fuera, se añade como tarea aparte.
