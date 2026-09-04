# Autonomous monitoring agent

This agent demonstrates the resilience mechanism behind the portfolio project: instead of relying on selectors or brittle DOM assumptions, it navigates to a public website, captures the full visible text, and asks an LLM to extract the structured pricing data.

## Why extraction is LLM-based instead of selector-based

A selector-based scraper would break as soon as the website is redesigned, renamed, or restructured. The page might still be readable to a human, but the CSS classes, HTML hierarchy, and text placement could change completely. Using a page-text extraction approach makes the agent robust to those changes because it focuses on the content a person can see, not the implementation details of a specific DOM layout.

This is the key resilience proof for the project: the agent is designed to survive a redesign as long as the information remains visible in plain language.

## What the block or CAPTCHA detection looks for

The current detection is intentionally simple and defensive. `scrape.js` logs a warning and exits gracefully when the page content appears to be a block page or bot challenge. It looks for common patterns such as:

- "verify you are human"
- "captcha"
- "cloudflare"
- "security check"
- "access denied"
- "too many requests"
- "ddos protection"

If the page title or the visible text contains one of these signals, the script treats it as a likely block/CAPTCHA page instead of trying to extract data from it.

## What counts as a change vs noise

A meaningful change is a difference in the structured pricing data that matters to the portfolio benchmark. This includes:

- a pricing tier name changing
- a price value changing
- a feature being added or removed
- the "last updated" value changing
- a company identifier changing on the page

Noise is ignored by design. For example, minor formatting differences in spacing or wording that do not change the meaning of the extracted data are not considered significant changes unless they affect the structured field values themselves.

The first run is treated as a special case: if no previous snapshot exists, the agent stores the extraction and treats it as the baseline. It does not log a false-positive change on the initial run.

### Flapping prevention

During verification, repeated change records were traced to two separate issues. The live v2 page was stable, but the extraction schema and prompt allowed the model to vary display labels, price formatting, date formatting, and whether tier descriptions were included as features. In addition, the intentional `--simulate-change` test writes a changed payload to the same snapshot history, so the next real run correctly reconciles that test value with the live page.

The extractor now asks for canonical values and normalizes the structured response before diffing: marketing labels are removed from tier names, prices use `/mo`, timestamps use the canonical PT ISO format, and only four factual feature bullets are retained. A baseline reconciliation may legitimately produce one change; after that, three consecutive unchanged live runs produced zero changes. Simulation data should be treated as test data, not as a production baseline.

## What happens when something goes wrong

This project is intentionally honest about failure handling. There are a few outcome states the run can produce:

- success: page loads, extraction is valid, diff is computed, snapshot is saved, and the run is marked successful.
- blocked: the page text or title matches common CAPTCHA/block wording, or an HTTP 403/429-like status suggests challenge or rate-limiting. The agent logs the event and stops; it does not try to evade or solve the challenge.
- load_failure: Playwright could not load the page or the navigation timed out. The agent logs the failure and stops cleanly.
- anomaly: the page loads but the content is suspiciously empty, short, or otherwise clearly wrong for a pricing page. The agent logs the anomaly and stops without trying a broad retry loop.
- extraction_failure: the scraping succeeded, but the LLM response was empty, malformed, or did not match the required schema. The agent logs the failure and does not save a bad snapshot.

The agent follows a strict, low-drama failure policy: one retry after a short delay only for soft issues, then stop and log the final outcome. This is important because the goal is resilience and evidence, not evasion or hidden workarounds.

## Alerting

The agent sends a readable Slack alert when it detects a real pricing change after the baseline exists, or when a run ends in a non-success outcome such as `blocked`, `load_failure`, `extraction_failure`, or `anomaly`. Alerts include what happened, when it happened, and a dashboard link for the full record.

A normal successful run with zero changes does not send an alert. Treating that as a healthy no-op is deliberate: alerting on every scheduled run would create alert fatigue and make meaningful changes or failures easier to miss. Slack delivery errors are logged without replacing the original monitoring outcome.

## How this runs in production

This project is designed to run without me manually opening the browser every time. The GitHub Action runs on a cron schedule every 6 hours and can also be triggered manually from the Actions tab with `workflow_dispatch`.

The workflow runs the same agent used locally, injects the secrets from GitHub Actions, and sends the result to Supabase for snapshots, diff records, and run logs. That means the monitoring is autonomous: it executes on schedule, saves evidence, and makes it easy to review changes and failures later.

You can review the workflow output in the GitHub Actions tab for the repository, and the agent's database status is stored in Supabase under `run_log`, `snapshots`, and `changes`.

## How to run locally

1. Install dependencies:
   ```powershell
   cd "C:\Users\mrahe\Downloads\Autonomous Monitoring\agent"
   npm install
   npx playwright install chromium
   ```

2. Create your local `.env` file (do not commit this file):
   ```powershell
   copy .env.example .env
   ```

3. Edit `.env` locally with your real values:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   MOCK_TARGET_URL=https://your-project-name.vercel.app
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your_supabase_anon_or_service_role_key_here
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/path
   DASHBOARD_URL=https://your-dashboard-vercel-url-here.vercel.app
   ```

4. Run the agent normally:
   ```powershell
   npm run start
   ```

5. Run the simulated change test:
   ```powershell
   node index.js --simulate-change
   ```

6. Run the simulated block test:
   ```powershell
   node index.js --simulate-block
   ```

7. Test both Slack alert formats without calling OpenAI or Supabase:
   ```powershell
   node index.js --simulate-alert
   ```

The alert simulation posts one fake pricing-change message and one fake blocked-run message. Confirm both appear in the configured Slack channel and that each includes a timestamp and dashboard link.

The `--simulate-change` flag intentionally persists a fake changed payload so the diff and alert path can be tested. Run a normal live pass afterward to restore the real target as the latest baseline before evaluating no-change stability.

This will navigate to the mock target page, scrape the full visible text, compare it to the most recent stored snapshot, log change records if needed, and print the final JSON output in the terminal.

## GitHub Actions secret

Add `SLACK_WEBHOOK_URL` as a repository Actions secret before the scheduled workflow runs. Add `DASHBOARD_URL` too so alerts link to the deployed dashboard rather than the placeholder URL. These follow the same repository secret pattern as `OPENAI_API_KEY`, `MOCK_TARGET_URL`, `SUPABASE_URL`, and `SUPABASE_KEY`.
