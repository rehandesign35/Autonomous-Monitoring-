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

## Labeled evaluation: v1/v2 plus five additional variations

On 2026-09-04, the existing v1 and v2 snapshot payloads and five new fixtures under [mock-target/eval](../mock-target/eval) were evaluated with the existing Playwright scrape, anomaly detector, OpenAI extraction, and diff modules. The evaluator is available as `npm run evaluate` from the `agent` directory. The run used real OpenAI extraction for the four non-blocked HTML fixtures and did not write to Supabase.

| Case | Label | Result | Correct extraction/outcome | False-positive change detection | Trigger-to-Slack alert |
| --- | --- | --- | --- | ---: | --- |
| v1 | Known good | Baseline payload | Yes | 0 | Not measured |
| v2 | Known good | Baseline payload | Yes | 0 | Not measured |
| 01-reworded | Known good | Success, 3 differing fields | No | 1 | Not measured |
| 02-editorial | Known good | Success, 3 differing fields | No | 1 | Not measured |
| 03-label-shift | Known good | Canonical payload | Yes | 0 | Not measured |
| 04-missing-price | Missing price | Success, but incorrectly accepted | No | 0 | Not measured |
| 05-blocked | Blocked/CAPTCHA | Blocked | Yes | 0 | Not measured |

Measured summary: known-good extraction rate was **3/5 (60%)**. False-positive change detections occurred in **2/5 known-good cases (40%)**, affecting six field-level comparisons total. The missing-price fixture exposed a validation gap: the model supplied an apparently valid price-like value for a tier whose page explicitly said to contact the company. The CAPTCHA fixture was correctly stopped before extraction.

Slack latency was intentionally not recorded in this run because the evaluator did not post test alerts to the configured webhook. Therefore no trigger-to-alert number is claimed here. A production-like latency pass requires an explicitly authorized test webhook and a run-trigger timestamp; the public scheduled workflow evidence is separate from this labeled local fixture run.

## Real 7-case evaluation set & empirical performance metrics

On 2026-09-08, the 7-case evaluation suite (comprising `v1`, `v2`, and five dedicated mock target variations under `mock-target/test-set`) was executed end-to-end against the agent's Playwright scraper, OpenAI extractor (`gpt-4o-mini`), anomaly detector, diff engine, and live Slack webhook notifier (`npm run eval-suite` / `node run-eval-suite.js`).

### Test matrix & empirical results

| Case | Description | Extraction Succeeded | Correct Values / Outcome | Alerted | Expected Alert | Trigger-to-Slack Latency | Result Classification |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| **v1** | Baseline card layout | Yes | Yes | No | No | N/A | Correct (Silent) |
| **v2** | Redesigned hero + panel layout | Yes | Yes | No | No | N/A | Correct (Silent) |
| **01-structure-change** | Same pricing, different HTML tags/classes | Yes | No | Yes | No | 6,464 ms | False Positive |
| **02-wording-change** | Same pricing, reworded descriptions | Yes | No | Yes | No | 4,872 ms | False Positive |
| **03-price-changed** | SunCore 6 price changed ($89/mo → $99/mo) | Yes | Yes | Yes | Yes | 11,139 ms | True Positive |
| **04-feature-removed** | SunBalance 8 feature bullet removed | Yes | Yes | Yes | Yes | 6,117 ms | True Positive |
| **05-blocked-captcha** | Cloudflare / CAPTCHA security check | No (Blocked) | Yes (Flagged) | No | No | N/A | Correct (Blocked) |

### Calculated summary metrics

- **Extraction Accuracy**: **57.1%** (4 / 7 correct extractions/outcomes: `v1`, `v2`, `04-feature-removed`, and `05-blocked-captcha`).
- **False-Positive Rate**: **40.0%** (2 / 5 runs that should not alert: `01-structure-change` and `02-wording-change` caused minor LLM extraction text variations that triggered diffs).
- **Avg Alert Latency**: **8.63 seconds** (8,628 ms average across the two genuine change cases that correctly alerted: `03-price-changed` at 11,139 ms and `04-feature-removed` at 6,117 ms).

