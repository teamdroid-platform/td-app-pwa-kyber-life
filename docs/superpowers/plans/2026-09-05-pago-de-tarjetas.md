# Pago de tarjetas de crédito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la deuda de una tarjeta de crédito baje cuando el usuario la paga, ya sea confirmando un pago que la app ya tenía capturado o registrando uno nuevo desde la pantalla de la tarjeta.

**Architecture:** Una columna nueva `bank_card_payment_id` en `financial_transactions` dice explícitamente "esta transacción paga esta tarjeta", y la vista `bank_movements` emite `PAYMENT` a partir de ella o del estado de cuenta, con `LEFT JOIN` + `COALESCE` para que nunca emita dos filas por la misma transacción. La detección de pagos ya capturados vive en funciones puras de dominio que reusan la maquinaria de huellas (`bank-number-fingerprint.ts`, `bank-number-match.ts`) en vez de escribir un segundo emparejador. Un único método de aplicación, `BankService.payCard`, sirve a los dos caminos de pago y reparte el importe entre el estado abierto y la deuda corriente.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind v4, shadcn/ui, Supabase (Postgres + RLS), Zod 4, Jest (`next/jest`, jsdom y node).

**Spec:** [docs/superpowers/specs/2026-09-05-pago-de-tarjetas-design.md](../specs/2026-09-05-pago-de-tarjetas-design.md)

## Global Constraints

- **TypeScript estricto.** Nada de `any` salvo necesidad estricta y justificada en comentario.
- **Clean Architecture.** Dirección de dependencias: `app`/`presentation` → `application` → `domain`. `infrastructure` implementa interfaces de `domain`. Nada de `domain` importa framework.
- **Todo repositorio nuevo o método nuevo se implementa en los dos lados**: Supabase (`src/infrastructure/repositories/supabase/`) y en memoria (`src/infrastructure/repositories/`), y se cablea en `src/infrastructure/container.ts`.
- **Server Actions**: validar con Zod desde `src/lib/validators/`, resolver el usuario con `requireUserId()`, llamar al servicio del container, devolver `{ success: true, data }` o `{ success: false, error }`. Nunca lanzar al cliente. El helper `run()` de `src/app/actions/bank.ts` ya hace las tres cosas.
- **Migraciones**: todo DDL va a `supabase/migrations/NNN_*.sql` y se aplica con el MCP de Supabase (`apply_migration`), nunca ad-hoc. Proyecto KyberLife, `xywkuwmhnfcdksamuypk`.
- **Commits locales sí; push, PR, merge y deploy solo con permiso explícito del usuario.**
- **Conventional Commits** en minúscula e imperativo, en español, scope `bancos`.
- **Mobile-first obligatorio**, y los cambios visuales preservan la estética existente.
- **Los tests corren con** `npx jest <ruta>`; el config node-only es `npx jest --config jest.unit.config.js` y solo recoge `*.test.ts` (los `.tsx` necesitan el config con jsdom, que es el de por defecto).
- **Rama de trabajo:** `feat/pago-tarjetas`.

---

### Task 1: `allocatePayment` — el reparto de un pago

Una función pura que decide cuánto de un pago abona el estado de cuenta abierto y cuánto baja la deuda corriente. Es el corazón de la regla que eligió el usuario y no necesita base de datos para probarse.

**Files:**
- Modify: `src/domain/services/bank-balance.ts`
- Test: `__tests__/domain/bank-balance.test.ts`

**Interfaces:**
- Consumes: `computeStatementDue(statement: BankCardStatement): number` y el `round2` privado, ambos ya en `bank-balance.ts`.
- Produces: `allocatePayment(amount: number, openStatement: BankCardStatement | null): { toStatement: number; toDebt: number }`.

- [ ] **Step 1: Escribir los tests que fallan**

Si `__tests__/domain/bank-balance.test.ts` ya existe, añadir este bloque al final; si no, crear el archivo con este contenido más los imports.

```ts
import { allocatePayment } from "@/domain/services/bank-balance";
import type { BankCardStatement } from "@/domain/entities/bank";

/** Un estado de cuenta mínimo con el pendiente que se le pida. */
function statement(due: number, paid = 0): BankCardStatement {
    return {
        id: "s1", ownerUserId: "u1", cardId: "c1",
        periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
        computedAmount: due + paid, totalAmount: null, paidAmount: paid, status: "OPEN",
        createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", isDeleted: false,
    } as BankCardStatement;
}

describe("allocatePayment", () => {
    it("sin estado abierto, todo el pago baja la deuda", () => {
        expect(allocatePayment(534.56, null)).toEqual({ toStatement: 0, toDebt: 534.56 });
    });

    it("el estado absorbe lo suyo y el resto baja la deuda", () => {
        expect(allocatePayment(200, statement(180))).toEqual({ toStatement: 180, toDebt: 20 });
    });

    it("un pago menor que el pendiente va entero al estado", () => {
        expect(allocatePayment(50, statement(180))).toEqual({ toStatement: 50, toDebt: 0 });
    });

    it("un estado ya saldado no absorbe nada", () => {
        expect(allocatePayment(100, statement(0, 180))).toEqual({ toStatement: 0, toDebt: 100 });
    });

    it("redondea a centavos en vez de arrastrar ruido de floats", () => {
        expect(allocatePayment(0.3, statement(0.1))).toEqual({ toStatement: 0.1, toDebt: 0.2 });
    });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/domain/bank-balance.test.ts -t "allocatePayment"`
Expected: FAIL — `allocatePayment is not a function` (o error de import).

- [ ] **Step 3: Implementar**

Añadir al final de `src/domain/services/bank-balance.ts`:

```ts
/**
 * Cómo se reparte un pago entre el estado de cuenta abierto y la deuda
 * corriente.
 *
 * El estado cobra primero porque es lo que tiene fecha de vencimiento; lo que
 * sobra baja la deuda histórica. Sin estado abierto —una tarjeta sin día de
 * corte configurado— el pago entero va contra la deuda, que es el caso normal
 * mientras el usuario no declara el ciclo de su tarjeta.
 */
export function allocatePayment(
    amount: number,
    openStatement: BankCardStatement | null,
): { toStatement: number; toDebt: number } {
    const due = openStatement ? computeStatementDue(openStatement) : 0;
    const toStatement = round2(Math.max(0, Math.min(amount, due)));
    return { toStatement, toDebt: round2(amount - toStatement) };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/domain/bank-balance.test.ts`
Expected: PASS, incluidos los tests que ya existían en el archivo.

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/bank-balance.ts __tests__/domain/bank-balance.test.ts
git commit -m "feat(bancos): repartir un pago entre el estado abierto y la deuda"
```

---

### Task 2: Detección — intención y número

Decidir si una descripción habla de un pago **a** una tarjeta, y sacarle el número de tarjeta al texto. Dos funciones puras, sin base de datos y sin conocimiento de las tarjetas del usuario.

**Files:**
- Create: `src/domain/services/card-payment-detection.ts`
- Test: `__tests__/domain/card-payment-detection.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `isPaymentToCard(text: string): boolean` y `extractCardNumber(text: string): string | null`, más las constantes exportadas `PAYMENT_TO_CARD_PATTERNS` y `PAYMENT_WITH_CARD_PATTERNS`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `__tests__/domain/card-payment-detection.test.ts`. Las frases son las reales de la base del usuario; están en la §6.1 del spec.

```ts
import { isPaymentToCard, extractCardNumber } from "@/domain/services/card-payment-detection";

describe("isPaymentToCard", () => {
    it.each([
        "Pago de tarjeta de crédito",
        "Pago de la tarjeta de crédito No. 4697XXXXXXXX9620",
        "Pago de TC Mastercard",
        "TRANSFERENCIA PARA PAGO DE TC MASTERCARD",
        "Pago mínimo de tarjeta de crédito",
        "Pago realizado a tarjeta MASTERCARD",
        "Pago total tarjeta Visa Infinite Pichincha",
    ])("reconoce un pago a la tarjeta: %s", text => {
        expect(isPaymentToCard(text)).toBe(true);
    });

    it.each([
        "Pago con tarjeta de débito",
        "Pago realizado con tarjeta de débito",
        "Pago con tarjeta de débito en ABAD 1",
    ])("descarta una compra pagada con tarjeta: %s", text => {
        expect(isPaymentToCard(text)).toBe(false);
    });

    it("descarta un pago que solo menciona una tarjeta de pasada", () => {
        expect(isPaymentToCard("Pago de préstamos Brian por uso de tarjeta en Arg")).toBe(false);
    });

    it("no depende de mayúsculas ni de tildes", () => {
        expect(isPaymentToCard("PAGO DE TARJETA DE CREDITO")).toBe(true);
    });
});

describe("extractCardNumber", () => {
    it("saca el número enmascarado del texto", () => {
        expect(extractCardNumber("Pago de la tarjeta de crédito No. 4697XXXXXXXX9620"))
            .toBe("4697XXXXXXXX9620");
    });

    it("saca una máscara con solo los últimos dígitos", () => {
        expect(extractCardNumber("Pago a tarjeta XXXX8361")).toBe("XXXX8361");
    });

    it("saca una máscara con asteriscos", () => {
        expect(extractCardNumber("Pago TC 493176******1234")).toBe("493176******1234");
    });

    it("devuelve null cuando el texto no trae número", () => {
        expect(extractCardNumber("Pago de tarjeta de crédito")).toBeNull();
    });

    it("ignora montos y fechas, que no son números de tarjeta", () => {
        expect(extractCardNumber("Pago de tarjeta por 481.61 el 06/08/2026")).toBeNull();
    });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/domain/card-payment-detection.test.ts`
Expected: FAIL — `Cannot find module '@/domain/services/card-payment-detection'`.

- [ ] **Step 3: Implementar**

Crear `src/domain/services/card-payment-detection.ts`:

```ts
/**
 * Reconocer, entre las transacciones ya capturadas, las que son pagos hechos
 * **a** una tarjeta de crédito.
 *
 * El español de los bancos usa la misma palabra para las dos direcciones del
 * dinero y la diferencia está en una preposición: «pago **de** tarjeta» es
 * dinero que va a la tarjeta, «pago **con** tarjeta» es una compra. Por eso hay
 * dos listas y la de exclusión gana.
 */

/** Frases que significan dinero que entra a una tarjeta. */
export const PAYMENT_TO_CARD_PATTERNS: readonly RegExp[] = [
    /pago\s+(?:total\s+|minimo\s+)?(?:de\s+)?(?:la\s+)?tarjeta/i,
    /pago\s+(?:realizado\s+)?a\s+(?:la\s+)?tarjeta/i,
    /pago\s+(?:de\s+)?tc\b/i,
];

/** Frases que significan una compra pagada con una tarjeta. */
export const PAYMENT_WITH_CARD_PATTERNS: readonly RegExp[] = [
    /pago\s+(?:realizado\s+)?con\s+(?:la\s+)?tarjeta/i,
    /\buso\s+de\s+tarjeta\b/i,
];

/** Quita tildes para que los patrones no tengan que duplicarse. */
function fold(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function isPaymentToCard(text: string): boolean {
    const folded = fold(text);
    if (PAYMENT_WITH_CARD_PATTERNS.some(p => p.test(folded))) return false;
    return PAYMENT_TO_CARD_PATTERNS.some(p => p.test(folded));
}

/**
 * El primer token con forma de número de tarjeta: al menos cuatro caracteres
 * entre dígitos y máscara, con un carácter de máscara presente.
 *
 * La máscara es obligatoria a propósito. Sin ella, cualquier cifra del texto
 * —un monto, una fecha, un número de comprobante— pasaría por número de
 * tarjeta, y un falso positivo aquí ata un pago a la tarjeta equivocada.
 */
const CARD_NUMBER = /\b(?=[0-9]*[X×x*•·●#])[0-9X×x*•·●#]{4,}\b/;

export function extractCardNumber(text: string): string | null {
    return text.match(CARD_NUMBER)?.[0] ?? null;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/domain/card-payment-detection.test.ts`
Expected: PASS, 16 casos.

Si el test de `493176******1234` falla, la causa está en el `\b` final del regex: `4` es carácter de palabra y el límite existe; si el token empieza por máscara (`XXXX8361`), el `\b` inicial también vale porque `X` es carácter de palabra. Si algún caso no encaja, ajustar el regex, **no** el test — las cadenas son datos reales.

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/card-payment-detection.ts __tests__/domain/card-payment-detection.test.ts
git commit -m "feat(bancos): distinguir un pago a la tarjeta de una compra con tarjeta"
```

---

### Task 3: Detección — candidatas y agrupación de gemelas

Cruzar las transacciones con las tarjetas del usuario y agrupar las copias del mismo pago. Sigue siendo dominio puro: recibe listas, devuelve listas.

**Files:**
- Modify: `src/domain/services/card-payment-detection.ts`
- Test: `__tests__/domain/card-payment-detection.test.ts`

**Interfaces:**
- Consumes: `isPaymentToCard`, `extractCardNumber` (Task 2); `parseBankNumber` de `@/lib/bank-number-fingerprint`; `resolveFingerprint` e `IdentityCandidate` de `@/lib/bank-number-match`.
- Produces:

```ts
export interface PaymentCandidate {
    transaction: FinancialTransaction;
    cardId: UUID;
    /** El número tal como se leyó, para mostrarlo como evidencia. */
    readNumber: string;
}

export interface PaymentGroup {
    cardId: UUID;
    amount: number;
    date: ISODate;
    /** La transacción que se ata al confirmar. */
    primary: FinancialTransaction;
    /** Las gemelas que quedarán marcadas como duplicadas. */
    twins: FinancialTransaction[];
    readNumber: string;
}

export function detectCardPayments(
    transactions: readonly FinancialTransaction[],
    candidates: readonly IdentityCandidate[],
): PaymentCandidate[];

export function groupTwins(candidates: readonly PaymentCandidate[]): PaymentGroup[];
```

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `__tests__/domain/card-payment-detection.test.ts`:

```ts
import { detectCardPayments, groupTwins } from "@/domain/services/card-payment-detection";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { mergeFingerprints, type IdentityCandidate } from "@/lib/bank-number-match";
import type { FinancialTransaction } from "@/domain/entities/financial";

const USER = "11111111-1111-1111-1111-111111111111";

function tx(partial: Partial<FinancialTransaction>): FinancialTransaction {
    return {
        id: crypto.randomUUID(), ownerUserId: USER, type: "EXPENSE", status: "CONFIRMED",
        amount: 100, currency: "USD", date: "2026-08-06T13:25:00Z", description: "test",
        possibleDuplicate: false, createdAt: "2026-08-06T13:25:00Z",
        updatedAt: "2026-08-06T13:25:00Z", isDeleted: false,
        ...partial,
    } as FinancialTransaction;
}

/** Una tarjeta candidata con el número que declara. */
function card(id: string, raw: string): IdentityCandidate {
    return { id, kind: "CARD", fingerprint: mergeFingerprints([parseBankNumber(raw)]) };
}

describe("detectCardPayments", () => {
    const mastercard = card("card-8361", "XXXX8361");

    it("detecta un pago cuyo número resuelve a una sola tarjeta", () => {
        const t = tx({ description: "Pago de la tarjeta de crédito No. XXXXXXXXXXXX8361" });
        const found = detectCardPayments([t], [mastercard]);

        expect(found).toHaveLength(1);
        expect(found[0].cardId).toBe("card-8361");
        expect(found[0].readNumber).toBe("XXXXXXXXXXXX8361");
    });

    it("descarta un pago sin número, aunque la descripción sea inequívoca", () => {
        const t = tx({ description: "Pago de tarjeta de crédito", merchant: "Banco del Pacifico" });
        expect(detectCardPayments([t], [mastercard])).toEqual([]);
    });

    it("descarta una compra pagada con tarjeta de débito", () => {
        const t = tx({ description: "Pago con tarjeta de débito XXXX8361" });
        expect(detectCardPayments([t], [mastercard])).toEqual([]);
    });

    it("descarta un número que encaja con dos tarjetas", () => {
        const t = tx({ description: "Pago de tarjeta XXX361" });
        const otra = card("card-361", "XXXX0361");
        expect(detectCardPayments([t], [mastercard, otra])).toEqual([]);
    });

    it("ignora las transacciones ya atadas o ya descartadas", () => {
        const atada = tx({
            description: "Pago de tarjeta XXXX8361", bankCardPaymentId: "card-8361",
        });
        const descartada = tx({
            description: "Pago de tarjeta XXXX8361",
            cardPaymentDismissedAt: "2026-08-07T00:00:00Z",
        });
        expect(detectCardPayments([atada, descartada], [mastercard])).toEqual([]);
    });

    it("ignora las anuladas", () => {
        const t = tx({ description: "Pago de tarjeta XXXX8361", status: "DELETED" });
        expect(detectCardPayments([t], [mastercard])).toEqual([]);
    });
});

describe("groupTwins", () => {
    const mastercard = card("card-8361", "XXXX8361");
    const desc = "Pago de tarjeta de crédito XXXX8361";

    it("junta dos copias del mismo pago y ata la que tiene cuenta de origen", () => {
        const sinOrigen = tx({ description: desc, amount: 481.61, date: "2026-08-06T13:25:00Z" });
        const conOrigen = tx({
            description: desc, amount: 481.61, date: "2026-08-06T13:25:00Z",
            bankSourceAccountId: "acc-1",
        });
        const groups = groupTwins(detectCardPayments([sinOrigen, conOrigen], [mastercard]));

        expect(groups).toHaveLength(1);
        expect(groups[0].primary.id).toBe(conOrigen.id);
        expect(groups[0].twins.map(t => t.id)).toEqual([sinOrigen.id]);
        expect(groups[0].amount).toBe(481.61);
    });

    it("sin cuenta de origen en ninguna, ata la más antigua", () => {
        const vieja = tx({ description: desc, amount: 36, date: "2026-06-22T07:00:00Z" });
        const nueva = tx({ description: desc, amount: 36, date: "2026-06-22T09:00:00Z" });
        const groups = groupTwins(detectCardPayments([nueva, vieja], [mastercard]));

        expect(groups[0].primary.id).toBe(vieja.id);
    });

    it("no junta montos distintos", () => {
        const a = tx({ description: desc, amount: 100, date: "2026-08-06T13:25:00Z" });
        const b = tx({ description: desc, amount: 101, date: "2026-08-06T13:25:00Z" });
        expect(groupTwins(detectCardPayments([a, b], [mastercard]))).toHaveLength(2);
    });

    it("no junta fechas separadas por más de tres días", () => {
        const a = tx({ description: desc, amount: 100, date: "2026-08-01T00:00:00Z" });
        const b = tx({ description: desc, amount: 100, date: "2026-08-05T00:00:00Z" });
        expect(groupTwins(detectCardPayments([a, b], [mastercard]))).toHaveLength(2);
    });

    it("no junta pagos a tarjetas distintas", () => {
        const otra = card("card-9620", "XXXX9620");
        const a = tx({ description: "Pago de tarjeta XXXX8361", amount: 100 });
        const b = tx({ description: "Pago de tarjeta XXXX9620", amount: 100 });
        expect(groupTwins(detectCardPayments([a, b], [mastercard, otra]))).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/domain/card-payment-detection.test.ts -t "detectCardPayments"`
Expected: FAIL — `detectCardPayments is not a function`.

Los tests que usan `bankCardPaymentId` y `cardPaymentDismissedAt` fallarán además al compilar hasta la Task 4, que añade esos campos a la entidad. Es esperado: el cast `as FinancialTransaction` del helper `tx` los deja pasar en tiempo de ejecución, pero si `tsc` se queja, seguir a la Task 4 y volver.

- [ ] **Step 3: Implementar**

Añadir a `src/domain/services/card-payment-detection.ts`:

```ts
import type { UUID, ISODate } from "../core";
import type { FinancialTransaction } from "../entities/financial";
import { parseBankNumber } from "@/lib/bank-number-fingerprint";
import { resolveFingerprint, type IdentityCandidate } from "@/lib/bank-number-match";

export interface PaymentCandidate {
    transaction: FinancialTransaction;
    cardId: UUID;
    /** El número tal como se leyó, para mostrarlo como evidencia. */
    readNumber: string;
}

export interface PaymentGroup {
    cardId: UUID;
    amount: number;
    date: ISODate;
    /** La transacción que se ata al confirmar. */
    primary: FinancialTransaction;
    /** Las gemelas que quedarán marcadas como duplicadas. */
    twins: FinancialTransaction[];
    readNumber: string;
}

const DEAD_STATUSES = new Set(["REJECTED", "DELETED", "DUPLICATE"]);

/** Dos capturas del mismo pago no llegan con la misma hora, pero sí con el mismo día. */
const TWIN_WINDOW_MS = 3 * 86_400_000;

/**
 * Los pagos a tarjeta que hay entre las transacciones dadas.
 *
 * Solo entra lo que trae número legible y resuelve a **una** tarjeta: sin
 * número, o con dos tarjetas compatibles, la transacción se queda fuera. La
 * regla es deliberada — nada baja la deuda por parecido de descripción.
 */
export function detectCardPayments(
    transactions: readonly FinancialTransaction[],
    candidates: readonly IdentityCandidate[],
): PaymentCandidate[] {
    const cards = candidates.filter(c => c.kind === "CARD");
    const found: PaymentCandidate[] = [];

    for (const transaction of transactions) {
        if (DEAD_STATUSES.has(transaction.status)) continue;
        if (transaction.bankCardPaymentId) continue;
        if (transaction.cardPaymentDismissedAt) continue;
        if (transaction.type !== "EXPENSE" && transaction.type !== "TRANSFER") continue;

        const text = [
            transaction.description,
            typeof transaction.originStats?.emailBody === "string"
                ? transaction.originStats.emailBody
                : "",
        ].join(" ");

        if (!isPaymentToCard(transaction.description)) continue;

        const readNumber = extractCardNumber(text);
        if (!readNumber) continue;

        const resolved = resolveFingerprint(parseBankNumber(readNumber), cards);
        if (resolved.resolution === "PENDING" || !resolved.targetId) continue;

        found.push({ transaction, cardId: resolved.targetId, readNumber });
    }

    return found;
}

/**
 * Junta las candidatas que son el mismo pago visto dos veces —el correo del
 * banco y el estado de cuenta llegan por separado— para que confirmarlas no
 * reste la deuda dos veces.
 *
 * Se ata la que trae cuenta de origen, que es la que sabe de dónde salió el
 * dinero; con empate, la más antigua.
 */
export function groupTwins(candidates: readonly PaymentCandidate[]): PaymentGroup[] {
    const groups: PaymentGroup[] = [];

    const sorted = [...candidates].sort(
        (a, b) => Date.parse(a.transaction.date) - Date.parse(b.transaction.date),
    );

    for (const candidate of sorted) {
        const { transaction } = candidate;
        const group = groups.find(g =>
            g.cardId === candidate.cardId
            && g.amount === Number(transaction.amount)
            && Math.abs(Date.parse(g.date) - Date.parse(transaction.date)) <= TWIN_WINDOW_MS);

        if (!group) {
            groups.push({
                cardId: candidate.cardId,
                amount: Number(transaction.amount),
                date: transaction.date,
                primary: transaction,
                twins: [],
                readNumber: candidate.readNumber,
            });
            continue;
        }

        // La que sabe de dónde salió el dinero manda sobre la que llegó antes.
        if (!group.primary.bankSourceAccountId && transaction.bankSourceAccountId) {
            group.twins.push(group.primary);
            group.primary = transaction;
        } else {
            group.twins.push(transaction);
        }
    }

    return groups;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/domain/card-payment-detection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/card-payment-detection.ts __tests__/domain/card-payment-detection.test.ts
git commit -m "feat(bancos): detectar pagos de tarjeta y agrupar las capturas gemelas"
```

---

### Task 4: Migración, entidad y mapeos

La columna, el índice, el CHECK, la vista reescrita, y los tres sitios de TypeScript que traducen entre fila y entidad. Sin esto, nada de lo anterior llega a la base.

**Files:**
- Create: `supabase/migrations/20260905120000_card_payments.sql`
- Modify: `src/domain/entities/financial.ts`
- Modify: `src/infrastructure/repositories/supabase/supabase-financial-transaction-repository.ts` (líneas 20, 76 y 393)
- Modify: `src/infrastructure/repositories/bank-in-memory.ts:160-168`
- Test: `__tests__/services/bank-service.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `FinancialTransaction.bankCardPaymentId?: UUID | null` y `FinancialTransaction.cardPaymentDismissedAt?: ISODate | null`; la vista in-memory emitiendo `PAYMENT` por cualquiera de los dos caminos.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `__tests__/services/bank-service.test.ts`. Usa el `buildService()` y el `tx()` que el archivo ya define.

```ts
describe("vista de movimientos con pagos atados a la tarjeta", () => {
    it("un pago con bankCardPaymentId baja la deuda de esa tarjeta", async () => {
        const { service, cards, transactions } = buildService();
        const card = await cards.create({
            id: "card-1", ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);

        await transactions.create(tx({
            amount: 500, bankCardId: card.id, paidWithCredit: true,
        }));
        await transactions.create(tx({
            amount: 200, bankCardPaymentId: card.id, bankSourceAccountId: "acc-1",
        }));

        const detail = await service.getCardDetail(USER, card.id);
        expect(detail.card.debt).toBe(300);
    });

    it("un pago que trae tarjeta y estado a la vez resta una sola vez", async () => {
        const { service, cards, statements, transactions } = buildService();
        const card = await cards.create({
            id: "card-2", ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);
        const statement = await statements.create({
            id: "st-1", ownerUserId: USER, cardId: card.id,
            periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
            computedAmount: 500, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);

        await transactions.create(tx({
            amount: 500, bankCardId: card.id, paidWithCredit: true,
        }));
        await transactions.create(tx({
            amount: 200, bankCardPaymentId: card.id, bankCardStatementId: statement.id,
        }));

        const detail = await service.getCardDetail(USER, card.id);
        expect(detail.card.debt).toBe(300);
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/services/bank-service.test.ts -t "vista de movimientos"`
Expected: FAIL — el primer caso da `500` (el pago no resta), y el segundo da `100` (resta dos veces) o falla al compilar por el campo desconocido.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260905120000_card_payments.sql`:

```sql
-- Un pago a una tarjeta necesita decirlo por sí mismo.
--
-- Hasta ahora la vista solo reconocía como PAYMENT lo que traía
-- `bank_card_statement_id`, un campo que pone un único camino de la app y que
-- exige que la tarjeta tenga estado de cuenta abierto. Los pagos que llegan por
-- el escáner nunca lo traen, así que la deuda de una tarjeta no bajaba nunca.
--
-- `bank_card_id` no sirve para esto: hoy significa «con esta tarjeta se pagó», y
-- reusarlo con `paid_with_credit = false` lo haría significar también «a esta
-- tarjeta se le pagó», que es lo contrario, distinguido por un booleano que
-- sirve para otra cosa.

ALTER TABLE financial_transactions
    ADD COLUMN bank_card_payment_id      UUID REFERENCES bank_cards(id) ON DELETE SET NULL,
    ADD COLUMN card_payment_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN financial_transactions.bank_card_payment_id IS
    'Tarjeta a la que esta transacción le paga. Distinto de bank_card_id, que es la tarjeta con la que se pagó.';
COMMENT ON COLUMN financial_transactions.card_payment_dismissed_at IS
    'Cuándo el usuario descartó esta transacción como candidata a pago de tarjeta.';

CREATE INDEX financial_transactions_bank_card_payment_id_idx
    ON financial_transactions (bank_card_payment_id)
    WHERE bank_card_payment_id IS NOT NULL;

-- No se paga una tarjeta con el crédito de esa misma tarjeta.
ALTER TABLE financial_transactions
    ADD CONSTRAINT financial_transactions_payment_not_on_credit
    CHECK (bank_card_payment_id IS NULL OR COALESCE(paid_with_credit, FALSE) = FALSE);

-- ─── La vista ───────────────────────────────────────────────────────────────
--
-- Solo cambia la última rama, la de PAYMENT. El resto se reproduce igual porque
-- CREATE OR REPLACE VIEW exige la definición entera.

DROP VIEW IF EXISTS bank_movements;

CREATE VIEW bank_movements AS
    SELECT t.id AS transaction_id, t.owner_user_id, t.date,
           COALESCE(t.bank_destination_account_id, t.bank_source_account_id) AS account_id,
           NULL::UUID AS card_id,
           'IN'::TEXT AS direction, t.amount, t.currency,
           t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type IN ('INCOME', 'DEPOSIT', 'REFUND')
       AND COALESCE(t.bank_destination_account_id, t.bank_source_account_id) IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           t.bank_source_account_id, NULL::UUID,
           'OUT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type IN ('TRANSFER', 'WITHDRAWAL')
       AND t.bank_source_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           t.bank_destination_account_id, NULL::UUID,
           'IN', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type IN ('TRANSFER', 'WITHDRAWAL')
       AND t.bank_destination_account_id IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE')
    UNION ALL
    SELECT t.id, t.owner_user_id, t.date,
           COALESCE(t.bank_source_account_id, t.bank_destination_account_id), NULL::UUID,
           'OUT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
     WHERE t.type NOT IN ('INCOME', 'DEPOSIT', 'REFUND', 'TRANSFER', 'WITHDRAWAL')
       AND COALESCE(t.bank_source_account_id, t.bank_destination_account_id) IS NOT NULL
       AND COALESCE(t.paid_with_credit, FALSE) = FALSE
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
    -- Pago a una tarjeta: baja su deuda. La salida de la cuenta pagadora entra
    -- por la rama de gastos, como cualquier otro pago.
    --
    -- LEFT JOIN con COALESCE, y no dos ramas unidas con UNION ALL: un pago que
    -- abona un estado lleva las dos columnas puestas, y con dos ramas restaría
    -- la deuda por duplicado.
    SELECT t.id, t.owner_user_id, t.date,
           NULL::UUID,
           COALESCE(t.bank_card_payment_id, s.card_id),
           'PAYMENT', t.amount, t.currency, t.description, t.merchant, t.category_id
      FROM financial_transactions t
      LEFT JOIN bank_card_statements s ON s.id = t.bank_card_statement_id
     WHERE COALESCE(t.bank_card_payment_id, s.card_id) IS NOT NULL
       AND t.status NOT IN ('REJECTED', 'DELETED', 'DUPLICATE');

ALTER VIEW bank_movements SET (security_invoker = on);
```

- [ ] **Step 4: Aplicar la migración con el MCP de Supabase**

Usar `apply_migration` con `project_id: "xywkuwmhnfcdksamuypk"`, `name: "card_payments"` y el contenido del archivo. Después, verificar con `execute_sql`:

```sql
SELECT count(*) FILTER (WHERE direction = 'PAYMENT') AS pagos,
       count(*) FILTER (WHERE direction = 'CHARGE')  AS consumos
  FROM bank_movements;
```

Expected: `pagos = 0`, `consumos = 81`. Cero pagos es correcto — todavía no hay ninguna transacción atada; lo que se comprueba es que la vista se creó y no rompió los consumos que ya contaba.

- [ ] **Step 5: Añadir los campos a la entidad**

En `src/domain/entities/financial.ts`, dentro de `FinancialTransaction`, justo después de `bankCardStatementId`:

```ts
    /** Tarjeta a la que esta transacción le paga. Opuesto de `bankCardId`. */
    bankCardPaymentId?: UUID | null;
    /** Cuándo el usuario descartó esta transacción como candidata a pago de tarjeta. */
    cardPaymentDismissedAt?: ISODate | null;
```

- [ ] **Step 6: Añadir los campos a los mapeos de Supabase**

En `src/infrastructure/repositories/supabase/supabase-financial-transaction-repository.ts`, junto a cada `bank_card_statement_id` que ya existe:

En las dos funciones que escriben (líneas ~20 y ~76), añadir tras esa línea:

```ts
            bank_card_payment_id: entity.bankCardPaymentId ?? null,
            card_payment_dismissed_at: entity.cardPaymentDismissedAt ?? null,
```

En la que lee (línea ~393), tras `bankCardStatementId`:

```ts
            bankCardPaymentId: row.bank_card_payment_id ?? null,
            cardPaymentDismissedAt: row.card_payment_dismissed_at ?? null,
```

- [ ] **Step 7: Actualizar la vista in-memory**

En `src/infrastructure/repositories/bank-in-memory.ts`, reemplazar el bloque de las líneas 163-168 por:

```ts
            // Espejo de la rama PAYMENT de la vista SQL: la tarjeta sale de la
            // columna propia o del estado, y se emite una sola línea aunque
            // vengan las dos puestas.
            const paidCardId = t.bankCardPaymentId
                ?? (t.bankCardStatementId
                    ? (await this.statements.findById(t.bankCardStatementId))?.cardId ?? null
                    : null);
            if (paidCardId) {
                out.push({ ...base, accountId: null, cardId: paidCardId, direction: "PAYMENT" });
            }
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/services/bank-service.test.ts`
Expected: PASS, incluidos los dos casos nuevos y todos los que ya existían.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260905120000_card_payments.sql src/domain/entities/financial.ts src/infrastructure/repositories/supabase/supabase-financial-transaction-repository.ts src/infrastructure/repositories/bank-in-memory.ts __tests__/services/bank-service.test.ts
git commit -m "feat(bancos): atar un pago a la tarjeta con columna propia en la vista de movimientos"
```

---

### Task 5: `payCard` — un solo camino para pagar

Sustituir `payStatement` por un método que funcione con o sin estado abierto y aplique el reparto de la Task 1.

**Files:**
- Modify: `src/application/services/bank-service.ts:1096-1134`
- Test: `__tests__/services/bank-service.test.ts`

**Interfaces:**
- Consumes: `allocatePayment` (Task 1); `computeStatementDue` y `cardLabel` que el servicio ya importa.
- Produces: `BankService.payCard(userId: UUID, cardId: UUID, sourceAccountId: UUID, amount: number, date: string): Promise<FinancialTransaction>`. `payStatement` deja de existir.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `__tests__/services/bank-service.test.ts`:

```ts
describe("payCard", () => {
    async function creditCard(cards: ReturnType<typeof buildService>["cards"], id: string) {
        return cards.create({
            id, ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);
    }

    it("sin estado abierto, el pago entero baja la deuda", async () => {
        const { service, cards, transactions } = buildService();
        const card = await creditCard(cards, "card-a");
        await transactions.create(tx({ amount: 534.56, bankCardId: card.id, paidWithCredit: true }));

        const payment = await service.payCard(USER, card.id, "acc-1", 534.56, NOW);

        expect(payment.type).toBe("PAYMENT");
        expect(payment.bankCardPaymentId).toBe(card.id);
        expect(payment.bankCardStatementId).toBeFalsy();
        expect(payment.bankSourceAccountId).toBe("acc-1");
        expect((await service.getCardDetail(USER, card.id)).card.debt).toBe(0);
    });

    it("con estado abierto, abona el estado y deja el resto en la deuda", async () => {
        const { service, cards, statements, transactions } = buildService();
        const card = await creditCard(cards, "card-b");
        await statements.create({
            id: "st-b", ownerUserId: USER, cardId: card.id,
            periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
            computedAmount: 180, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);
        await transactions.create(tx({ amount: 500, bankCardId: card.id, paidWithCredit: true }));

        const payment = await service.payCard(USER, card.id, "acc-1", 200, NOW);

        expect(payment.bankCardStatementId).toBe("st-b");
        const saved = await statements.findById("st-b");
        expect(Number(saved!.paidAmount)).toBe(180);
        expect(saved!.status).toBe("PAID");
        expect((await service.getCardDetail(USER, card.id)).card.debt).toBe(300);
    });

    it("crea una sola transacción aunque abone el estado", async () => {
        const { service, cards, statements, transactions } = buildService();
        const card = await creditCard(cards, "card-c");
        await statements.create({
            id: "st-c", ownerUserId: USER, cardId: card.id,
            periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-15",
            computedAmount: 100, totalAmount: null, paidAmount: 0, status: "OPEN",
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);

        const before = (await transactions.findByOwnerId(USER)).length;
        await service.payCard(USER, card.id, "acc-1", 100, NOW);
        expect((await transactions.findByOwnerId(USER)).length).toBe(before + 1);
    });

    it("rechaza una tarjeta de otro usuario", async () => {
        const { service, cards } = buildService();
        await cards.create({
            id: "card-ajena", ownerUserId: "otro", cardType: "CREDIT", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, createdAt: NOW, updatedAt: NOW,
            isDeleted: false,
        } as never);

        await expect(service.payCard(USER, "card-ajena", "acc-1", 10, NOW))
            .rejects.toThrow("Tarjeta no encontrada");
    });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/services/bank-service.test.ts -t "payCard"`
Expected: FAIL — `service.payCard is not a function`.

- [ ] **Step 3: Reemplazar `payStatement` por `payCard`**

En `src/application/services/bank-service.ts`, sustituir el método `payStatement` (líneas 1096-1134) por:

```ts
    /**
     * Registra un pago a una tarjeta.
     *
     * Es el único camino de pago: lo llaman tanto el botón del detalle de
     * tarjeta como el del estado de cuenta. El importe abona primero el estado
     * abierto —lo que tiene vencimiento— y el resto baja la deuda corriente;
     * sin estado abierto, todo va a la deuda. Sale **una** transacción, que
     * lleva la tarjeta siempre y el estado solo cuando abonó algo.
     */
    async payCard(
        userId: UUID, cardId: UUID, sourceAccountId: UUID,
        amount: number, date: string,
    ): Promise<FinancialTransaction> {
        const card = await this.cards.findById(cardId);
        if (!card || card.ownerUserId !== userId) throw new Error("Tarjeta no encontrada");

        const openStatement = await this.statements.findOpenForCard(cardId);
        const { toStatement } = allocatePayment(amount, openStatement);

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
            bankCardPaymentId: cardId,
            bankCardStatementId: toStatement > 0 ? openStatement!.id : null,
            bankInstitutionId: card.institutionId,
            ...stamps(),
        } as FinancialTransaction);

        if (toStatement > 0 && openStatement) {
            const paidAmount = round2(Number(openStatement.paidAmount) + toStatement);
            await this.statements.update({
                ...openStatement,
                paidAmount,
                status: paidAmount >= Number(openStatement.totalAmount ?? openStatement.computedAmount)
                    ? "PAID"
                    : openStatement.status,
            });
        }

        return transaction;
    }
```

Añadir `allocatePayment` a la lista de imports que el archivo ya trae desde `@/domain/services/bank-balance`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/services/bank-service.test.ts`
Expected: PASS. Si algún test viejo llamaba a `payStatement`, actualizarlo a `payCard` — la firma cambia de `(userId, statementId, …)` a `(userId, cardId, …)`.

Run: `npx tsc --noEmit`
Expected: errores solo en `src/app/actions/bank.ts` y `StatementPanel.tsx`, que todavía llaman a `payStatement`. Se arreglan en las Tasks 7 y 8.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/bank-service.ts __tests__/services/bank-service.test.ts
git commit -m "feat(bancos): pagar una tarjeta con o sin estado de cuenta abierto"
```

---

### Task 6: La bandeja en el servicio

Listar los pagos por confirmar, confirmarlos y descartarlos.

**Files:**
- Modify: `src/application/services/bank-service.ts`
- Test: `__tests__/services/bank-service.test.ts`

**Interfaces:**
- Consumes: `detectCardPayments`, `groupTwins`, `PaymentGroup` (Task 3); `identityCandidates(userId)` de `BankIdentificationService`, ya inyectado en `BankService` como `this.identification`.
- Produces:
  - `BankService.listPendingCardPayments(userId: UUID): Promise<PaymentGroup[]>`
  - `BankService.confirmCardPayment(userId: UUID, transactionId: UUID, cardId: UUID): Promise<FinancialTransaction>`
  - `BankService.dismissCardPayment(userId: UUID, transactionId: UUID): Promise<FinancialTransaction>`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `__tests__/services/bank-service.test.ts`:

```ts
describe("bandeja de pagos por confirmar", () => {
    async function withCandidate() {
        const built = buildService();
        await built.cards.create({
            id: "card-8361", ownerUserId: USER, cardType: "CREDIT", currency: "USD",
            lastFour: "8361", status: "ACTIVE", isUnconfirmed: false,
            createdAt: NOW, updatedAt: NOW, isDeleted: false,
        } as never);
        return built;
    }

    it("agrupa las dos capturas del mismo pago en un solo pendiente", async () => {
        const { service, transactions } = await withCandidate();
        const desc = "Pago de tarjeta de crédito XXXX8361";
        await transactions.create(tx({ amount: 481.61, description: desc }));
        await transactions.create(tx({
            amount: 481.61, description: desc, bankSourceAccountId: "acc-1",
        }));

        const pending = await service.listPendingCardPayments(USER);

        expect(pending).toHaveLength(1);
        expect(pending[0].cardId).toBe("card-8361");
        expect(pending[0].twins).toHaveLength(1);
        expect(pending[0].primary.bankSourceAccountId).toBe("acc-1");
    });

    it("confirmar ata una sola transacción y marca la gemela como duplicada", async () => {
        const { service, transactions } = await withCandidate();
        const desc = "Pago de tarjeta de crédito XXXX8361";
        const gemela = await transactions.create(tx({ amount: 481.61, description: desc }));
        const principal = await transactions.create(tx({
            amount: 481.61, description: desc, bankSourceAccountId: "acc-1",
        }));

        await service.confirmCardPayment(USER, principal.id, "card-8361");

        expect((await transactions.findById(principal.id))!.bankCardPaymentId).toBe("card-8361");
        expect((await transactions.findById(gemela.id))!.bankCardPaymentId).toBeFalsy();
        expect((await transactions.findById(gemela.id))!.possibleDuplicate).toBe(true);
        expect(await service.listPendingCardPayments(USER)).toEqual([]);
    });

    it("descartar saca la candidata de la bandeja sin borrarla", async () => {
        const { service, transactions } = await withCandidate();
        const t = await transactions.create(tx({
            amount: 100, description: "Pago de tarjeta de crédito XXXX8361",
        }));

        await service.dismissCardPayment(USER, t.id);

        expect(await service.listPendingCardPayments(USER)).toEqual([]);
        const saved = await transactions.findById(t.id);
        expect(saved!.isDeleted).toBe(false);
        expect(saved!.cardPaymentDismissedAt).toBeTruthy();
    });

    it("rechaza confirmar una transacción de otro usuario", async () => {
        const { service, transactions } = await withCandidate();
        const ajena = await transactions.create(tx({
            ownerUserId: "otro", amount: 100,
            description: "Pago de tarjeta de crédito XXXX8361",
        }));

        await expect(service.confirmCardPayment(USER, ajena.id, "card-8361"))
            .rejects.toThrow("Transacción no encontrada");
    });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx jest __tests__/services/bank-service.test.ts -t "bandeja de pagos"`
Expected: FAIL — `service.listPendingCardPayments is not a function`.

- [ ] **Step 3: Implementar**

Añadir a `src/application/services/bank-service.ts`, junto a `payCard`:

```ts
    /**
     * Los pagos que la app cree haber capturado y todavía no están atados a
     * ninguna tarjeta, agrupados para que las capturas gemelas se confirmen una
     * sola vez.
     */
    async listPendingCardPayments(userId: UUID): Promise<PaymentGroup[]> {
        const [transactions, candidates] = await Promise.all([
            this.transactions.findByOwnerId(userId),
            this.identification.identityCandidates(userId),
        ]);
        return groupTwins(detectCardPayments(transactions, candidates));
    }

    /**
     * Ata un pago a su tarjeta y marca como duplicadas las capturas gemelas.
     *
     * Las gemelas no se borran: la segunda fuente a veces trae datos que la
     * primera no tiene, y lo que hace falta es que no vuelvan a ofrecerse ni
     * resten la deuda otra vez.
     */
    async confirmCardPayment(
        userId: UUID, transactionId: UUID, cardId: UUID,
    ): Promise<FinancialTransaction> {
        const transaction = await this.transactions.findById(transactionId);
        if (!transaction || transaction.ownerUserId !== userId) {
            throw new Error("Transacción no encontrada");
        }
        const card = await this.cards.findById(cardId);
        if (!card || card.ownerUserId !== userId) throw new Error("Tarjeta no encontrada");

        const group = (await this.listPendingCardPayments(userId))
            .find(g => g.primary.id === transactionId
                || g.twins.some(t => t.id === transactionId));

        const twins = group
            ? [group.primary, ...group.twins].filter(t => t.id !== transactionId)
            : [];

        for (const twin of twins) {
            await this.transactions.update({
                ...twin, possibleDuplicate: true, updatedAt: new Date().toISOString(),
            });
        }

        return this.transactions.update({
            ...transaction,
            bankCardPaymentId: cardId,
            paidWithCredit: false,
            updatedAt: new Date().toISOString(),
        });
    }

    /** Saca una candidata de la bandeja sin borrarla ni tocar ningún saldo. */
    async dismissCardPayment(
        userId: UUID, transactionId: UUID,
    ): Promise<FinancialTransaction> {
        const transaction = await this.transactions.findById(transactionId);
        if (!transaction || transaction.ownerUserId !== userId) {
            throw new Error("Transacción no encontrada");
        }
        const now = new Date().toISOString();
        return this.transactions.update({
            ...transaction, cardPaymentDismissedAt: now, updatedAt: now,
        });
    }
```

Añadir los imports:

```ts
import {
    detectCardPayments, groupTwins, type PaymentGroup,
} from "@/domain/services/card-payment-detection";
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/services/bank-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/bank-service.ts __tests__/services/bank-service.test.ts
git commit -m "feat(bancos): bandeja de pagos de tarjeta por confirmar"
```

---

### Task 7: Esquemas Zod y server actions

**Files:**
- Modify: `src/lib/validators/bank-schemas.ts:90-95`
- Modify: `src/app/actions/bank.ts:263-275`
- Test: `__tests__/validators/bank-schemas.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: `payCard`, `confirmCardPayment`, `dismissCardPayment` (Tasks 5 y 6).
- Produces: `payCardSchema`, `confirmCardPaymentSchema`, `dismissCardPaymentSchema`; y las acciones `payCardAction`, `confirmCardPaymentAction`, `dismissCardPaymentAction`. `payStatementSchema` y `payStatementAction` desaparecen.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `__tests__/validators/bank-schemas.test.ts` (si el archivo no existe, crearlo con el import y este `describe`):

```ts
import { payCardSchema } from "@/lib/validators/bank-schemas";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("payCardSchema", () => {
    it("acepta un pago bien formado", () => {
        const parsed = payCardSchema.parse({
            cardId: UUID_A, sourceAccountId: UUID_B,
            amount: 534.56, date: "2026-09-05T12:00:00.000Z",
        });
        expect(parsed.amount).toBe(534.56);
    });

    it("rechaza un monto de cero", () => {
        expect(() => payCardSchema.parse({
            cardId: UUID_A, sourceAccountId: UUID_B,
            amount: 0, date: "2026-09-05T12:00:00.000Z",
        })).toThrow(/mayor que cero/);
    });

    it("rechaza un id que no es uuid", () => {
        expect(() => payCardSchema.parse({
            cardId: "card-1", sourceAccountId: UUID_B,
            amount: 10, date: "2026-09-05T12:00:00.000Z",
        })).toThrow();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/validators/bank-schemas.test.ts`
Expected: FAIL — `payCardSchema` no existe.

- [ ] **Step 3: Reemplazar el esquema**

En `src/lib/validators/bank-schemas.ts`, sustituir `payStatementSchema` por:

```ts
export const payCardSchema = z.object({
    cardId: uuid,
    sourceAccountId: uuid,
    amount: z.number().positive("El monto debe ser mayor que cero"),
    date: z.string().datetime(),
});

export const confirmCardPaymentSchema = z.object({
    transactionId: uuid,
    cardId: uuid,
});

export const dismissCardPaymentSchema = z.object({
    transactionId: uuid,
});
```

- [ ] **Step 4: Reemplazar la acción**

En `src/app/actions/bank.ts`, sustituir `payStatementAction` por:

```ts
export async function payCardAction(input: unknown) {
    return run("payCard", async userId => {
        const v = payCardSchema.parse(input);
        const result = await bankService.payCard(
            userId, v.cardId, v.sourceAccountId, v.amount, v.date,
        );
        revalidateBanks();
        // El pago es un gasto real, así que también mueve el dashboard financiero.
        revalidatePath("/financial");
        revalidatePath("/financial/transactions");
        return result;
    });
}

export async function confirmCardPaymentAction(input: unknown) {
    return run("confirmCardPayment", async userId => {
        const v = confirmCardPaymentSchema.parse(input);
        const result = await bankService.confirmCardPayment(userId, v.transactionId, v.cardId);
        revalidateBanks();
        revalidatePath("/financial/banks/payments");
        return result;
    });
}

export async function dismissCardPaymentAction(input: unknown) {
    return run("dismissCardPayment", async userId => {
        const v = dismissCardPaymentSchema.parse(input);
        const result = await bankService.dismissCardPayment(userId, v.transactionId);
        revalidatePath("/financial/banks/payments");
        return result;
    });
}
```

Actualizar el bloque de imports de la línea 16: cambiar `payStatementSchema` por `payCardSchema, confirmCardPaymentSchema, dismissCardPaymentSchema`.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/validators/bank-schemas.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: un solo error, en `StatementPanel.tsx`, que todavía importa `payStatementAction`. Se arregla en la Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validators/bank-schemas.ts src/app/actions/bank.ts __tests__/validators/bank-schemas.test.ts
git commit -m "feat(bancos): acciones para pagar una tarjeta y resolver la bandeja"
```

---

### Task 8: El botón de pago en el detalle de tarjeta

Lo que el usuario ve: un botón que aparece con solo tener deuda, sin depender de que exista estado de cuenta.

**Files:**
- Create: `src/presentation/bank/components/PayCardSheet.tsx`
- Modify: `src/presentation/bank/components/CardDetailClient.tsx:52-75`
- Modify: `src/presentation/bank/components/StatementPanel.tsx:9,40-58,126-138`
- Test: `__tests__/components/CardDetailClient.test.tsx` (crear)

**Interfaces:**
- Consumes: `payCardAction` (Task 7); `BankCardDetail` y `BankAccountWithBalance` de `@/application/services/bank-service`; `money` de `../lib/format-money`; `accountLabel` de `@/lib/bank-identity-label`.
- Produces: `<PayCardSheet card={BankCardWithDebt} accounts={BankAccountWithBalance[]} />`.

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/CardDetailClient.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { CardDetailClient } from "@/presentation/bank/components/CardDetailClient";
import type { BankCardDetail } from "@/application/services/bank-service";

jest.mock("@/app/actions/bank", () => ({
    payCardAction: jest.fn().mockResolvedValue({ success: true, data: null }),
    setStatementTotalAction: jest.fn(),
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

function detail(overrides: Partial<BankCardDetail["card"]> = {}): BankCardDetail {
    return {
        card: {
            id: "card-1", ownerUserId: "u1", cardType: "CREDIT", currency: "USD",
            lastFour: "8361", status: "ACTIVE", isUnconfirmed: false,
            institutionName: "Banco del Pacífico",
            createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
            isDeleted: false,
            debt: 534.56, availableCredit: null, openStatement: null,
            ...overrides,
        },
        statements: [], movements: [], periodMovements: [],
        payableAccounts: [{
            id: "acc-1", ownerUserId: "u1", accountType: "SAVINGS", currency: "USD",
            status: "ACTIVE", isUnconfirmed: false, institutionName: "Pichincha",
            createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
            isDeleted: false, balance: 1000, lastSnapshotAt: null,
        }],
    } as unknown as BankCardDetail;
}

describe("CardDetailClient", () => {
    it("ofrece pagar cuando hay deuda aunque no exista estado de cuenta", () => {
        render(<CardDetailClient initialData={detail()} />);
        expect(screen.getByRole("button", { name: /pagar/i })).toBeInTheDocument();
    });

    it("no ofrece pagar cuando la deuda está en cero", () => {
        render(<CardDetailClient initialData={detail({ debt: 0 })} />);
        expect(screen.queryByRole("button", { name: /pagar/i })).toBeNull();
    });

    it("no ofrece pagar en una tarjeta de débito", () => {
        render(<CardDetailClient initialData={detail({ cardType: "DEBIT", debt: 100 })} />);
        expect(screen.queryByRole("button", { name: /pagar/i })).toBeNull();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/components/CardDetailClient.test.tsx`
Expected: FAIL — no hay ningún botón con nombre "Pagar".

- [ ] **Step 3: Crear `PayCardSheet`**

Crear `src/presentation/bank/components/PayCardSheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { accountLabel } from "@/lib/bank-identity-label";
import { payCardAction } from "@/app/actions/bank";
import { money } from "../lib/format-money";
import type { BankAccountWithBalance, BankCardWithDebt } from "@/application/services/bank-service";

/** `YYYY-MM-DD` de hoy, para el input de fecha. */
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

interface PayCardSheetProps {
    card: BankCardWithDebt;
    accounts: BankAccountWithBalance[];
}

/**
 * Registrar un pago a la tarjeta.
 *
 * El monto llega precargado con la deuda entera: «marcar como pagada» es este
 * mismo sheet sin tocar el campo, no una contabilidad aparte. Editarlo permite
 * el pago parcial.
 */
export function PayCardSheet({ card, accounts }: PayCardSheetProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const preferred = accounts.find(a => a.accountType !== "CASH") ?? accounts[0];
    const [accountId, setAccountId] = useState(preferred?.id ?? "");
    const [amount, setAmount] = useState(String(card.debt));
    const [date, setDate] = useState(today());

    async function submit() {
        const parsed = Number(amount.replace(",", "."));
        if (Number.isNaN(parsed) || parsed <= 0) {
            toast.error("Escribe cuánto pagaste");
            return;
        }
        if (!accountId) {
            toast.error("Elige la cuenta de la que salió el dinero");
            return;
        }

        setSaving(true);
        const result = await payCardAction({
            cardId: card.id,
            sourceAccountId: accountId,
            amount: parsed,
            date: new Date(`${date}T12:00:00`).toISOString(),
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success(`Pago de ${money(parsed)} registrado`);
        setOpen(false);
        router.refresh();
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button size="sm" variant="secondary" className="shrink-0">Pagar</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="flex flex-col gap-4 rounded-t-3xl p-5">
                <SheetHeader className="p-0">
                    <SheetTitle>Pagar {money(card.debt)}</SheetTitle>
                </SheetHeader>

                {accounts.length === 0 ? (
                    <p className="text-sm text-amber-500">
                        Registra una cuenta para poder pagar esta tarjeta.
                    </p>
                ) : (
                    <>
                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Desde</span>
                            <Select value={accountId} onValueChange={setAccountId}>
                                <SelectTrigger aria-label="Cuenta de origen">
                                    <SelectValue placeholder="Elige una cuenta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {accountLabel(a)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Monto</span>
                            <Input
                                inputMode="decimal"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                aria-label="Monto del pago"
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-muted-foreground">Fecha</span>
                            <Input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                aria-label="Fecha del pago"
                            />
                        </label>

                        <Button onClick={submit} disabled={saving} className="w-full">
                            {saving ? "Registrando…" : "Registrar pago"}
                        </Button>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
```

`src/components/ui/sheet.tsx` ya existe en el repo; no hace falta instalar nada.

- [ ] **Step 4: Enganchar el botón en `CardDetailClient`**

En `src/presentation/bank/components/CardDetailClient.tsx`, dentro del bloque de la deuda, cambiar la fila del título y el monto para que el botón viva al lado:

```tsx
                <div className="relative flex flex-col gap-2.5">
                    <p className="text-sm font-medium text-white/85">Deuda total</p>
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[2rem] font-bold leading-none tracking-tight tabular-nums text-rose-400">
                            {money(card.debt)}
                        </h2>
                        {isCredit && card.debt > 0 && (
                            <PayCardSheet card={card} accounts={payableAccounts} />
                        )}
                    </div>
```

Y añadir el import: `import { PayCardSheet } from "./PayCardSheet";`

- [ ] **Step 5: Apuntar `StatementPanel` a la acción nueva**

En `src/presentation/bank/components/StatementPanel.tsx`:

- Cambiar el import `payStatementAction` por `payCardAction`.
- Añadir `cardId` a `StatementPanelProps` y pasarlo desde `CardDetailClient` (`<StatementPanel statement={open} cardId={card.id} accounts={payableAccounts} />`).
- En `handlePay`, cambiar la llamada:

```tsx
        const result = await payCardAction({
            cardId,
            sourceAccountId: source.id,
            amount: due,
            date: new Date().toISOString(),
        });
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/components/CardDetailClient.test.tsx`
Expected: PASS, 3 casos.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: ningún hallazgo nuevo en los archivos tocados (el repo arrastra hallazgos previos en otros archivos; comparar con `git stash` si hay duda).

- [ ] **Step 7: Commit**

```bash
git add src/presentation/bank/components/PayCardSheet.tsx src/presentation/bank/components/CardDetailClient.tsx src/presentation/bank/components/StatementPanel.tsx __tests__/components/CardDetailClient.test.tsx
git commit -m "feat(bancos): boton de pago en el detalle de tarjeta, con o sin estado abierto"
```

---

### Task 9: La pantalla de la bandeja

**Files:**
- Create: `src/app/financial/banks/payments/page.tsx`
- Create: `src/presentation/bank/components/PendingPaymentsList.tsx`
- Modify: `src/app/financial/banks/page.tsx` (añadir el enlace con contador)
- Test: `__tests__/components/PendingPaymentsList.test.tsx`

**Interfaces:**
- Consumes: `listPendingCardPayments` (Task 6); `confirmCardPaymentAction`, `dismissCardPaymentAction` (Task 7); `PaymentGroup` de `@/domain/services/card-payment-detection`.
- Produces: `<PendingPaymentsList groups={PaymentGroup[]} cards={BankCard[]} />` y la ruta `/financial/banks/payments`.

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/components/PendingPaymentsList.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingPaymentsList } from "@/presentation/bank/components/PendingPaymentsList";
import type { PaymentGroup } from "@/domain/services/card-payment-detection";
import type { BankCard } from "@/domain/entities/bank";

const confirmCardPaymentAction = jest.fn();
const dismissCardPaymentAction = jest.fn();

jest.mock("@/app/actions/bank", () => ({
    confirmCardPaymentAction: (...a: unknown[]) => confirmCardPaymentAction(...a),
    dismissCardPaymentAction: (...a: unknown[]) => dismissCardPaymentAction(...a),
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const CARD = {
    id: "card-8361", ownerUserId: "u1", cardType: "CREDIT", currency: "USD",
    lastFour: "8361", status: "ACTIVE", isUnconfirmed: false,
    institutionName: "Banco del Pacífico",
    createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", isDeleted: false,
} as unknown as BankCard;

const GROUP = {
    cardId: "card-8361", amount: 481.61, date: "2026-08-06T13:25:00Z",
    readNumber: "XXXX8361",
    primary: {
        id: "tx-1", description: "Pago de tarjeta de crédito",
        amount: 481.61, date: "2026-08-06T13:25:00Z", bankSourceAccountId: "acc-1",
    },
    twins: [{ id: "tx-2", description: "Pago de tarjeta de crédito", amount: 481.61 }],
} as unknown as PaymentGroup;

beforeEach(() => {
    jest.clearAllMocks();
    confirmCardPaymentAction.mockResolvedValue({ success: true, data: null });
    dismissCardPaymentAction.mockResolvedValue({ success: true, data: null });
});

describe("PendingPaymentsList", () => {
    it("muestra el monto, el número leído y que hay una copia", () => {
        render(<PendingPaymentsList groups={[GROUP]} cards={[CARD]} />);

        expect(screen.getByText(/481,61|481\.61/)).toBeInTheDocument();
        expect(screen.getByText(/XXXX8361/)).toBeInTheDocument();
        expect(screen.getByText(/2 registros/i)).toBeInTheDocument();
    });

    it("confirmar ata la transacción principal a la tarjeta propuesta", async () => {
        render(<PendingPaymentsList groups={[GROUP]} cards={[CARD]} />);

        fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

        await waitFor(() => {
            expect(confirmCardPaymentAction).toHaveBeenCalledWith({
                transactionId: "tx-1", cardId: "card-8361",
            });
        });
    });

    it("descartar manda solo la transacción principal", async () => {
        render(<PendingPaymentsList groups={[GROUP]} cards={[CARD]} />);

        fireEvent.click(screen.getByRole("button", { name: /descartar/i }));

        await waitFor(() => {
            expect(dismissCardPaymentAction).toHaveBeenCalledWith({ transactionId: "tx-1" });
        });
    });

    it("sin pendientes, lo dice en vez de mostrar una lista vacía", () => {
        render(<PendingPaymentsList groups={[]} cards={[CARD]} />);
        expect(screen.getByText(/no hay pagos por confirmar/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx jest __tests__/components/PendingPaymentsList.test.tsx`
Expected: FAIL — `Cannot find module '@/presentation/bank/components/PendingPaymentsList'`.

- [ ] **Step 3: Crear la lista**

Crear `src/presentation/bank/components/PendingPaymentsList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cardLabel } from "@/lib/bank-identity-label";
import { confirmCardPaymentAction, dismissCardPaymentAction } from "@/app/actions/bank";
import { money, shortDate } from "../lib/format-money";
import type { PaymentGroup } from "@/domain/services/card-payment-detection";
import type { BankCard } from "@/domain/entities/bank";

interface PendingPaymentsListProps {
    groups: PaymentGroup[];
    cards: BankCard[];
}

/**
 * Los pagos que la app detectó y todavía no tocan ninguna deuda.
 *
 * Nada de lo que se ve aquí ha movido un saldo: la deuda solo baja cuando el
 * usuario confirma. Un grupo con más de un registro es el mismo pago capturado
 * dos veces, y se confirma una sola vez.
 */
export function PendingPaymentsList({ groups, cards }: PendingPaymentsListProps) {
    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-muted/30 py-10 text-center">
                <Inbox className="h-8 w-8 opacity-20" />
                <p className="text-sm text-muted-foreground">No hay pagos por confirmar.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {groups.map(group => (
                <PendingPaymentCard key={group.primary.id} group={group} cards={cards} />
            ))}
        </div>
    );
}

function PendingPaymentCard({ group, cards }: { group: PaymentGroup; cards: BankCard[] }) {
    const router = useRouter();
    const [cardId, setCardId] = useState(group.cardId);
    const [busy, setBusy] = useState(false);
    const count = group.twins.length + 1;

    async function confirm() {
        setBusy(true);
        const result = await confirmCardPaymentAction({
            transactionId: group.primary.id, cardId,
        });
        setBusy(false);
        if (!result.success) return toast.error(result.error);
        toast.success(`Pago de ${money(group.amount)} atado a la tarjeta`);
        router.refresh();
    }

    async function dismiss() {
        setBusy(true);
        const result = await dismissCardPaymentAction({ transactionId: group.primary.id });
        setBusy(false);
        if (!result.success) return toast.error(result.error);
        toast.success("Descartado");
        router.refresh();
    }

    return (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums">{money(group.amount)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {shortDate(group.date)}
                    {count > 1 && ` · ${count} registros`}
                </span>
            </div>

            <p className="truncate text-sm text-muted-foreground">{group.primary.description}</p>
            <p className="text-xs text-muted-foreground">
                Número leído: <span className="font-mono">{group.readNumber}</span>
            </p>

            <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger aria-label="Tarjeta a la que se pagó">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {cards.map(card => (
                        <SelectItem key={card.id} value={card.id}>{cardLabel(card)}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <div className="flex gap-2">
                <Button onClick={confirm} disabled={busy} className="flex-1">Confirmar</Button>
                <Button onClick={dismiss} disabled={busy} variant="outline" className="flex-1">
                    Descartar
                </Button>
            </div>
        </section>
    );
}
```

- [ ] **Step 4: Crear la página**

Crear `src/app/financial/banks/payments/page.tsx`, siguiendo el patrón de `src/app/financial/banks/reconcile/page.tsx` (leerlo antes para copiar cómo resuelve el usuario y cómo trae el servicio del container):

```tsx
import { bankService, bankCardRepository } from "@/infrastructure/container";
import { requireUserId } from "@/infrastructure/supabase/auth-user";
import { PendingPaymentsList } from "@/presentation/bank/components/PendingPaymentsList";

export default async function CardPaymentsPage() {
    const userId = await requireUserId();
    const [groups, cards] = await Promise.all([
        bankService.listPendingCardPayments(userId),
        bankCardRepository.findByOwnerId(userId),
    ]);
    const creditCards = cards.filter(c => c.cardType === "CREDIT");

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-bold tracking-tight">Pagos por confirmar</h1>
                <p className="text-sm text-muted-foreground">
                    Ninguno de estos pagos ha bajado todavía la deuda de su tarjeta.
                </p>
            </header>
            <PendingPaymentsList groups={groups} cards={creditCards} />
        </div>
    );
}
```

`BankService` no expone un listado de tarjetas: la página toma el repositorio directo del container, que es lo que ya hacen otras páginas de Bancos para datos de solo lectura.

- [ ] **Step 5: Enlazar desde el resumen de Bancos**

En `src/app/financial/banks/page.tsx`, cargar `bankService.listPendingCardPayments(userId)` junto a los datos que ya trae y, cuando la lista no esté vacía, dibujar un enlace arriba de la lista de cuentas:

```tsx
{pendingPayments.length > 0 && (
    <Link
        href="/financial/banks/payments"
        className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
        <span>
            {pendingPayments.length === 1
                ? "1 pago de tarjeta por confirmar"
                : `${pendingPayments.length} pagos de tarjeta por confirmar`}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" />
    </Link>
)}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx jest __tests__/components/PendingPaymentsList.test.tsx`
Expected: PASS, 4 casos.

Run: `npx jest`
Expected: toda la suite en verde.

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/financial/banks/payments/page.tsx src/presentation/bank/components/PendingPaymentsList.tsx src/app/financial/banks/page.tsx __tests__/components/PendingPaymentsList.test.tsx
git commit -m "feat(bancos): pantalla de pagos de tarjeta por confirmar"
```

---

## Verificación final

- [ ] `npx jest` — toda la suite en verde.
- [ ] `npx tsc --noEmit` — sin errores.
- [ ] `npm run lint` — sin hallazgos nuevos en los archivos tocados.
- [ ] `npm run build` — compila.
- [ ] En la app, con la Mastercard XXXX8361: el botón **Pagar** aparece junto a los $534,56, el sheet precarga ese monto, y tras registrar el pago la deuda queda en cero y la cuenta de origen refleja la salida.
- [ ] `graphify update .` para refrescar el grafo.
- [ ] **No hacer push ni abrir PR sin permiso explícito del usuario.**
