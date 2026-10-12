---
name: Gemini screenshot coordinate mapping
description: Handling normalized coordinates from screenshot-driven Gemini function calls.
---

Gemini image-click coordinates may use a normalized 0–1000 scale even when the browser viewport uses CSS pixels. Convert each axis proportionally to the viewport bounds, round, and clamp before calling Playwright. Keep the agent's observations screenshot-only and validate committed results after actions.

**Why:** In Qurus, the model repeatedly selected a point that looked out of bounds when interpreted as pixels; scaling it to the 1280×800 viewport landed on the visible control and the action passed verification. A grid overlay did not improve the model's choices and was removed.

**How to apply:** State the normalized scale in visual tool descriptions and perform the coordinate conversion server-side. Do not read DOM selectors or silently remap based on page elements.
