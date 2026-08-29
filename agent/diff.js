function normalizeComparableValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim();
}

function diffPricingData(newData, previousData) {
  const changes = [];

  if (!previousData || !previousData.data) {
    return changes;
  }

  const previousParsed = typeof previousData.data === 'string' ? JSON.parse(previousData.data) : previousData.data;
  const newParsed = typeof newData === 'string' ? JSON.parse(newData) : newData;

  const previousTiers = Array.isArray(previousParsed.tiers) ? previousParsed.tiers : [];
  const newTiers = Array.isArray(newParsed.tiers) ? newParsed.tiers : [];

  const maxLength = Math.max(previousTiers.length, newTiers.length);

  for (let i = 0; i < maxLength; i += 1) {
    const prevTier = previousTiers[i] || {};
    const newTier = newTiers[i] || {};

    for (const field of ['name', 'price', 'features', 'lastUpdated']) {
      const oldValue = normalizeComparableValue(prevTier[field]);
      const newValue = normalizeComparableValue(newTier[field]);

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          fieldChanged: `tier_${i + 1}_${field}`,
          oldValue,
          newValue,
        });
      }
    }
  }

  if (previousParsed.companyName !== newParsed.companyName) {
    changes.push({
      fieldChanged: 'companyName',
      oldValue: previousParsed.companyName || null,
      newValue: newParsed.companyName || null,
    });
  }

  if (previousParsed.lastUpdated !== newParsed.lastUpdated) {
    changes.push({
      fieldChanged: 'lastUpdated',
      oldValue: previousParsed.lastUpdated || null,
      newValue: newParsed.lastUpdated || null,
    });
  }

  return changes;
}

module.exports = {
  diffPricingData,
};
