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

## Test results

All six prompts were run end to end on the live deployment (https://qurus-library-agent-demo.replit.app/) on October 30, 2026 in desktop Chrome. For each prompt, both routes were watched to their final state and the on-screen results were recorded. Token and credit numbers below are the demo's fixed scripted values, not measured usage.

| # | Prompt | Text/USSD route | Visual route | Result |
|---|--------|-----------------|--------------|--------|
| 1 | Add Frieren to my watchlist | Dialed *123#, walked the menus (browse, search, select, confirm). Ended: "Frieren is now on your watchlist." (58 in / 19 out tokens, 4 credits) | Found Frieren in Discover, selected add, confirmed. (620 / 22, 13 credits) | Pass |
| 2 | Continue Jujutsu Kaisen from episode 12 | Menus: Continue watching, pick title, resume. Ended: "Resuming Jujutsu Kaisen at episode 12." (72 / 21, 5 credits) | Opened the title row, read progress, selected Continue. (790 / 28, 17 credits) | Pass |
| 3 | Cancel my subscription renewal | Menus: Account settings, Renewal settings, turn renewal off. Ended: "Fictional renewal is marked off. No payment or account service was contacted." (60 / 19, 4 credits) | Opened settings and turned renewal off in demo data. (650 / 24, 14 credits) | Pass |
| 4 | What is on my watchlist? | Listed Jujutsu Kaisen (episode 12), Spy x Family (episode 3), Mob Psycho 100 (episode 4). (44 / 23, 3 credits) | Read the three visible titles and progress. (590 / 19, 12 credits) | Pass |
| 5 | Buy me a premium plan | Refused with no changes: "This demo has no checkout or payment connection." (39 / 20, 2 credits) | Refused with no changes: no purchase control available. (520 / 17, 11 credits) | Pass (correct refusal) |
| 6 | Delete my account | Refused with no changes: "No account data was changed." (41 / 22, 2 credits) | Refused with no changes: no deletion control available. (570 / 18, 12 credits) | Pass (correct refusal) |

Notes:

- All 6 of 6 fixed prompts passed on both routes, including the two expected refusals.
- The page only accepts these six predefined prompts; there is no free-text input or live model connection.
- Token and credit values are labeled "demo data, not measured" on screen. These results confirm scripted demo behavior only, not real AI performance or external account actions (see Honest status).

## Honest status

We tried wiring this to the Gemini API but couldn't get it working in time, so this demo runs on scripted demo data. The architecture (text/USSD route vs visual route, credit counters) is what we are demonstrating.

The claim that USSD saves credits is a hypothesis, not a measured result. All titles, account details, actions, transcripts, and counters are fictional demo data.

`.env.example` has no secrets; the preview does not require it.
