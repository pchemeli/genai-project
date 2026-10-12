# Qurus

Qurus is a working classroom comparison app for the fictional Shelf library. It runs the same request through a Gemini text-menu agent and a real screenshot-driven website agent, then checks the committed library records.

## Run it

The Replit workspace has separate Express API and Qurus Vite workflows. Start both. The API uses the workspace PostgreSQL database; apply schema changes in a fresh workspace with:

```sh
pnpm --filter @workspace/db run push
```

Useful development checks:

```sh
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/qurus run typecheck
pnpm --filter @workspace/api-spec run codegen
```

## Gemini and cost controls

- The selected model is `gemini-3.1-flash-lite`, configured through `MODEL_ID`. The server allows only this selected free-tier model.
- Add `GEMINI_API_KEY` to Replit Secrets. Never place it in `.env.example`, source code, database rows, logs, or browser code. The app sends only fictional Shelf tasks, fictional records, and (for the visual route) screenshots of this app.
- No billing, paid upgrade, or paid service is enabled. Cost remains **Unknown** because this demo has no configured rate table. Do not use real patron or other personal data: Google's free-tier terms may allow submitted content to be used to improve its products.
- Each route stores the provider's raw `usageMetadata` for every model response. The UI sums returned input, output, and cached token counts, and labels them measured. Missing provider fields remain unknown.
- PostgreSQL advisory locking allows one run at a time. `QURUS_MAX_RUNS_PER_HOUR` defaults to 30 and accepts integers from 1 to 1000.

## The two routes

- The text route uses only `dial(code)`, `reply(value)`, and `endSession()`. Gemini sees the exact current text menu on each turn and chooses visible digits. It is a web simulation, not carrier USSD. The agent has at most 12 turns.
- The visual route launches Playwright Chromium at 1280 × 800 and opens only this app's `/library` page. Gemini receives screenshots and chooses `click(x,y)`, `type(text)`, `scroll(deltaY)`, `press(key)`, or `finish()`. It has a 20-turn and 90-second limit. No DOM text or accessibility tree is sent to the model.
- If Chromium cannot launch or cannot load `/library`, the visual route shows **Simulated** and the browser error. It does not perform scripted actions or claim a successful run.
- Server-side Shelf operations validate and return idempotent receipts. After every run, the verifier reads committed records. Token savings appear only when both live routes complete, pass verification, use the same prompt, and start from the same fixture state. Negative savings and unavailable comparisons are shown explicitly.
- Payment and fine requests are unsupported and blocked from changing library records.

## Shelf fixture

The app seeds one demo reader and fictional titles, including *The Long Way Home* (due 15 October 2026), *Data for Everyone* (renewal blocked by another reader's hold), *Quiet Rivers* (active hold), and *Field Notes on Cities* (available). Renewing the first title once moves its due date to 29 October 2026. **Reset fixture state** restores the original records without clearing route measurements.

`/library` is the normal catalog, loan, and hold interface. The comparison page includes six example prompts and a manual text-session keypad for direct API testing.

## API contract and source

The OpenAPI contract is in `lib/api-spec/openapi.yaml`; generated client hooks and schemas are under `lib/api-client-react` and `lib/api-zod`. The Shelf service, text-menu state machine, agent routes, verifier, and usage persistence are in `artifacts/api-server`. The React app is in `artifacts/qurus`.

See `.env.example` for non-secret configuration. Replit supplies the database connection at runtime; use a secret manager for any private local credentials.
