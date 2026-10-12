# Qurus

Qurus is a Stage 1 classroom demo comparing a scripted agent’s actions on the fictional Shelf library through a web-based text-menu simulation and a normal visual website.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/qurus` — React/Vite app, home comparison runner, and `/library`.
- `artifacts/api-server` — Express API, shared Shelf library service, persistent text-menu sessions, and local agent stub.
- `lib/api-spec/openapi.yaml` — source-of-truth API contract; regenerate hooks and schemas with the API-spec codegen command.
- `lib/db` — Drizzle schema for persisted fixture state, idempotency results, and menu sessions.
- `README.md` — run instructions and Stage 1 scope.

## Architecture decisions

- The website, text-menu state machine, and agent stub share the same PostgreSQL-backed library service.
- Text-menu sessions are a browser-based simulation only; they do not use carrier USSD or SMS.
- The local agent is intentionally stubbed and reports simulated token/cost estimates until a model is deliberately configured.
- Mutations use server-side validation, idempotency keys, and receipt IDs; each agent run verifies persisted records.

## Product

The demo supports renewing an eligible loan, reserving an available title, cancelling an active hold, and reading a due date. A blocked renewal must not change the record; payments and fines are unsupported.
Use only the seeded fictional patron and books. Do not add real patron data, payments, paid services, or model credentials in Stage 1.

## User preferences

Keep this project at Stage 1 unless the user asks to expand it. Do not add a presentation deck.

## Gotchas

The API and web app use separate workflows; both must be running for the complete comparison. Apply development schema changes with `pnpm --filter @workspace/db run push`. Keep all credentials in Replit Secrets/environment, never in `.env.example`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
