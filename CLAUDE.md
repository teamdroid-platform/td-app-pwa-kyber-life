# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Kyber Life: personal finance + grocery shopping management app. Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), Supabase, Zod 4, Jest. Primary docs are in Spanish; see `docs/contexto-proyecto-ia.md` for a functional overview and `definitions/` for PRDs.

## Commands

```bash
npm run dev        # dev server (uses --webpack flag) at http://localhost:3000
npm run build      # production build
npm run lint       # eslint
npm test           # all Jest tests (next/jest + jsdom, jest.config.js)

# Single test file
npx jest __tests__/services/purchase-service.test.ts
# Filter by test name
npm test -- -t "should create purchase"

# Node-only unit config (babel-jest, no jsdom/next setup) — used for service tests
npx jest --config jest.unit.config.js
```

Tests live in `__tests__/` (services, components, integration, validators, domain). `uuid` is mocked via `src/__mocks__/uuid.js` in both Jest configs.

**Search tip:** scope searches to `src/` or `__tests__/` — repo-root searches can time out due to `node_modules/`, `.next/`, and `.agent/`.

## Architecture

Clean Architecture with a strict layering. Dependency direction: app/presentation → application → domain; infrastructure implements domain interfaces.

- **`src/domain`** — entities (`entities/`), repository interfaces (`repositories/`, e.g. `IFinancialTransactionRepository`), pagination types (`pagination.ts`), core types (`core.ts`). No framework imports.
- **`src/application/services`** — business logic services (e.g. `FinancialTransactionService`, `PurchaseService`). Repositories are constructor-injected via interfaces.
- **`src/infrastructure`** — repository implementations: in-memory (`repositories/implementations.ts`) and Supabase (`repositories/supabase/`), plus Supabase clients (`supabase/`), seed data, and offline cache.
- **`src/infrastructure/container.ts`** — the composition root. Exports singleton repositories and services. Picks Supabase vs in-memory per repo based on `process.env.DATA_SOURCE === 'SUPABASE'`. In-memory singletons are stored on `global` to survive dev hot reloads (preserving seeded state); Supabase repos are stateless, so they are created fresh on each module evaluation and reflect code changes on hot-reload without a restart. New repos/services must be wired here.
- **`src/app`** — Next.js App Router. Route groups: `auth/`, `dashboard/`, `market/`, `financial/`, `profile/`. Server Actions live in `src/app/actions/*.ts`.
- **`src/presentation`** — feature UI components (e.g. `presentation/financial/components/`). Shared shadcn/ui primitives are in `src/components`.
- **`src/lib`** — Zod schemas in `validators/`, client session strategies in `session/`, feature flags in `feature-flags.ts`.

### Server Action pattern

All mutations/queries from the client go through Server Actions (`"use server"` files in `src/app/actions/`). The established pattern:

1. Validate input with the Zod schema from `src/lib/validators/`.
2. Resolve the authenticated user id (Supabase `auth.getUser()`).
3. Call the service from `@/infrastructure/container`.
4. Return `{ success: true, data }` or `{ success: false, error }` — never throw to the client.

### Data source switching

Persistence is selected by env vars (must match each other):

- `DATA_SOURCE` (server): `SUPABASE` | `MEMORY` | `MOCK`
- `NEXT_PUBLIC_AUTH_STRATEGY` (client): same value; drives `src/lib/session/session-strategy-factory.ts` (SupabaseSessionStrategy vs MockSessionStrategy)

MOCK mode seeds data from `src/infrastructure/seed/` (test user: `test@test.com` / `test`). Copy `.env.example` to `.env`; the README documents all variables, including the `NEXT_PUBLIC_FF_FINANCIAL_*` feature flags.

### Routing / auth middleware

`src/proxy.ts` (Next 16's middleware equivalent) protects routes. In SUPABASE mode it delegates to `updateSession` from `src/infrastructure/supabase/middleware`; otherwise it checks the `kyber_session` cookie. Protected prefixes: `/dashboard`, `/market`, `/purchases`, `/profile` (note: `/financial` is enforced via its layout, not the proxy).

### Supabase

SQL migrations live in `supabase/migrations/`. Tables use RLS scoped to the owner user. See `docs/supabase.md`.

## Project rules (from AGENTS.md)

`AGENTS.md` maps task types to skills under `.agent/skills/skills/<name>/SKILL.md` — consult them when relevant. Non-negotiable rules:

- **Never commit, push, open PRs, or deploy without explicit user permission.**
- Strict TypeScript — no `any` unless strictly necessary.
- Mobile-first responsive design is mandatory; visual changes must preserve the existing premium aesthetic.
- Temporary/debug/experiment files go in `scratch/` (gitignored), never scattered in the repo.
- "Production readiness" checks must report failures (tests, build, env vars) without auto-fixing them.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
