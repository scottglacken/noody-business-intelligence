/**
 * Email Delivery for Customer Insights
 * =======================================
 * Sends HTML formatted insights report via Resend.
 */

const config = require('../config');

async function sendEmail(htmlContent, daysBack) {
  if (!config.email.apiKey || config.email.to.length === 0) {
    console.log('  [Email] No API key or recipients configured, skipping...');
    return;
  }

  const now = new Date().toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.email.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.from,
      to: config.email.to,
      subject: `🧠 Noody Customer Insights — ${now} (Last ${daysBack} days)`,
      html: htmlContent,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  console.log(`  [Email] Sent to ${config.email.to.join(', ')} (ID: ${data.id})`);
}

module.exports = { sendEmail };
