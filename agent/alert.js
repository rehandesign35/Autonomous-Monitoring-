const DEFAULT_DASHBOARD_URL = 'https://your-dashboard-vercel-url-here.vercel.app';

function formatChangeDetails(details) {
  const changes = Array.isArray(details.changes) ? details.changes : [];

  if (changes.length === 0) {
    return 'A pricing change was detected.';
  }

  const summary = changes.slice(0, 5).map((change) => {
    const oldValue = Array.isArray(change.oldValue) ? change.oldValue.join(', ') : String(change.oldValue ?? 'none');
    const newValue = Array.isArray(change.newValue) ? change.newValue.join(', ') : String(change.newValue ?? 'none');
    return `• ${change.fieldChanged}: ${oldValue} → ${newValue}`;
  });

  if (changes.length > 5) {
    summary.push(`• ${changes.length - 5} more change(s) recorded in the dashboard`);
  }

  return summary.join('\n');
}

function buildMessage(type, details = {}) {
  const dashboardUrl = details.dashboardUrl || process.env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
  const timestamp = new Date().toISOString();

  if (type === 'change') {
    return [
      '*Autonomous monitor: pricing change detected*',
      `When: ${timestamp}`,
      `Source: ${details.sourceUrl || 'configured mock target'}`,
      formatChangeDetails(details),
      `Details: ${dashboardUrl}`,
    ].join('\n');
  }

  const status = details.status || type || 'failure';
  return [
    '*Autonomous monitor: run needs attention*',
    `When: ${timestamp}`,
    `Outcome: ${status}`,
    `What happened: ${details.errorMessage || details.reason || 'The monitoring run did not complete successfully.'}`,
    `Details: ${dashboardUrl}`,
  ].join('\n');
}

async function sendAlert(type, details = {}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL is missing. Add it to your local .env file or GitHub Actions secrets.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: buildMessage(type, details) }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned HTTP ${response.status}.`);
  }
}

module.exports = {
  sendAlert,
  buildMessage,
};