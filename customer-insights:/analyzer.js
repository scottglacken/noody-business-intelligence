/**
 * Claude AI Analyzer for Customer Insights
 * ==========================================
 * Sends collected Re:amaze data to Claude for deep analysis.
 * Returns structured insights formatted for both Slack and Email.
 */

const config = require('../config');

async function analyzeWithClaude(reamazeData, daysBack) {
  const prompt = buildPrompt(reamazeData, daysBack);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const aiResponse = data.content[0].text;

  // Parse the structured response
  return parseAnalysis(aiResponse, reamazeData, daysBack);
}

function buildPrompt(data, daysBack) {
  return `You are the Customer Intelligence Analyst for Noody Skincare, a New Zealand DTC brand selling natural prebiotic skincare products for children with sensitive skin and eczema. Your job is to analyze customer messages and extract actionable business insights.

Here is the customer messaging data from the last ${daysBack} days:

## VOLUME OVERVIEW
- Total customer messages: ${data.totalMessages}
- Total conversations: ${data.totalConversations}
- Date range: ${data.dateRange.start} to ${data.dateRange.end}

## CHANNEL BREAKDOWN
${Object.entries(data.byChannel).map(([ch, count]) => `- ${ch}: ${count} messages`).join('\n')}

## CONVERSATION STATUS
${Object.entries(data.byStatus).map(([st, count]) => `- ${st}: ${count}`).join('\n')}

## TAGS USED
${Object.entries(data.byTag).length > 0
    ? Object.entries(data.byTag).sort((a, b) => b[1] - a[1]).map(([tag, count]) => `- ${tag}: ${count}`).join('\n')
    : 'No tags found'}

## SATISFACTION RATINGS
- Total ratings: ${data.ratingsSummary.total}
- Average: ${data.ratingsSummary.average}/5
${Object.entries(data.ratingsSummary.breakdown).map(([score, count]) => `- ${score}/5: ${count} ratings`).join('\n')}

## UNRESOLVED CONVERSATIONS (${data.unresolvedConversations.length})
${data.unresolvedConversations.slice(0, 20).map(c =>
    `- "${c.subject}" from ${c.author} via ${c.channel}${c.tags.length ? ` [${c.tags.join(', ')}]` : ''}`
  ).join('\n') || 'None'}

## CUSTOMER MESSAGES (sample of ${data.messageSamples.length})
${data.messageSamples.map((m, i) =>
    `[${i + 1}] Channel: ${m.origin} | Subject: ${m.subject}\n${m.body}`
  ).join('\n---\n')}

---

Analyze the above data and provide your response in EXACTLY this format (use the exact headers shown):

## EXECUTIVE SUMMARY
Write 2-3 sentences summarizing the overall customer sentiment and key takeaway for the last ${daysBack} days.

## KEY THEMES
List the top 3-5 themes/topics customers are messaging about. For each theme:
- Theme name
- How many messages relate to it (estimate)
- Whether sentiment is positive, negative, or neutral
- Specific customer quotes or examples

## PRODUCT FEEDBACK
Any specific feedback about Noody products (which products, what customers are saying, feature requests, complaints).

## SHIPPING & DELIVERY
Any shipping-related issues, tracking questions, delivery complaints or praise.

## CHANNEL INSIGHTS
Which channels are busiest and any patterns (e.g. Instagram DMs tend to be product questions, email tends to be order issues).

## URGENT ISSUES
Any conversations that need immediate attention — angry customers, unresolved complaints, potential PR risks, product quality issues.

## OPPORTUNITIES
Customer messages that reveal opportunities — product requests, expansion ideas, content ideas, testimonials worth capturing.

## ACTION ITEMS
List 3-5 specific, prioritized actions the team should take based on this analysis. Format each as:
- Action description
- Owner suggestion (CS, Marketing, Operations, Product)
- Priority (Today, This Week, This Month)

## CUSTOMER SENTIMENT SCORE
Give an overall sentiment score from 1-10 (1 = very negative, 10 = very positive) with brief justification.`;
}

function parseAnalysis(aiText, data, daysBack) {
  const now = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });

  // ─── Build Slack Message ───
  const slackMessage = buildSlackMessage(aiText, data, daysBack, now);

  // ─── Build Email HTML ───
  const emailHtml = buildEmailHtml(aiText, data, daysBack, now);

  return { slackMessage, emailHtml };
}

function buildSlackMessage(aiText, data, daysBack, now) {
  // Extract sections from AI response
  const sections = extractSections(aiText);

  let msg = '';

  // Header
  msg += `🧠 *NOODY CUSTOMER INSIGHTS REPORT*\n`;
  msg += `📅 Last ${daysBack} days (${data.dateRange.start} → ${data.dateRange.end})\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Volume Stats
  msg += `📊 *Volume Overview*\n`;
  msg += `• Messages: *${data.totalMessages}* across *${data.totalConversations}* conversations\n`;
  Object.entries(data.byChannel).forEach(([ch, count]) => {
    const emoji = getChannelEmoji(ch);
    msg += `  ${emoji} ${ch}: ${count}\n`;
  });
  msg += `\n`;

  // Status breakdown
  const unresolved = data.byStatus['Unresolved'] || 0;
  const resolved = data.byStatus['Resolved'] || 0;
  const autoResolved = data.byStatus['Auto-Resolved'] || 0;
  if (unresolved > 0) {
    msg += `⚠️ *${unresolved} unresolved conversations*\n`;
  }
  if (resolved + autoResolved > 0) {
    msg += `✅ ${resolved + autoResolved} resolved (${autoResolved} auto-resolved)\n`;
  }
  msg += `\n`;

  // Satisfaction
  if (data.ratingsSummary.total > 0) {
    msg += `⭐ *Satisfaction: ${data.ratingsSummary.average}/5* (${data.ratingsSummary.total} ratings)\n\n`;
  }

  // AI Analysis Sections
  if (sections['EXECUTIVE SUMMARY']) {
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 *Executive Summary*\n${sections['EXECUTIVE SUMMARY']}\n\n`;
  }

  if (sections['KEY THEMES']) {
    msg += `🔑 *Key Themes*\n${sections['KEY THEMES']}\n\n`;
  }

  if (sections['PRODUCT FEEDBACK']) {
    msg += `📦 *Product Feedback*\n${sections['PRODUCT FEEDBACK']}\n\n`;
  }

  if (sections['SHIPPING & DELIVERY']) {
    msg += `🚚 *Shipping & Delivery*\n${sections['SHIPPING & DELIVERY']}\n\n`;
  }

  if (sections['URGENT ISSUES']) {
    msg += `🚨 *Urgent Issues*\n${sections['URGENT ISSUES']}\n\n`;
  }

  if (sections['OPPORTUNITIES']) {
    msg += `💡 *Opportunities*\n${sections['OPPORTUNITIES']}\n\n`;
  }

  if (sections['ACTION ITEMS']) {
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✅ *Action Items*\n${sections['ACTION ITEMS']}\n\n`;
  }

  if (sections['CUSTOMER SENTIMENT SCORE']) {
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 *Sentiment Score*\n${sections['CUSTOMER SENTIMENT SCORE']}\n\n`;
  }

  msg += `_Generated by Customer Insights Engine • ${now} NZT_`;

  return msg;
}

function buildEmailHtml(aiText, data, daysBack, now) {
  const sections = extractSections(aiText);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #10A2C5, #0D8AAB); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-card .number { font-size: 28px; font-weight: 700; color: #10A2C5; }
    .stat-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .channel-bar { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    .channel-bar .bar { height: 8px; background: #10A2C5; border-radius: 4px; }
    .channel-bar .name { font-size: 13px; color: #555; min-width: 120px; }
    .channel-bar .count { font-size: 13px; color: #999; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 16px; color: #10A2C5; border-bottom: 2px solid #e8f4f8; padding-bottom: 8px; margin-bottom: 12px; }
    .section-content { font-size: 14px; white-space: pre-wrap; }
    .urgent { background: #fff3f3; border-left: 4px solid #e74c3c; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 12px 0; }
    .opportunity { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 12px 0; }
    .action-item { background: #f8f9fa; padding: 12px 16px; border-radius: 8px; margin: 8px 0; border-left: 4px solid #10A2C5; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧠 Noody Customer Insights</h1>
    <p>Last ${daysBack} days • ${data.dateRange.start} → ${data.dateRange.end}</p>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="number">${data.totalMessages}</div>
      <div class="label">Messages</div>
    </div>
    <div class="stat-card">
      <div class="number">${data.totalConversations}</div>
      <div class="label">Conversations</div>
    </div>
    <div class="stat-card">
      <div class="number">${data.ratingsSummary.total > 0 ? data.ratingsSummary.average + '/5' : 'N/A'}</div>
      <div class="label">Satisfaction</div>
    </div>
  </div>

  <div class="section">
    <h2>📊 Channel Breakdown</h2>
    ${buildChannelBarsHtml(data.byChannel, data.totalMessages)}
  </div>

  ${sections['EXECUTIVE SUMMARY'] ? `
  <div class="section">
    <h2>📋 Executive Summary</h2>
    <div class="section-content">${formatHtml(sections['EXECUTIVE SUMMARY'])}</div>
  </div>` : ''}

  ${sections['KEY THEMES'] ? `
  <div class="section">
    <h2>🔑 Key Themes</h2>
    <div class="section-content">${formatHtml(sections['KEY THEMES'])}</div>
  </div>` : ''}

  ${sections['PRODUCT FEEDBACK'] ? `
  <div class="section">
    <h2>📦 Product Feedback</h2>
    <div class="section-content">${formatHtml(sections['PRODUCT FEEDBACK'])}</div>
  </div>` : ''}

  ${sections['SHIPPING & DELIVERY'] ? `
  <div class="section">
    <h2>🚚 Shipping & Delivery</h2>
    <div class="section-content">${formatHtml(sections['SHIPPING & DELIVERY'])}</div>
  </div>` : ''}

  ${sections['URGENT ISSUES'] ? `
  <div class="section">
    <h2>🚨 Urgent Issues</h2>
    <div class="urgent">${formatHtml(sections['URGENT ISSUES'])}</div>
  </div>` : ''}

  ${sections['OPPORTUNITIES'] ? `
  <div class="section">
    <h2>💡 Opportunities</h2>
    <div class="opportunity">${formatHtml(sections['OPPORTUNITIES'])}</div>
  </div>` : ''}

  ${sections['ACTION ITEMS'] ? `
  <div class="section">
    <h2>✅ Action Items</h2>
    <div class="section-content">${formatHtml(sections['ACTION ITEMS'])}</div>
  </div>` : ''}

  ${sections['CUSTOMER SENTIMENT SCORE'] ? `
  <div class="section">
    <h2>🎯 Overall Sentiment</h2>
    <div class="section-content">${formatHtml(sections['CUSTOMER SENTIMENT SCORE'])}</div>
  </div>` : ''}

  ${sections['CHANNEL INSIGHTS'] ? `
  <div class="section">
    <h2>📱 Channel Insights</h2>
    <div class="section-content">${formatHtml(sections['CHANNEL INSIGHTS'])}</div>
  </div>` : ''}

  <div class="footer">
    Generated by Noody Customer Insights Engine • ${now} NZT
  </div>
</body>
</html>`;
}

// ─── Helpers ───

function extractSections(text) {
  const sections = {};
  const sectionNames = [
    'EXECUTIVE SUMMARY',
    'KEY THEMES',
    'PRODUCT FEEDBACK',
    'SHIPPING & DELIVERY',
    'CHANNEL INSIGHTS',
    'URGENT ISSUES',
    'OPPORTUNITIES',
    'ACTION ITEMS',
    'CUSTOMER SENTIMENT SCORE',
  ];

  sectionNames.forEach((name, i) => {
    const regex = new RegExp(`##\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=##\\s*(?:${sectionNames.slice(i + 1).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})|$)`);
    const match = text.match(regex);
    if (match) {
      sections[name] = match[1].trim();
    }
  });

  return sections;
}

function getChannelEmoji(channel) {
  const emojis = {
    'Instagram DM': '📸',
    'Instagram': '📸',
    'Facebook': '👤',
    'Email': '📧',
    'Website Chat': '💬',
    'Contact Form': '📝',
    'SMS': '📱',
    'WhatsApp': '💚',
    'Voice': '📞',
  };
  return emojis[channel] || '📩';
}

function buildChannelBarsHtml(byChannel, total) {
  const maxCount = Math.max(...Object.values(byChannel));
  return Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([ch, count]) => {
      const pct = Math.round((count / maxCount) * 100);
      const emoji = getChannelEmoji(ch);
      return `<div class="channel-bar">
        <span class="name">${emoji} ${ch}</span>
        <div style="flex:1"><div class="bar" style="width:${pct}%"></div></div>
        <span class="count">${count} (${Math.round(count / total * 100)}%)</span>
      </div>`;
    }).join('');
}

function formatHtml(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

module.exports = { analyzeWithClaude };
