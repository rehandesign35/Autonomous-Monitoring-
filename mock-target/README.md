# Mock Target: SunPeak Solar Pricing Page

This folder contains a deliberately controlled mock target site for an autonomous monitoring agent exercise. It is not a real company website and should not be treated as one.

## Why this mock target exists

This page exists to provide a fully controlled target for later resilience testing. The reasoning is simple:

- No ToS or legal risk: it is fictional, and it is not a live business website that could be confused with a real company.
- Full control over change timing: the structure and pricing can be intentionally modified later in a safe, documented way.
- Better debugging: the agent can be tested against a known source of truth to see whether it survives a redesign without failing extraction or navigation.

## Current HTML structure version

This mock page has been intentionally redesigned and is labeled as v2.

- Version: v2
- Page type: static hand-authored pricing page with a layout-only redesign
- Company: SunPeak Solar
- Data source: [data.json](data.json)
- View: [index.html](index.html)

The v2 version keeps the same pricing content, names, values, and feature language as v1 while changing the visual structure to prove the agent is resilient to layout redesigns rather than brittle to DOM changes. The baseline v1 snapshot remains the reference point for comparison.

## Notes

The HTML is intentionally authored by hand to mirror a real small business solar company pricing page. The JSON file is the structured source-of-truth used for future comparison and accuracy testing.
