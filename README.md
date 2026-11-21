
# Qurus — Watchlist route demo

## Honest status

This is a scripted classroom demo, not a working AI agent.

We tried connecting the demo to the Gemini API but could not get it working in time. The current version runs entirely on pre-written data in the browser. There are no live model calls, API keys, account integrations, database operations, or paid services.

The demo compares two fictional interface routes:

- A text/USSD-style menu route.
- A visual web route.

The claim that USSD saves AI credits is a **hypothesis, not a measured result**.

All token counts, model-call counts, credits, transcripts, actions, titles, and account details are fixed fictional demo data. They do not measure real AI usage, performance, costs, or savings.

No real payments, purchases, subscriptions, account changes, or streaming operations occur.

## Run it

Open the Qurus web preview in Replit.

The six fixed scenarios work entirely in the browser. No API key, model configuration, database, billing setup, paid upgrade, or paid service is required.

The Express service only exposes its health check.

The demo app is located at:

`artifacts/qurus/`

The React application is in:

`artifacts/qurus/src/App.tsx`

The shared scenario definitions are in:

`artifacts/qurus/src/demo-data.ts`

The existing styling is in:

`artifacts/qurus/src/demo.css`

No `.env` file is required. The existing `.env.example` contains no secrets.

### Playback controls

Choose one of the six scenario buttons.

Each scenario begins with a fresh fictional watchlist. Selecting another scenario intentionally resets the demonstration.

Two playback modes are available:

- **Autoplay:** Both routes advance with the existing scripted timing.
- **Click through:** Each meaningful step advances only when the viewer clicks **Next step**.

The **Replay both routes** button restarts the selected scenario.

Neither playback mode connects to a model or an external service.

## Tests

An automated scenario test runner is provided at:

`scripts/test-scenarios.ts`

From the monorepo root, run:

```bash
node scripts/test-scenarios.ts
```

The test runner uses Node 24's built-in TypeScript support and `node:assert/strict`. No additional dependencies or test frameworks are required.

### What the automated tests check

For each of the six scenarios, the runner:

1. Types the fictional USSD service code `*123#`.
2. Opens each scripted text menu and checks its options.
3. Types and sends every scripted menu choice.
4. Walks the visual route through all its scripted steps.
5. Checks both final replies against independent expected results.
6. Checks input tokens, output tokens, model-call counts, and credits against the original fixed demo values.
7. Checks that the two refusal scenarios send no state-changing actions.
8. Checks that both routes start with fresh fictional state and that scenarios do not leak state into subsequent runs.

Expected refusals are treated as successful test outcomes.

The script prints a dated PASS or FAIL line for every scenario, followed by a final summary.

A successful run ends with:

```text
[2026-11-21] PASS Scenario 1 (frieren) - both routes complete
[2026-11-21] PASS Scenario 2 (continue) - both routes complete
[2026-11-21] PASS Scenario 3 (renewal) - both routes complete
[2026-11-21] PASS Scenario 4 (list) - both routes complete
[2026-11-21] PASS Scenario 5 (premium) - expected refusal, no changes
[2026-11-21] PASS Scenario 6 (delete) - expected refusal, no changes
[2026-11-21] 6/6 scenarios passed
```

The complete summary line also includes the run date.

Any failed assertion sets a non-zero process exit code.

### Test scope

These are automated tests of the shared scripted scenario definitions and their fictional route transitions.

They are not browser end-to-end tests and do not execute React, click actual DOM elements, contact a USSD carrier, call an AI model, or verify real accounts.

The tests confirm the internal consistency and expected behavior of this classroom simulation only.

## Test results — 2026-11-21 (UTC)

### Automated scenario tests

Run:

```bash
node scripts/test-scenarios.ts
```

Output from the Replit shell on 2026-11-21 (UTC):

```text
[2026-11-21] PASS Scenario 1 (frieren) - both routes complete
[2026-11-21] PASS Scenario 2 (continue) - both routes complete
[2026-11-21] PASS Scenario 3 (renewal) - both routes complete
[2026-11-21] PASS Scenario 4 (list) - both routes complete
[2026-11-21] PASS Scenario 5 (premium) - expected refusal, no changes
[2026-11-21] PASS Scenario 6 (delete) - expected refusal, no changes
[2026-11-21] 6/6 scenarios passed
(node:1047) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///tmp/qurus/scripts/test-scenarios.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /tmp/qurus/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
```

All 6 of 6 scenarios passed, including the two expected refusals (premium plan purchase and account deletion). The tests walk both scripted routes for every scenario and assert final replies, refusal behavior with no state changes, fixed counter values, and scenario independence.

### Previous manual browser test — October 30, 2026

All six fixed prompts were manually exercised on the live demo in desktop Chrome on October 30, 2026.

Deployment:

https://qurus-library-agent-demo.replit.app/

Both routes were observed through their final scripted states.

| # | Scenario | Text/USSD result | Visual result | Manual outcome |
|---|----------|------------------|---------------|----------------|
| 1 | Add Frieren | Dialed `*123#`, browsed, searched, selected, confirmed; Frieren added | Found Frieren in Discover and confirmed addition | Pass |
| 2 | Continue Jujutsu Kaisen | Opened Continue watching and selected Episode 12 | Opened title row and selected Continue | Pass |
| 3 | Cancel renewal | Opened account settings and turned fictional renewal off | Changed renewal setting in demo data | Pass |
| 4 | View watchlist | Listed the three fictional watchlist entries | Displayed the three watchlist titles and progress | Pass |
| 5 | Buy premium | Refused; no purchase was made | Refused; no purchase control available | Pass, expected refusal |
| 6 | Delete account | Refused; no account data changed | Refused; no deletion control available | Pass, expected refusal |

These results document the earlier manual browser observations. They are not evidence that the new automated script has passed.

All token and credit figures remain fixed illustrative values.

## What the demo shows

Qurus compares two ways of completing the same fictional anime-watchlist task.

### Text / USSD-style route

The left phone demonstrates:

- Entering the fictional service code `*123#`.
- Opening text-based menus.
- Reading menu options.
- Typing scripted numerical choices.
- Sending scripted menu replies.
- Displaying the final scripted result or refusal.

This is a browser simulation. It is not connected to a mobile carrier or real USSD service.

### Visual / web route

The right phone demonstrates:

- A fictional anime watchlist interface.
- A sequence of pre-written screen actions.
- A simulated input pad.
- Fixed scripted results or refusals.

No actual streaming, playback service, or user account is connected.

### Six fixed scenarios

1. Add Frieren to a fictional watchlist.
2. Continue Jujutsu Kaisen from episode 12.
3. Cancel a fictional subscription renewal.
4. Read the fictional watchlist.
5. Refuse a premium-plan purchase.
6. Refuse account deletion.

The last two scenarios are intentional refusals. They do not perform an account change or send a purchase or deletion request.

### Demo counters

Both routes display fixed example values for:

- Input tokens.
- Output tokens.
- Model calls.
- Demo credits.

These numbers are scripted, not measured.

They demonstrate a proposed comparison framework, not a validated efficiency improvement.

### Limitations

The demo does not accept free-typed user tasks.

It does not use a live language model, perform real AI reasoning, access a payment service, alter real user data, or measure actual model usage.

Scenario selection intentionally resets the fictional watchlist so results are reproducible.

The purpose is to illustrate two possible interface designs and support classroom discussion about a hypothesis that would require real-world testing.

