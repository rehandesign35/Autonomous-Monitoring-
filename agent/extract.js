require('dotenv').config();
const OpenAI = require('openai');

function buildPricingSchema() {
  return {
    type: 'object',
    properties: {
      companyName: { type: 'string' },
      lastUpdated: { type: 'string' },
      tiers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'string' },
            features: {
              type: 'array',
              items: { type: 'string' },
              minItems: 4,
              maxItems: 4,
            },
          },
          required: ['name', 'price', 'features'],
          additionalProperties: false,
        },
      },
    },
    required: ['companyName', 'lastUpdated', 'tiers'],
    additionalProperties: false,
  };
}

function normalizeLastUpdated(value) {
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-07:00`;

  const displayMatch = text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\s+[•-]\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*PT$/i);
  if (!displayMatch) return text;

  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  let hour = Number(displayMatch[4]);
  if (displayMatch[6].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (displayMatch[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${displayMatch[3]}-${months[displayMatch[1].slice(0, 3).toLowerCase()]}-${displayMatch[2].padStart(2, '0')}T${String(hour).padStart(2, '0')}:${displayMatch[5]}:00-07:00`;
}

function normalizePrice(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\//g, '/')
    .replace(/\/month\b/i, '/mo')
    .trim();
}

function normalizePricingData(data) {
  return {
    companyName: String(data.companyName || '').replace(/\s+Solutions$/i, '').trim(),
    lastUpdated: normalizeLastUpdated(data.lastUpdated),
    tiers: (Array.isArray(data.tiers) ? data.tiers : []).map((tier) => {
      const features = (Array.isArray(tier.features) ? tier.features : [])
        .map((feature) => String(feature).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const factualFeatures = features.filter((feature) => !feature.endsWith('.'));

      return {
        name: String(tier.name || '').replace(/^(STARTER|MOST POPULAR|HIGH OUTPUT|CUSTOM)\s+/i, '').trim(),
        price: normalizePrice(tier.price),
        features: (factualFeatures.length >= 4 ? factualFeatures : features).slice(0, 4),
      };
    }),
  };
}

async function extractPricing(rawText) {
  if (!rawText || !rawText.trim()) {
    throw new Error('No page text provided for extraction.');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it to your local .env file.');
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You are extracting structured pricing data from a website page. Return only canonical facts. Use the company name from the brand/header and exclude marketing labels such as Starter, Most popular, High output, and Custom from tier names. For each tier, include exactly the four factual feature bullets; exclude the tier description and included-note sentence. Normalize prices to the form "$89/mo" or "From $219/mo" and normalize the last-updated value to YYYY-MM-DDTHH:mm:ss-07:00. Return valid JSON that matches the schema exactly.',
      },
      {
        role: 'user',
        content: `Extract the pricing information from this page. Include the company name, the date shown as "last updated" (or equivalent), and a list of pricing tiers. Each tier must include the canonical tier name without its marketing label, a canonical price string, and exactly four factual feature strings. Do not include descriptions, fine-print notes, or labels in the feature list.

PAGE TEXT:
${rawText.slice(0, 120000)}`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'extract_pricing',
          description: 'Extract pricing tiers and metadata from a website pricing page.',
          parameters: buildPricingSchema(),
          strict: true,
        },
      },
    ],
    tool_choice: {
      type: 'function',
      function: { name: 'extract_pricing' },
    },
  });

  const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || !toolCall.function || !toolCall.function.arguments) {
    throw new Error('OpenAI did not return a structured tool call with extracted pricing data.');
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return normalizePricingData(parsed);
  } catch (error) {
    throw new Error(`Failed to parse structured pricing JSON from OpenAI: ${error.message}`);
  }
}

module.exports = {
  extractPricing,
  buildPricingSchema,
  normalizePricingData,
};
