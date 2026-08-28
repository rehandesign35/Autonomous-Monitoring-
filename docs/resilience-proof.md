# Resilience proof: v1 → v2 layout redesign

## Goal

This proof tests the central claim of the autonomous monitoring project: the agent survives a website redesign without any changes to its extraction logic, because it relies on visible page text and structured extraction instead of brittle CSS selectors or DOM structure.

## What changed

The mock target page was intentionally redesigned from the original v1 layout to a v2 layout while preserving the same pricing content and same visible text values.

### Layout-only difference

- v1 structure: a classic card grid with a sticky header and a standard pricing card layout.
- v2 structure: the same content remains, but the visual composition is reorganized into a new hero + insight panel + different card styling while the wording and values stay the same.

### Critical rule

No agent code was changed. The scraper, anomaly detector, OpenAI extraction prompt, and diff logic remain identical before and after the redesign.

## Baseline evidence

The original pricing payload was saved as the before snapshot in [before-snapshot.json](before-snapshot.json).

```json
{
  "company": "SunPeak Solar",
  "lastUpdated": "2026-08-29T10:45:00-07:00",
  "tiers": [
    { "name": "SunCore 6", "priceLabel": "$89/mo" },
    { "name": "SunBalance 8", "priceLabel": "$129/mo" },
    { "name": "SunMax 10", "priceLabel": "$169/mo" },
    { "name": "SunReserve", "priceLabel": "From $219/mo" }
  ]
}
```

## After redesign evidence

The redesigned page still exposes the same pricing content and the same company name, last-updated timestamp, and pricing tier names and values. The after snapshot is preserved in [after-snapshot.json](after-snapshot.json).

## Why this proves resilience

The agent is resilient because it does not anchor to a specific page template or hierarchy. It reads the visible page text, extracts structure with an LLM, and compares the resulting JSON to the previous snapshot. As long as the pricing facts remain consistent, the same extraction schema continues to validate.

This is intentionally different from brittle extraction methods that fail when a layout changes, a card order changes, or the DOM structure changes.

## Summary

The v1 → v2 redesign changed the page structure, not the pricing meaning. The system continued to extract the same structured pricing data without code changes, which is the core evidence that this autonomous monitoring system is resilient to redesigns.
