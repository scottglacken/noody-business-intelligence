// utils/cs-report.js
// Daily + Weekly Customer Service reports → Slack

const axios = require("axios");

async function sendCSReport(slackToken, channel, csData, businessName, reportDate, anthropicConfig) {
  if (!csData || csData.error) return;

  const daily = csData.daily || {};
  const open = csData.open || {};
  const satisfaction = csData.satisfaction || {};
  const reamaze = daily.reamaze || {};
  const customerMessages = csData.customerMessages || [];

  // ── HEADER ──
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `🎧 Customer Service — ${reportDate}` },
    },
  ];

  // ── DAILY SNAPSHOT ──
  const openEmoji = open.total === 0 ? "✅" : open.total <= 5 ? "🟡" : "🔴";
  const unassignedWarn = (open.unassigned || 0) > 0 ? ` ⚠️ ${open.unassigned} unassigned` : "";

  let snapshot = `*Yesterday:* ${daily.totalTickets || 0} conversations\n`;
  snapshot += `*Open tickets:* ${openEmoji} ${open.total || 0}${unassignedWarn}\n`;

  if (open.byAge) {
    const age = open.byAge;
    const aging = [];
    if (age.over48h > 0) aging.push(`🔴 ${age.over48h} over 48h`);
    if (age.over24h > 0) aging.push(`🟠 ${age.over24h} over 24h`);
    if (age.under24h > 0) aging.push(`🟡 ${age.under24h} under 24h`);
    if (age.under4h > 0) aging.push(`🟢 ${age.under4h} under 4h`);
    if (aging.length > 0) snapshot += `*Aging:* ${aging.join(" · ")}\n`;
  }

  if (satisfaction.avgRating !== null && satisfaction.avgRating !== undefined) {
    const stars = "⭐".repeat(Math.round(satisfaction.avgRating));
    snapshot += `*CSAT:* ${stars} ${satisfaction.avgRating}/5 (${satisfaction.totalRatings} ratings, 30d)\n`;
  }

  blocks.push({ type: "section", text: { type: "mrkdwn", text: snapshot } });

  // ── CHANNELS BREAKDOWN ──
  if (reamaze.byChannel && Object.keys(reamaze.byChannel).length > 0) {
    const channels = Object.entries(reamaze.byChannel)
      .sort((a, b) => b[1] - a[1])
      .map(([ch, ct]) => `${ch}: ${ct}`)
      .join(" · ");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*By channel:* ${channels}` } });
  }

  // ── META INBOX ──
  const metaInbox = daily.metaInbox || {};
  if (metaInbox.conversations > 0) {
    let metaText = `*Meta Inbox:* ${metaInbox.conversations} conversations yesterday`;
    if (metaInbox.messages?.length > 0) {
      metaText += "\n_Recent messages:_";
      metaInbox.messages.slice(0, 3).forEach(m => {
        metaText += `\n• ${m.from || "Customer"}: "${(m.snippet || "").substring(0, 100)}..."`;
      });
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: metaText } });
  }

  // ── TOP ISSUES (tags) ──
  if (reamaze.byTag && Object.keys(reamaze.byTag).length > 0) {
    const tags = Object.entries(reamaze.byTag)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, ct]) => `\`${tag}\` (${ct})`)
      .join(" · ");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Top issues today:* ${tags}` } });
  }

  // ── UNASSIGNED ALERT ──
  if (open.unassignedList?.length > 0) {
    blocks.push({ type: "divider" });
    let unassText = `⚠️ *Unassigned open tickets (${open.unassigned}):*\n`;
    open.unassignedList.forEach(u => {
      unassText += `• _${u.subject || "No subject"}_\n`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: unassText } });
  }

  // ── DAILY AI QUICK INSIGHT ──
  if (reamaze.recentSubjects?.length > 3 && anthropicConfig?.apiKey) {
    try {
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicConfig.apiKey });
      const msgSummary = reamaze.recentSubjects.slice(0, 15).map(c =>
        `${c.subject} (${c.channel}) — "${c.lastCustomerMsg || "no message"}"`
      ).join("\n");

      const resp = await client.messages.create({
        model: anthropicConfig.model || "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: `In 2-3 sentences, summarize the key themes and sentiment from these customer service conversations yesterday for ${businessName} (children's skincare brand). Note anything urgent or noteworthy:\n\n${msgSummary}` }],
      });
      const insight = resp.content[0]?.text;
      if (insight) {
        blocks.push({ type: "divider" });
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `💡 *Daily Insight:*\n${insight}` } });
      }
    } catch (e) {
      console.log(`[CS Report] Daily AI insight skipped: ${e.message}`);
    }
  }

  // ── RECENT CONVERSATIONS (for visibility) ──
  if (reamaze.recentSubjects?.length > 0) {
    blocks.push({ type: "divider" });
    let recText = `*Recent conversations:*\n`;
    reamaze.recentSubjects.slice(0, 5).forEach(c => {
      const tagStr = c.tags?.length > 0 ? ` [${c.tags.join(", ")}]` : "";
      const ch = c.channel ? ` via ${c.channel}` : "";
      recText += `• _${c.subject || "No subject"}_${ch}${tagStr}\n`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: recText } });
  }

  try {
    await axios.post("https://slack.com/api/chat.postMessage", {
      channel,
      text: `🎧 CS Daily — ${daily.totalTickets || 0} tickets, ${open.total || 0} open`,
      blocks,
    }, { headers: { Authorization: `Bearer ${slackToken}`, "Content-Type": "application/json" } });
    console.log(`[CS Report] Sent to ${channel}`);
  } catch (err) {
    console.error(`[CS Report] Error:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// WEEKLY CS REPORT — AI-POWERED INSIGHTS
// ═══════════════════════════════════════════════════════════
async function sendCSWeeklyReport(slackToken, channel, csData, businessName, anthropicConfig) {
  if (!csData || csData.error) return;

  const weekly = csData.weekly || {};
  const open = csData.open || {};
  const satisfaction = csData.satisfaction || {};
  const reamazeWeekly = weekly.reamaze || {};
  const customerMessages = csData.customerMessages || [];

  // ── AI ANALYSIS of customer messages ──
  let aiInsights = null;
  if (customerMessages.length > 0 && anthropicConfig?.apiKey) {
    try {
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicConfig.apiKey });

      // Limit messages to keep within token limits (~50 messages)
      const msgSample = customerMessages.slice(0, 60).map((m, i) =>
        `[${i+1}] Channel: ${m.channel} | Subject: ${m.subject}\n${m.body}`
      ).join("\n---\n");

      const response = await client.messages.create({
        model: anthropicConfig.model || "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `You are a customer insights analyst for ${businessName}, a DTC children's skincare brand in New Zealand. Analyze customer service messages and extract actionable business intelligence. Respond ONLY with valid JSON, no markdown fences.`,
        messages: [{ role: "user", content: `Analyze these ${customerMessages.length} customer messages from the past 7 days:

${msgSample}

Respond with ONLY this JSON:
{
  "sentiment": { "positive": 0, "neutral": 0, "negative": 0, "positivePct": 0 },
  "themes": [
    { "theme": "name", "count": 0, "sentiment": "positive|negative|mixed", "example": "brief quote", "insight": "what this means for business" }
  ],
  "productFeedback": [
    { "product": "name or category", "feedback": "summary", "sentiment": "positive|negative|mixed", "count": 0 }
  ],
  "operationalIssues": [
    { "issue": "name", "frequency": 0, "impact": "high|medium|low", "suggestion": "what to fix" }
  ],
  "positiveHighlights": ["brief customer praise or win"],
  "concerns": ["brief customer complaint or issue"],
  "weeklyInsight": "2-3 sentence executive summary of what customers are saying and what it means for the business",
  "actionItems": [
    { "action": "specific recommendation", "priority": "high|medium|low", "owner": "Scott|Ashleigh|CS Team" }
  ]
}` }],
      });

      const raw = response.content[0]?.text || "{}";
      try { aiInsights = JSON.parse(raw); } catch (e) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) try { aiInsights = JSON.parse(match[0]); } catch (e2) { /* skip */ }
      }
      console.log(`[CS Weekly] AI analysis complete: ${aiInsights ? "success" : "failed"}`);
    } catch (err) {
      console.error(`[CS Weekly] AI analysis error:`, err.message);
    }
  }

  // ── BUILD SLACK BLOCKS ──
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Weekly Customer Service Insights` },
    },
  ];

  // ── OVERVIEW ──
  let overview = `*Total conversations (7d):* ${weekly.totalTickets || 0} (avg ${reamazeWeekly.dailyAvg || 0}/day)\n`;
  overview += `*Currently open:* ${open.total || 0}`;
  if (open.unassigned > 0) overview += ` (⚠️ ${open.unassigned} unassigned)`;
  overview += `\n`;
  if (satisfaction.avgRating) {
    overview += `*CSAT (30d):* ${"⭐".repeat(Math.round(satisfaction.avgRating))} ${satisfaction.avgRating}/5\n`;
  }
  overview += `*Messages analyzed:* ${customerMessages.length}`;
  blocks.push({ type: "section", text: { type: "mrkdwn", text: overview } });

  if (aiInsights) {
    // ── EXECUTIVE INSIGHT ──
    if (aiInsights.weeklyInsight) {
      blocks.push({ type: "divider" });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `💡 *Weekly Insight:*\n${aiInsights.weeklyInsight}` } });
    }

    // ── SENTIMENT ──
    if (aiInsights.sentiment) {
      const s = aiInsights.sentiment;
      const total = (s.positive || 0) + (s.neutral || 0) + (s.negative || 0) || 1;
      const posPct = Math.round(((s.positive || 0) / total) * 100);
      const negPct = Math.round(((s.negative || 0) / total) * 100);
      let sentText = `*Sentiment breakdown:*\n`;
      sentText += `🟢 Positive: ${s.positive || 0} (${posPct}%) · `;
      sentText += `⚪ Neutral: ${s.neutral || 0} · `;
      sentText += `🔴 Negative: ${s.negative || 0} (${negPct}%)`;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: sentText } });
    }

    // ── KEY THEMES ──
    if (aiInsights.themes?.length > 0) {
      blocks.push({ type: "divider" });
      let themeText = `*🏷️ Key Themes:*\n`;
      aiInsights.themes.slice(0, 6).forEach(t => {
        const emoji = t.sentiment === "positive" ? "🟢" : t.sentiment === "negative" ? "🔴" : "🟡";
        themeText += `${emoji} *${t.theme}* (${t.count}x) — ${t.insight}\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: themeText } });
    }

    // ── PRODUCT FEEDBACK ──
    if (aiInsights.productFeedback?.length > 0) {
      blocks.push({ type: "divider" });
      let prodText = `*📦 Product Feedback:*\n`;
      aiInsights.productFeedback.slice(0, 5).forEach(p => {
        const emoji = p.sentiment === "positive" ? "👍" : p.sentiment === "negative" ? "👎" : "➡️";
        prodText += `${emoji} *${p.product}* (${p.count}x) — ${p.feedback}\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: prodText } });
    }

    // ── POSITIVE HIGHLIGHTS ──
    if (aiInsights.positiveHighlights?.length > 0) {
      blocks.push({ type: "divider" });
      let posText = `*🎉 Customer Wins:*\n`;
      aiInsights.positiveHighlights.slice(0, 3).forEach(h => {
        posText += `• _"${h}"_\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: posText } });
    }

    // ── CONCERNS ──
    if (aiInsights.concerns?.length > 0) {
      let negText = `*⚠️ Concerns:*\n`;
      aiInsights.concerns.slice(0, 3).forEach(c => {
        negText += `• ${c}\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: negText } });
    }

    // ── OPERATIONAL ISSUES ──
    if (aiInsights.operationalIssues?.length > 0) {
      blocks.push({ type: "divider" });
      let opsText = `*🔧 Operational Issues:*\n`;
      aiInsights.operationalIssues.slice(0, 4).forEach(o => {
        const imp = o.impact === "high" ? "🔴" : o.impact === "medium" ? "🟡" : "🟢";
        opsText += `${imp} *${o.issue}* (${o.frequency}x) → ${o.suggestion}\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: opsText } });
    }

    // ── ACTION ITEMS ──
    if (aiInsights.actionItems?.length > 0) {
      blocks.push({ type: "divider" });
      let actText = `*📋 Recommended Actions:*\n`;
      aiInsights.actionItems.slice(0, 5).forEach((a, i) => {
        const pri = a.priority === "high" ? "🔴" : a.priority === "medium" ? "🟡" : "🟢";
        actText += `${i + 1}. ${pri} ${a.action} → _${a.owner}_\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: actText } });
    }
  } else {
    // Fallback: non-AI summary
    if (reamazeWeekly.byChannel && Object.keys(reamazeWeekly.byChannel).length > 0) {
      let chText = "*By channel (7d):*\n";
      Object.entries(reamazeWeekly.byChannel).sort((a, b) => b[1] - a[1]).forEach(([ch, ct]) => {
        chText += `• ${ch}: ${ct}\n`;
      });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: chText } });
    }
  }

  // ── CHANNEL BREAKDOWN ──
  if (reamazeWeekly.byChannel && Object.keys(reamazeWeekly.byChannel).length > 0) {
    blocks.push({ type: "divider" });
    const channels = Object.entries(reamazeWeekly.byChannel).sort((a, b) => b[1] - a[1]).map(([ch, ct]) => `${ch}: ${ct}`).join(" · ");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Channels (7d):* ${channels}` } });
  }

  try {
    await axios.post("https://slack.com/api/chat.postMessage", {
      channel,
      text: `📊 Weekly CS Insights — ${weekly.totalTickets || 0} tickets, ${customerMessages.length} messages analyzed`,
      blocks,
    }, { headers: { Authorization: `Bearer ${slackToken}`, "Content-Type": "application/json" } });
    console.log(`[CS Weekly Report] Sent to ${channel}`);
  } catch (err) {
    console.error(`[CS Weekly Report] Error:`, err.message);
  }
}

module.exports = { sendCSReport, sendCSWeeklyReport };
