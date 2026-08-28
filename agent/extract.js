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
          'You are extracting structured pricing data from a website page. Extract only the content that is clearly visible. Preserve the names and prices as they appear on the page, and return valid JSON that matches the schema exactly.',
      },
      {
        role: 'user',
        content: `Extract the pricing information from this page. Include the company name, the date shown as "last updated" (or equivalent), and a list of pricing tiers. Each tier must include a name, a price string, and an array of feature strings.

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
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse structured pricing JSON from OpenAI: ${error.message}`);
  }
}

module.exports = {
  extractPricing,
  buildPricingSchema,
};
