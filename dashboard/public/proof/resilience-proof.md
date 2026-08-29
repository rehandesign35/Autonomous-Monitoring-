# Resilience proof: v1 → v2 layout redesign

This proof tests the central claim of the autonomous monitoring project: the agent survives a website redesign without any changes to its extraction logic, because it relies on visible page text and structured extraction instead of brittle CSS selectors or DOM structure.

## What changed

The mock target page was intentionally redesigned from the original v1 layout to a v2 layout while preserving the same pricing content and same visible text values.

- v1: classic pricing card grid with the original page composition.
- v2: reorganized hero, insight panel, and pricing-card structure.
- Agent code changes: none.

The v2 page preserves SunPeak Solar, the 2026-08-29T10:45:00-07:00 timestamp, all four tier names, all four prices, and all 16 feature strings.

## Why this proves resilience

The agent reads visible page text, extracts structured pricing data with an LLM, validates the schema, and compares the result with the prior snapshot. It does not depend on a specific CSS selector or DOM hierarchy.

This proves the tested v1 → v2 layout case. It does not claim the system handles every redesign, ambiguous sentence, or inaccessible page.

The source documentation remains in the repository at `docs/resilience-proof.md`.
