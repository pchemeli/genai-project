# Qurus — Watchlist route demo

A small classroom demo that compares two scripted ways of completing anime-watchlist tasks: a text/USSD-style menu and a visual web route.

## Run it

Open the Qurus web preview. The six fixed demo prompts work entirely in the browser. No API key, model configuration, database, billing, paid upgrade, or paid service is needed. The Express service only exposes its health check.

## What the demo shows

- Choose one of six fixed prompts; both phone interfaces animate pre-written scripted results.
- The left phone shows the text/USSD-style route. The right phone shows the visual watchlist route and a demo keypad.
- Input/output token and credit counters are fixed **demo data**, not measured provider usage or real credits.
- Fictional examples include adding Frieren, continuing Jujutsu Kaisen from episode 12, canceling a fictional renewal, viewing a watchlist, and two refusals.
- No free-typed prompts are accepted. No purchase, account deletion, subscription API, or model call is performed.

## Honest status

We tried wiring this to the Gemini API but couldn't get it working in time, so this demo runs on scripted demo data. The architecture (text/USSD route vs visual route, credit counters) is what we are demonstrating.

The claim that USSD saves credits is a hypothesis, not a measured result. All titles, account details, actions, transcripts, and counters are fictional demo data.

`.env.example` has no secrets; the preview does not require it.
