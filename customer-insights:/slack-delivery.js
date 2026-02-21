/**
 * Slack Delivery for Customer Insights
 * ======================================
 * Sends formatted customer insights report to Slack channel.
 */

const config = require('../config');

async function sendToSlack(message) {
  if (!config.slack.botToken) {
    console.log('  [Slack] No bot token configured, skipping...');
    return;
  }

  // Slack has a 3000 char limit per block, so we chunk if needed
  const chunks = chunkMessage(message, 2900);

  for (let i = 0; i < chunks.length; i++) {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.slack.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: config.slack.channel,
        text: chunks[i],
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack error: ${data.error}`);
    }

    // Small delay between chunks
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`  [Slack] Sent ${chunks.length} message(s) to #${config.slack.channel}`);
}

function chunkMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (double newline, then single newline, then space)
    let breakIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (breakIdx < maxLen * 0.5) breakIdx = remaining.lastIndexOf('\n', maxLen);
    if (breakIdx < maxLen * 0.5) breakIdx = remaining.lastIndexOf(' ', maxLen);
    if (breakIdx < maxLen * 0.5) breakIdx = maxLen;

    chunks.push(remaining.substring(0, breakIdx));
    remaining = remaining.substring(breakIdx).trim();
  }

  return chunks;
}

module.exports = { sendToSlack };
