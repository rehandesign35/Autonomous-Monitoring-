const { chromium } = require('playwright');

function detectBlockPage(text, title = '') {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const cleaned = text.toLowerCase().replace(/\s+/g, ' ');
  const suspiciousPatterns = [
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
    'please wait while we verify you'
  ];

  const titleMatches = /(captcha|access denied|security check|verify you are human)/i.test(title || '');
  const textMatches = suspiciousPatterns.some((pattern) => cleaned.includes(pattern));

  return titleMatches || textMatches;
}

async function scrapePageText(url) {
  if (!url) {
    console.error('No target URL provided. Set MOCK_TARGET_URL in your local .env file.');
    return { ok: false, reason: 'missing-url', text: '' };
  }

  let browser;
  let page;

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(1000);

    const title = await page.title();
    const bodyText = await page.evaluate(() => {
      const body = document.body;
      return body ? body.innerText : '';
    });

    const cleanedText = (bodyText || '').replace(/\s+/g, ' ').trim();

    if (!cleanedText || cleanedText.length < 80) {
      console.warn(`Page loaded but produced very little visible text (${cleanedText.length} chars).`);
      return { ok: false, reason: 'empty-page', text: cleanedText, title };
    }

    if (detectBlockPage(cleanedText, title)) {
      console.warn(`Likely block or CAPTCHA page detected at ${url}. Title: ${title}`);
      return { ok: false, reason: 'block-page', text: cleanedText, title };
    }

    console.log(`Captured ${cleanedText.length} characters of visible page text.`);
    return { ok: true, text: cleanedText, title };
  } catch (error) {
    console.error(`Navigation or page read failed for ${url}: ${error.message}`);
    return {
      ok: false,
      reason: 'navigation-error',
      text: '',
      error: error.message,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  scrapePageText,
  detectBlockPage,
};
