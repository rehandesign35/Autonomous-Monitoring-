require('dotenv').config();

const { scrapePageText } = require('./scrape');
const { extractPricing } = require('./extract');
const { diffPricingData } = require('./diff');
const { getLastSnapshot, saveSnapshot, logChange, logRun } = require('./supabase');
const { detectAnomaly } = require('./detect-anomaly');
const { sendAlert } = require('./alert');

const RETRY_DELAY_MS = 1500;

function parseArgs() {
  const argv = process.argv.slice(2);
  const flags = {
    simulateChange: argv.includes('--simulate-change'),
    simulateBlock: argv.includes('--simulate-block'),
    simulateAlert: argv.includes('--simulate-alert'),
  };

  const match = argv.find((arg) => arg.startsWith('--simulate-json='));
  if (match) {
    flags.simulateJson = JSON.parse(match.split('=')[1]);
  }

  return flags;
}

function buildSimulationPayload() {
  return {
    companyName: 'SunPeak Solar',
    lastUpdated: '2026-08-29T10:45:00-07:00',
    tiers: [
      {
        name: 'SunCore 6',
        price: '$99/mo',
        features: ['6 kW rooftop solar system', '20 premium monocrystalline panels', 'Remote system monitoring', 'Standard inverter with 12-year warranty'],
      },
      {
        name: 'SunBalance 8',
        price: '$129/mo',
        features: ['8 kW rooftop solar system', '30 high-efficiency panels', 'Whole-home production monitoring', '10 kWh battery backup add-on available'],
      },
      {
        name: 'SunMax 10',
        price: '$169/mo',
        features: ['10 kW rooftop solar system', '38 premium panels with microinverters', 'Smart EV charging readiness', 'Premium roof and weather protection package'],
      },
      {
        name: 'SunReserve',
        price: 'From $219/mo',
        features: ['Custom system sizing for your property', 'Battery storage and generator backup options', 'Priority service and annual maintenance', 'Dedicated energy advisor and custom proposal'],
      },
    ],
  };
}

function buildBlockedSimulationPayload() {
  return {
    text: 'Verify you are human. Please complete the security check and confirm you are not a robot. This page is blocked by Cloudflare verification.',
    title: 'Verify you are human',
    statusCode: 403,
  };
}

function isValidExtractedPayload(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.companyName || !data.lastUpdated || !Array.isArray(data.tiers)) return false;

  return data.tiers.every((tier) => {
    if (!tier || typeof tier.name !== 'string' || typeof tier.price !== 'string' || !Array.isArray(tier.features)) {
      return false;
    }

    return tier.features.every((feature) => typeof feature === 'string');
  });
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logRunResult({ status, errorMessage, durationMs }) {
  await logRun({ status, errorMessage, durationMs }).catch(() => {});
}

async function sendAlertSafely(type, details) {
  try {
    await sendAlert(type, details);
    console.log(`Slack ${type} alert sent.`);
  } catch (error) {
    console.error(`Slack ${type} alert failed: ${error.message}`);
  }
}

async function main() {
  const startTime = Date.now();
  const flags = parseArgs();
  const targetUrl = process.env.MOCK_TARGET_URL;

  if (flags.simulateAlert) {
    await sendAlert('change', {
      sourceUrl: targetUrl,
      changes: [{
        fieldChanged: 'tier_1_price',
        oldValue: '$89/mo',
        newValue: '$99/mo',
      }],
    });
    await sendAlert('failure', {
      status: 'blocked',
      reason: 'Simulated block page for Slack alert verification.',
    });
    console.log('Simulation alert test complete: change and failure alerts sent.');
    return;
  }

  if (!targetUrl) {
    console.error('Missing MOCK_TARGET_URL in your local .env file.');
    console.error('Example: MOCK_TARGET_URL=https://your-project-name.vercel.app');
    await logRunResult({ status: 'failure', errorMessage: 'Missing MOCK_TARGET_URL', durationMs: Date.now() - startTime });
    process.exit(1);
  }

  let attemptCount = 0;
  let scrapeResult = null;

  try {
    while (attemptCount <= 1) {
      attemptCount += 1;

      if (flags.simulateBlock) {
        scrapeResult = {
          ok: true,
          text: buildBlockedSimulationPayload().text,
          title: buildBlockedSimulationPayload().title,
          statusCode: buildBlockedSimulationPayload().statusCode,
        };
        break;
      }

      scrapeResult = await scrapePageText(targetUrl);

      if (scrapeResult.ok) {
        break;
      }

      const anomaly = detectAnomaly({
        text: scrapeResult.text,
        title: scrapeResult.title || '',
        error: scrapeResult.error,
        statusCode: scrapeResult.statusCode,
        sourceUrl: targetUrl,
      });

      if (anomaly) {
        console.warn('Anomaly detected:', anomaly.reason);
        await logRunResult({
          status: anomaly.logStatus,
          errorMessage: anomaly.reason,
          durationMs: Date.now() - startTime,
        });
        await sendAlertSafely('failure', {
          status: anomaly.logStatus,
          reason: anomaly.reason,
          sourceUrl: targetUrl,
        });
        return;
      }

      if (attemptCount === 1) {
        console.warn('Initial scrape was not usable; retrying once before stopping.');
        await delay(RETRY_DELAY_MS);
        continue;
      }

      const errorMessage = scrapeResult.reason || 'scrape failed';
      await logRunResult({ status: 'failure', errorMessage, durationMs: Date.now() - startTime });
      await sendAlertSafely('failure', {
        status: 'load_failure',
        errorMessage,
        sourceUrl: targetUrl,
      });
      process.exit(1);
    }

    const anomaly = detectAnomaly({
      text: scrapeResult.text,
      title: scrapeResult.title || '',
      statusCode: scrapeResult.statusCode,
      error: scrapeResult.error,
      sourceUrl: targetUrl,
    });

    if (anomaly) {
      console.warn('Detected page anomaly before extraction:', anomaly.reason);
      await logRunResult({
        status: anomaly.logStatus,
        errorMessage: anomaly.reason,
        durationMs: Date.now() - startTime,
      });
      await sendAlertSafely('failure', {
        status: anomaly.logStatus,
        reason: anomaly.reason,
        sourceUrl: targetUrl,
      });
      return;
    }

    let structuredData;

    if (flags.simulateChange) {
      structuredData = flags.simulateJson || buildSimulationPayload();
      console.log('Simulation mode enabled. Using fake changed pricing payload.');
    } else {
      structuredData = await extractPricing(scrapeResult.text);
    }

    if (!isValidExtractedPayload(structuredData)) {
      throw new Error('OpenAI extraction returned invalid or incomplete pricing schema.');
    }

    const previousSnapshot = await getLastSnapshot();
    const changes = diffPricingData(structuredData, previousSnapshot);

    const newSnapshot = await saveSnapshot({
      sourceUrl: targetUrl,
      rawJson: structuredData,
    });

    if (changes.length > 0) {
      for (const change of changes) {
        await logChange({
          snapshotId: newSnapshot.id,
          fieldChanged: change.fieldChanged,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });
      }

      await sendAlertSafely('change', {
        changes,
        sourceUrl: targetUrl,
      });
    }

    console.log(JSON.stringify({
      extracted: structuredData,
      detectedChanges: changes,
      snapshotId: newSnapshot.id,
    }, null, 2));

    await logRunResult({ status: 'success', errorMessage: null, durationMs: Date.now() - startTime });
  } catch (error) {
    console.error('Agent run failed:');
    console.error(error.message);

    const outcome = error.message.includes('invalid or incomplete pricing schema') ? 'extraction_failure' : 'failure';
    const logStatus = outcome === 'extraction_failure' ? 'failure' : 'failure';

    await logRunResult({
      status: logStatus,
      errorMessage: error.message,
      durationMs: Date.now() - startTime,
    });

    await sendAlertSafely('failure', {
      status: outcome,
      errorMessage: error.message,
      sourceUrl: targetUrl,
    });

    process.exit(1);
  }
}

main();
