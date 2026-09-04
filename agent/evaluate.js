require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { scrapePageText } = require('./scrape');
const { extractPricing } = require('./extract');
const { detectAnomaly } = require('./detect-anomaly');
const { diffPricingData } = require('./diff');

const rootDir = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(rootDir, 'docs', 'before-snapshot.json'), 'utf8'));
const cases = [
  { id: 'v1', kind: 'known-good', source: 'docs/before-snapshot.json', data: baselineToAgentData().data },
  { id: 'v2', kind: 'known-good', source: 'docs/after-snapshot.json', data: snapshotToAgentData(JSON.parse(fs.readFileSync(path.join(rootDir, 'docs', 'after-snapshot.json'), 'utf8'))).data },
  { id: '01-reworded', kind: 'known-good', file: 'mock-target/eval/01-reworded.html' },
  { id: '02-editorial', kind: 'known-good', file: 'mock-target/eval/02-editorial.html' },
  { id: '03-label-shift', kind: 'known-good', file: 'mock-target/eval/03-label-shift.html' },
  { id: '04-missing-price', kind: 'missing-price', file: 'mock-target/eval/04-missing-price.html' },
  { id: '05-blocked', kind: 'blocked', file: 'mock-target/eval/05-blocked.html' },
];

function isCompletePricing(data) {
  return Boolean(data && data.companyName && data.lastUpdated && Array.isArray(data.tiers) && data.tiers.length > 0
    && data.tiers.every((tier) => tier.name && tier.price && Array.isArray(tier.features) && tier.features.length === 4));
}

function equivalentToBaseline(data) {
  return JSON.stringify(data) === JSON.stringify({
    companyName: baseline.company,
    lastUpdated: baseline.lastUpdated,
    tiers: baseline.tiers.map((tier) => ({ name: tier.name, price: tier.priceLabel, features: tier.features })),
  });
}

async function evaluateCase(testCase) {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  if (testCase.data) {
    const changes = diffPricingData(testCase.data, baselineToAgentData());
    return {
      id: testCase.id,
      kind: testCase.kind,
      source: testCase.source,
      status: 'known-good',
      extractionCorrect: changes.length === 0,
      falsePositiveChanges: changes.length > 0 ? 1 : 0,
      falsePositiveChangeFields: changes.length,
      durationMs: Date.now() - started,
      startedAt,
      alertStartedAt: null,
      alertDeliveredAt: null,
      alertLatencyMs: null,
    };
  }

  const source = path.join(rootDir, testCase.file);
  const scrape = await scrapePageText(pathToFileURL(source).href);
  const anomaly = detectAnomaly({ text: scrape.text, title: scrape.title, statusCode: scrape.statusCode, error: scrape.error, sourceUrl: testCase.file });

  if (anomaly) {
    return {
      id: testCase.id,
      kind: testCase.kind,
      source: testCase.file,
      status: anomaly.outcome,
      extractionCorrect: testCase.kind === 'blocked' && anomaly.outcome === 'blocked',
      falsePositiveChanges: 0,
      falsePositiveChangeFields: 0,
      durationMs: Date.now() - started,
      startedAt,
      alertStartedAt: null,
      alertDeliveredAt: null,
      alertLatencyMs: null,
    };
  }

  try {
    const extracted = await extractPricing(scrape.text);
    const complete = isCompletePricing(extracted);
    const changes = diffPricingData(extracted, baselineToAgentData());
    return {
      id: testCase.id,
      kind: testCase.kind,
      source: testCase.file,
      status: complete ? 'success' : 'extraction_failure',
      extractionCorrect: testCase.kind === 'known-good' && complete && equivalentToBaseline(extracted),
      falsePositiveChanges: testCase.kind === 'known-good' && changes.length > 0 ? 1 : 0,
      falsePositiveChangeFields: testCase.kind === 'known-good' ? changes.length : 0,
      durationMs: Date.now() - started,
      startedAt,
      alertStartedAt: null,
      alertDeliveredAt: null,
      alertLatencyMs: null,
    };
  } catch (error) {
    return {
      id: testCase.id,
      kind: testCase.kind,
      source: testCase.file,
      status: 'extraction_failure',
      extractionCorrect: false,
      falsePositiveChanges: 0,
      falsePositiveChangeFields: 0,
      durationMs: Date.now() - started,
      startedAt,
      error: error.message,
      alertStartedAt: null,
      alertDeliveredAt: null,
      alertLatencyMs: null,
    };
  }
}

function snapshotToAgentData(snapshot) {
  return {
    data: {
      companyName: snapshot.company,
      lastUpdated: snapshot.lastUpdated,
      tiers: snapshot.tiers.map((tier) => ({ name: tier.name, price: tier.priceLabel, features: tier.features })),
    },
  };
}

function baselineToAgentData() {
  return snapshotToAgentData(baseline);
}

async function main() {
  const results = [];
  for (const testCase of cases) {
    results.push(await evaluateCase(testCase));
  }

  const knownGood = results.filter((result) => result.kind === 'known-good');
  const output = {
    generatedAt: new Date().toISOString(),
    alertMeasurement: 'not performed; requires an explicitly authorized Slack webhook run',
    cases: results,
    summary: {
      correctExtractionRate: `${knownGood.filter((result) => result.extractionCorrect).length}/${knownGood.length}`,
      knownGoodExtractionRate: `${knownGood.filter((result) => result.extractionCorrect).length}/${knownGood.length}`,
      falsePositiveChangeDetections: results.reduce((total, result) => total + result.falsePositiveChanges, 0),
      falsePositiveChangeFields: results.reduce((total, result) => total + result.falsePositiveChangeFields, 0),
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});