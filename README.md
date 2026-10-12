# Qurus

Qurus is a Stage 1 classroom demo comparing a scripted agent’s library task through two interfaces for the fictional Shelf library: a web-based text-menu simulation and a normal visual library website.

## Run it

The Replit workspace has separate workflows for the Express API and the Qurus Vite app. Start both to use the app. The API uses the workspace PostgreSQL database; `pnpm --filter @workspace/db run push` applies the current development schema when setting up a fresh workspace.

Useful commands:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/qurus run dev
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/qurus run typecheck
pnpm --filter @workspace/api-spec run codegen
```

See `.env.example` for non-secret configuration notes. Replit supplies the database connection at runtime; do not commit database credentials or other secrets.

## Stage 1 scope

- The fictional demo patron and all catalog records are seeded by the shared API service and persist in PostgreSQL.
- `/library` is the interactive visual catalog, loan, and hold interface. The home page runs the same request through the text-menu simulation or the visual route.
- `POST /api/text/session` starts a simulated session with `*123#`; `POST /api/text/session/:id/input` advances it one digit at a time. This is not carrier USSD or an SMS service.
- Mutations validate on the server, accept idempotency keys, and return receipt IDs. The verifier reads the committed records after each agent run. Use **Reset fixture state** to restore the original demo records.
- The agent is a clearly labeled local simulation behind `runAgent`; no language-model integration or API key is configured. Token and cost values are labeled simulated estimates. Runtime is measured for the local simulation only.
- Payments, fines, real patron data, and paid services are out of scope.

## API and source of truth

The OpenAPI contract is in `lib/api-spec/openapi.yaml`; generated client hooks and schemas are under `lib/api-client-react` and `lib/api-zod`. The shared Shelf service, text-menu state machine, and simulated agent run in `artifacts/api-server`. The React app is in `artifacts/qurus`.

All displayed state is demo fixture data. Do not add real patron data or connect a model/payment provider as part of Stage 1.
