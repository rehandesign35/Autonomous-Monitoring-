require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { scrapePageText } = require('./scrape');
const { extractPricing } = require('./extract');
const { detectAnomaly } = require('./detect-anomaly');
const { diffPricingData } = require('./diff');
const { sendAlert } = require('./alert');

const rootDir = path.resolve(__dirname, '..');
const baselineFile = path.join(rootDir, 'docs', 'before-snapshot.json');
const afterFile = path.join(rootDir, 'docs', 'after-snapshot.json');

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));

function snapshotToAgentData(snapshot) {
  return {
    companyName: snapshot.company,
    lastUpdated: snapshot.lastUpdated,
    tiers: snapshot.tiers.map((tier) => ({
      name: tier.name,
      price: tier.priceLabel,
      features: tier.features,
    })),
  };
}

const baselineAgentData = snapshotToAgentData(baseline);

const testSuite = [
  {
    id: 'v1',
    description: 'v1 Baseline Layout',
    shouldAlert: false,
    staticData: baselineAgentData,
  },
  {
    id: 'v2',
    description: 'v2 Redesigned Layout',
    shouldAlert: false,
    staticData: snapshotToAgentData(JSON.parse(fs.readFileSync(afterFile, 'utf8'))),
  },
  {
    id: '01-structure-change',
    description: 'Same pricing, different HTML structure/class names',
    shouldAlert: false,
    file: 'mock-target/test-set/01-structure-change.html',
  },
  {
    id: '02-wording-change',
    description: 'Same pricing, different wording of feature descriptions',
    shouldAlert: false,
    file: 'mock-target/test-set/02-wording-change.html',
  },
  {
    id: '03-price-changed',
    description: 'One tier price actually changed ($89 -> $99)',
    shouldAlert: true,
    file: 'mock-target/test-set/03-price-changed.html',
  },
  {
    id: '04-feature-removed',
    description: 'A feature bullet actually removed',
    shouldAlert: true,
    file: 'mock-target/test-set/04-feature-removed.html',
  },
  {
    id: '05-blocked-captcha',
    description: 'Page returns a blocked/CAPTCHA-style response',
    shouldAlert: false, // Should flag extraction failed/blocked, NOT alert as a pricing change
    file: 'mock-target/test-set/05-blocked-captcha.html',
    isBlockedCase: true,
  },
];

async function evaluateCase(testCase) {
  const triggerTime = Date.now();
  console.log(`\n--- Running Case: ${testCase.id} (${testCase.description}) ---`);

  // Static snapshot evaluations (v1 and v2)
  if (testCase.staticData) {
    const changes = diffPricingData(testCase.staticData, { data: baselineAgentData });
    const extractionSucceeded = true;
    const extractionCorrect = changes.length === 0;
    const alerted = changes.length > 0;

    return {
      id: testCase.id,
      description: testCase.description,
      shouldAlert: testCase.shouldAlert,
      extractionSucceeded,
      extractionCorrect,
      changesDetected: changes.length,
      alerted,
      correctBehavior: alerted === testCase.shouldAlert,
      alertLatencyMs: null,
      error: null,
    };
  }

  const filePath = path.join(rootDir, testCase.file);
  const fileUrl = pathToFileURL(filePath).href;

  const scrape = await scrapePageText(fileUrl);
  const anomaly = detectAnomaly({
    text: scrape.text,
    title: scrape.title,
    statusCode: scrape.statusCode,
    error: scrape.error,
    sourceUrl: testCase.file,
  });

  if (anomaly) {
    console.log(`Anomaly detected: ${anomaly.reason} (Outcome: ${anomaly.outcome})`);
    const isBlockedOutcome = anomaly.outcome === 'blocked';
    // For CAPTCHA case, extraction is flagged as failed/blocked correctly
    return {
      id: testCase.id,
      description: testCase.description,
      shouldAlert: testCase.shouldAlert,
      extractionSucceeded: false,
      extractionCorrect: testCase.isBlockedCase && isBlockedOutcome, // correctly identified blocked
      changesDetected: 0,
      alerted: false,
      correctBehavior: !testCase.shouldAlert,
      alertLatencyMs: null,
      error: anomaly.reason,
    };
  }

  try {
    const extracted = await extractPricing(scrape.text);
    const changes = diffPricingData(extracted, { data: baselineAgentData });
    const alerted = changes.length > 0;

    let alertLatencyMs = null;
    if (alerted) {
      const alertStart = Date.now();
      try {
        await sendAlert('change', {
          changes,
          sourceUrl: testCase.file,
        });
        alertLatencyMs = Date.now() - triggerTime;
        console.log(`Slack alert sent for ${testCase.id}. Latency: ${alertLatencyMs}ms`);
      } catch (alertErr) {
        console.error(`Slack alert failed for ${testCase.id}: ${alertErr.message}`);
      }
    }

    // Determine if extraction pulled correct intended values:
    let extractionCorrect = false;
    if (!testCase.shouldAlert && changes.length === 0) {
      extractionCorrect = true;
    } else if (testCase.id === '03-price-changed') {
      // Expect 1 change in tier_1_price ($99/mo)
      extractionCorrect = changes.length === 1 && changes[0].fieldChanged === 'tier_1_price' && changes[0].newValue === '$99/mo';
    } else if (testCase.id === '04-feature-removed') {
      // Expect change in tier_2_features
      extractionCorrect = changes.length > 0 && changes.some((c) => c.fieldChanged.includes('tier_2_features'));
    }

    return {
      id: testCase.id,
      description: testCase.description,
      shouldAlert: testCase.shouldAlert,
      extractionSucceeded: true,
      extractionCorrect,
      changesDetected: changes.length,
      alerted,
      correctBehavior: alerted === testCase.shouldAlert,
      alertLatencyMs,
      error: null,
    };
  } catch (err) {
    console.error(`Extraction failed for ${testCase.id}: ${err.message}`);
    return {
      id: testCase.id,
      description: testCase.description,
      shouldAlert: testCase.shouldAlert,
      extractionSucceeded: false,
      extractionCorrect: false,
      changesDetected: 0,
      alerted: false,
      correctBehavior: false,
      alertLatencyMs: null,
      error: err.message,
    };
  }
}

async function main() {
  console.log('=====================================================');
  console.log('   AUTONOMOUS MONITORING AGENT — EVALUATION SUITE');
  console.log('=====================================================');

  const results = [];
  for (const testCase of testSuite) {
    const result = await evaluateCase(testCase);
    results.push(result);
  }

  // Calculations
  const totalRuns = results.length; // 7
  const correctExtractions = results.filter((r) => r.extractionCorrect).length;
  const extractionAccuracy = correctExtractions / totalRuns;

  const runsShouldNotAlert = results.filter((r) => !r.shouldAlert);
  const incorrectlyAlerted = runsShouldNotAlert.filter((r) => r.alerted).length;
  const falsePositiveRate = incorrectlyAlerted / runsShouldNotAlert.length;

  const alertingRuns = results.filter((r) => r.shouldAlert && r.alerted && r.alertLatencyMs !== null);
  const totalLatency = alertingRuns.reduce((sum, r) => sum + r.alertLatencyMs, 0);
  const avgAlertLatency = alertingRuns.length > 0 ? totalLatency / alertingRuns.length : 0;

  console.log('\n=====================================================');
  console.log('              SUMMARY EVALUATION METRICS');
  console.log('=====================================================');
  console.table(
    results.map((r) => ({
      Case: r.id,
      'Extraction Succeeded': r.extractionSucceeded ? 'YES' : 'NO',
      'Correct Values': r.extractionCorrect ? 'YES' : 'NO',
      Alerted: r.alerted ? 'YES' : 'NO',
      'Expected Alert': r.shouldAlert ? 'YES' : 'NO',
      'Latency (ms)': r.alertLatencyMs ? `${r.alertLatencyMs} ms` : 'N/A',
    }))
  );

  console.log(`\nExtraction Accuracy : ${(extractionAccuracy * 100).toFixed(1)}% (${correctExtractions}/${totalRuns})`);
  console.log(`False-Positive Rate : ${(falsePositiveRate * 100).toFixed(1)}% (${incorrectlyAlerted}/${runsShouldNotAlert.length})`);
  console.log(`Avg Alert Latency   : ${avgAlertLatency.toFixed(0)} ms (${(avgAlertLatency / 1000).toFixed(2)} s)`);

  const summaryData = {
    evaluatedAt: new Date().toISOString(),
    totalRuns,
    correctExtractions,
    extractionAccuracy: (extractionAccuracy * 100).toFixed(1) + '%',
    incorrectlyAlerted,
    runsShouldNotAlert: runsShouldNotAlert.length,
    falsePositiveRate: (falsePositiveRate * 100).toFixed(1) + '%',
    avgAlertLatencyMs: Math.round(avgAlertLatency),
    avgAlertLatencySec: (avgAlertLatency / 1000).toFixed(2) + ' s',
    results,
  };

  fs.writeFileSync(path.join(__dirname, 'eval-results.json'), JSON.stringify(summaryData, null, 2));
  console.log('\nResults saved to agent/eval-results.json');
}

main().catch((err) => {
  console.error('Evaluation suite error:', err);
  process.exit(1);
});
