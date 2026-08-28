const BLOCK_PATTERNS = [
  'verify you are human',
  'captcha',
  'cloudflare',
  'checking your browser',
  'access denied',
  'please complete the security check',
  'too many requests',
  'ddos protection',
  'security check',
  'this page is blocked',
  'robot verification',
  'please wait while we verify you',
  'we need to confirm you are not a robot',
  'browser verification required',
  'suspicious activity detected',
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function detectAnomaly({ text = '', title = '', statusCode, error, sourceUrl }) {
  const normalizedText = normalizeText(text);
  const normalizedTitle = normalizeText(title);
  const lowerText = normalizedText.toLowerCase();
  const lowerTitle = normalizedTitle.toLowerCase();

  // Pattern-based detection is intentionally limited to known challenge wording.
  // We are not trying to solve or bypass a CAPTCHA; we only classify obvious
  // challenge pages as blocked so the agent can stop safely and log the result.
  const challengeMatch = BLOCK_PATTERNS.some((pattern) => lowerText.includes(pattern) || lowerTitle.includes(pattern));

  if (statusCode && [403, 429, 451].includes(Number(statusCode))) {
    return {
      outcome: 'blocked',
      logStatus: 'blocked',
      reason: `HTTP status ${statusCode} suggests a blocked or rate-limited page.`,
      details: { statusCode, sourceUrl },
    };
  }

  if (challengeMatch) {
    return {
      outcome: 'blocked',
      logStatus: 'blocked',
      reason: 'Page text or title matches common CAPTCHA/block challenge wording.',
      details: { title: normalizedTitle, sourceUrl },
    };
  }

  if (error) {
    const message = String(error).toLowerCase();
    if (/(timed out|timeout|net::|navigation failed|load failed|failed to load)/i.test(message)) {
      return {
        outcome: 'load_failure',
        logStatus: 'failure',
        reason: 'Page did not load successfully or timed out.',
        details: { error: String(error), sourceUrl },
      };
    }
  }

  if (!normalizedText || normalizedText.length < 80) {
    return {
      outcome: 'anomaly',
      logStatus: 'failure',
      reason: 'Page content is empty or suspiciously short, which usually indicates a block page, broken load, or placeholder content.',
      details: { textLength: normalizedText.length, title: normalizedTitle, sourceUrl },
    };
  }

  return null;
}

module.exports = {
  BLOCK_PATTERNS,
  detectAnomaly,
};
