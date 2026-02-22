// utils/cs-report.js
// Daily + Weekly Customer Service reports → Slack

const axios = require("axios");

async function sendCSReport(slackToken, channel, csData, businessName, reportDate) {
  if (!csData || csData.error) return;

  const daily = csData.daily || {};
  const open = csData.open || {};
  const satisfaction = csData.satisfaction || {};
  const reamaze = daily.reamaze || {};

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
// WEEKLY CS REPORT
// ═══════════════════════════════════════════════════════════
async function sendCSWeeklyReport(slackToken, channel, csData, businessName) {
  if (!csData || csData.error) return;

  const weekly = csData.weekly || {};
  const open = csData.open || {};
  const satisfaction = csData.satisfaction || {};
  const reamazeWeekly = weekly.reamaze || {};

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Weekly Customer Service Report` },
    },
  ];

  // ── WEEKLY OVERVIEW ──
  let overview = `*Total conversations (7d):* ${weekly.totalTickets || 0}\n`;
  overview += `*Daily average:* ${reamazeWeekly.dailyAvg || 0}\n`;
  overview += `*Currently open:* ${open.total || 0}\n`;

  if (satisfaction.avgRating !== null && satisfaction.avgRating !== undefined) {
    overview += `*CSAT (30d):* ${satisfaction.avgRating}/5 (${satisfaction.totalRatings} ratings)\n`;
    if (satisfaction.distribution) {
      const dist = satisfaction.distribution;
      const total = satisfaction.totalRatings || 1;
      const positive = ((dist[4] || 0) + (dist[5] || 0));
      overview += `*Positive rate:* ${Math.round((positive / total) * 100)}% (4-5 stars)\n`;
    }
  }

  blocks.push({ type: "section", text: { type: "mrkdwn", text: overview } });

  // ── CHANNEL BREAKDOWN ──
  if (reamazeWeekly.byChannel && Object.keys(reamazeWeekly.byChannel).length > 0) {
    let chText = "*By channel (7d):*\n";
    Object.entries(reamazeWeekly.byChannel)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ch, ct]) => {
        const pct = weekly.totalTickets > 0 ? Math.round((ct / weekly.totalTickets) * 100) : 0;
        chText += `• ${ch}: ${ct} (${pct}%)\n`;
      });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: chText } });
  }

  // ── TOP ISSUES ──
  const topIssues = csData.topIssues || [];
  if (topIssues.length > 0) {
    blocks.push({ type: "divider" });
    let issuesText = "*🏷️ Top Issues This Week:*\n";
    topIssues.forEach((issue, i) => {
      const bar = "█".repeat(Math.min(Math.ceil(issue.count / 2), 10));
      issuesText += `${i + 1}. \`${issue.tag}\` — ${issue.count} tickets ${bar}\n`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: issuesText } });
  }

  // ── META INBOX WEEKLY ──
  const metaWeekly = weekly.metaInbox || {};
  if (metaWeekly.conversations > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Meta Inbox (7d):* ${metaWeekly.conversations} conversations` },
    });
  }

  // ── AGING ALERT ──
  if (open.byAge && (open.byAge.over48h > 0 || open.byAge.over24h > 0)) {
    blocks.push({ type: "divider" });
    let agingText = "⚠️ *Tickets needing attention:*\n";
    if (open.byAge.over48h > 0) agingText += `🔴 ${open.byAge.over48h} tickets open >48 hours\n`;
    if (open.byAge.over24h > 0) agingText += `🟠 ${open.byAge.over24h} tickets open >24 hours\n`;
    if (open.unassigned > 0) agingText += `❓ ${open.unassigned} tickets unassigned\n`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: agingText } });
  }

  // ── SATISFACTION BREAKDOWN ──
  if (satisfaction.totalRatings > 0 && satisfaction.distribution) {
    blocks.push({ type: "divider" });
    const d = satisfaction.distribution;
    let satText = "*Customer Satisfaction (30d):*\n";
    for (let i = 5; i >= 1; i--) {
      const bar = "█".repeat(Math.min(d[i] || 0, 20));
      satText += `${"⭐".repeat(i)} ${d[i] || 0} ${bar}\n`;
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: satText } });
  }

  try {
    await axios.post("https://slack.com/api/chat.postMessage", {
      channel,
      text: `📊 Weekly CS — ${weekly.totalTickets || 0} tickets, CSAT ${satisfaction.avgRating || "N/A"}/5`,
      blocks,
    }, { headers: { Authorization: `Bearer ${slackToken}`, "Content-Type": "application/json" } });
    console.log(`[CS Weekly Report] Sent to ${channel}`);
  } catch (err) {
    console.error(`[CS Weekly Report] Error:`, err.message);
  }
}

module.exports = { sendCSReport, sendCSWeeklyReport };
