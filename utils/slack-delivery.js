// utils/slack-delivery.js
// Sends rich Slack blocks with department scores, action items, and charts

const { WebClient } = require("@slack/web-api");

const SCORE_EMOJI = { green: "🟢", yellow: "🟡", red: "🔴" };
const SCORE_LABEL = { green: "On Track", yellow: "Attention", red: "Action Required" };

function formatCurrency(amount, currency = "NZD") {
  if (amount === null || amount === undefined) return "N/A";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function formatPercent(val, decimals = 1) {
  if (val === null || val === undefined) return "N/A";
  return `${val.toFixed(decimals)}%`;
}

function buildSlackBlocks(analysis, data, businessName, date) {
  const overallEmoji = SCORE_EMOJI[analysis.overallScore] || "⚪";
  const blocks = [];

  // ── Header ────────────────────────────────────────────────
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `${overallEmoji} ${businessName} Daily Report — ${date}` }
  });

  // ── Headline & Summary ───────────────────────────────────
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*${analysis.headline}*\n${analysis.summary}` }
  });

  blocks.push({ type: "divider" });

  // ── Department Scorecard ─────────────────────────────────
  const scores = analysis.departmentScores || {};
  const deptFields = Object.entries(scores).map(([dept, info]) => ({
    type: "mrkdwn",
    text: `${SCORE_EMOJI[info.score]} *${dept.charAt(0).toUpperCase() + dept.slice(1)}*\n${info.note}`
  }));

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*📊 Department Scorecard*" }
  });

  // Split into groups of 2 for two-column layout
  for (let i = 0; i < deptFields.length; i += 2) {
    blocks.push({
      type: "section",
      fields: deptFields.slice(i, i + 2)
    });
  }

  blocks.push({ type: "divider" });

  // ── Key Numbers ──────────────────────────────────────────
  const shopify = data.find(d => d.source === "shopify");
  const meta = data.find(d => d.source === "meta_ads");
  const googleAds = data.find(d => d.source === "google_ads");
  const ga4 = data.find(d => d.source === "ga4");
  const cs = data.find(d => d.source === "customer_service");
  const inventory = data.find(d => d.source === "unleashed");

  if (shopify && !shopify.error) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*💰 Revenue & Orders (Yesterday)*" },
      fields: [
        { type: "mrkdwn", text: `*Revenue*\n${formatCurrency(shopify.daily?.revenue)}` },
        { type: "mrkdwn", text: `*Orders*\n${shopify.daily?.orders || 0}` },
        { type: "mrkdwn", text: `*AOV*\n${formatCurrency(shopify.daily?.aov)}` },
        { type: "mrkdwn", text: `*New Customers*\n${shopify.daily?.newCustomers || 0}` },
        { type: "mrkdwn", text: `*MTD Revenue*\n${formatCurrency(shopify.mtd?.revenue)}` },
        { type: "mrkdwn", text: `*Refunds*\n${formatCurrency(shopify.daily?.refunds)}` },
      ]
    });
  }

  if (meta && !meta.error) {
    const ctrStatus = meta.daily?.ctr >= 1.0 ? "🟢" : meta.daily?.ctr >= 0.5 ? "🟡" : "🔴";
    const roasStatus = meta.daily?.roas >= 3.0 ? "🟢" : meta.daily?.roas >= 1.5 ? "🟡" : "🔴";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*📣 Meta Ads (Yesterday)*" },
      fields: [
        { type: "mrkdwn", text: `*Spend*\n${formatCurrency(meta.daily?.spend)}` },
        { type: "mrkdwn", text: `${roasStatus} *ROAS*\n${meta.daily?.roas}x` },
        { type: "mrkdwn", text: `${ctrStatus} *CTR*\n${formatPercent(meta.daily?.ctr)}` },
        { type: "mrkdwn", text: `*CPC*\n${formatCurrency(meta.daily?.cpc)}` },
        { type: "mrkdwn", text: `*Purchases*\n${meta.daily?.purchases || 0}` },
        { type: "mrkdwn", text: `*Revenue via Meta*\n${formatCurrency(meta.daily?.purchaseValue)}` },
      ]
    });
  }

  // ── Klaviyo Email Marketing ────────────────────────────────
  const klaviyo = data.find(d => d.source === "klaviyo");
  if (klaviyo && !klaviyo.error) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*📧 Email Marketing (Yesterday)*" },
      fields: [
        { type: "mrkdwn", text: `*Campaigns Sent*\n${klaviyo.daily?.campaignsSent || 0}` },
        { type: "mrkdwn", text: `*Active Lists*\n${klaviyo.lists?.totalLists || 0}` },
        { type: "mrkdwn", text: `*Recent Campaigns (7d)*\n${klaviyo.recent?.campaignsLast7Days || 0}` },
      ]
    });
    
    // Show yesterday's campaign names if any
    if (klaviyo.daily?.campaigns?.length > 0) {
      const campaignNames = klaviyo.daily.campaigns.map(c => c.name).join(", ");
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `📨 *Campaigns:* ${campaignNames}` }
      });
    }
  }

  if (ga4 && !ga4.error) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🌐 Website Traffic (Yesterday)*" },
      fields: [
        { type: "mrkdwn", text: `*Sessions*\n${ga4.daily?.sessions?.toLocaleString() || 0}` },
        { type: "mrkdwn", text: `*Users*\n${ga4.daily?.users?.toLocaleString() || 0}` },
        { type: "mrkdwn", text: `*Conversion Rate*\n${formatPercent(ga4.daily?.conversionRate)}` },
        { type: "mrkdwn", text: `*Add to Cart Rate*\n${formatPercent(ga4.daily?.addToCartRate)}` },
      ]
    });
  }

  if (cs && !cs.error) {
    const rtStatus = (cs.daily?.avgResponseTimeHours || 99) <= 2 ? "🟢" : (cs.daily?.avgResponseTimeHours || 99) <= 8 ? "🟡" : "🔴";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🎧 Customer Service (Yesterday)*" },
      fields: [
        { type: "mrkdwn", text: `*New Tickets*\n${cs.daily?.newTickets || 0}` },
        { type: "mrkdwn", text: `*Open Total*\n${cs.daily?.openTotal || 0}` },
        { type: "mrkdwn", text: `${rtStatus} *Avg Response Time*\n${cs.daily?.avgResponseTimeHours ? `${cs.daily.avgResponseTimeHours}h` : "N/A"}` },
        { type: "mrkdwn", text: `*Satisfaction*\n${cs.daily?.avgSatisfaction ? `${cs.daily.avgSatisfaction}/5` : "N/A"}` },
      ]
    });
  }

  if (inventory && !inventory.error) {
    const lowStockStatus = inventory.inventory?.lowStockCount > 5 ? "🔴" : inventory.inventory?.lowStockCount > 0 ? "🟡" : "🟢";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*📦 Inventory*" },
      fields: [
        { type: "mrkdwn", text: `*Stock Value*\n${formatCurrency(inventory.inventory?.totalStockValue)}` },
        { type: "mrkdwn", text: `${lowStockStatus} *Low Stock Items*\n${inventory.inventory?.lowStockCount || 0}` },
        { type: "mrkdwn", text: `*Pending Orders*\n${inventory.orders?.pendingCount || 0}` },
      ]
    });

    if (inventory.inventory?.lowStockCount > 0) {
      const lowItems = (inventory.inventory?.lowStockItems || []).slice(0, 3);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Low Stock Alert:* ${lowItems.map(i => `${i.name} (${i.onHand} left)`).join(", ")}`
        }
      });
    }
  }

  blocks.push({ type: "divider" });

  // ── Wins ─────────────────────────────────────────────────
  if (analysis.wins?.length > 0) {
    const winsText = analysis.wins.map(w => `✅ *${w.metric}:* ${w.value} — ${w.context}`).join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🏆 Today's Wins*\n${winsText}` }
    });
  }

  // ── Concerns ─────────────────────────────────────────────
  if (analysis.concerns?.length > 0) {
    const urgentConcerns = analysis.concerns.filter(c => c.urgency === "high");
    const otherConcerns = analysis.concerns.filter(c => c.urgency !== "high");
    let concernsText = "";
    if (urgentConcerns.length > 0) {
      concernsText += urgentConcerns.map(c => `🚨 *${c.metric}:* ${c.value} — ${c.context}`).join("\n");
    }
    if (otherConcerns.length > 0) {
      if (concernsText) concernsText += "\n";
      concernsText += otherConcerns.map(c => `⚠️ *${c.metric}:* ${c.value} — ${c.context}`).join("\n");
    }
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*⚠️ Areas Needing Attention*\n${concernsText}` }
    });
  }

  blocks.push({ type: "divider" });

  // ── Action Items ─────────────────────────────────────────
  if (analysis.actionItems?.length > 0) {
    const actionsText = analysis.actionItems
      .map(a => `*${a.priority}.* ${a.action}\n   › Owner: ${a.owner} | Timeframe: ${a.timeframe}`)
      .join("\n\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🎯 Today's Action Items*\n${actionsText}` }
    });
  }

  // ── Trend Alert ──────────────────────────────────────────
  if (analysis.trendAlert) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*📈 Trend Alert*\n${analysis.trendAlert}` }
    });
  }

  // ── Footer ────────────────────────────────────────────────
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `Generated by Business Intelligence System • ${new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZT`
    }]
  });

  return blocks;
}

async function sendSlackReport(slackToken, channelId, analysis, data, businessName, date) {
  const client = new WebClient(slackToken);
  const blocks = buildSlackBlocks(analysis, data, businessName, date);

  try {
    await client.chat.postMessage({
      channel: channelId,
      text: `${SCORE_EMOJI[analysis.overallScore]} ${businessName} Daily Report — ${analysis.headline}`,
      blocks,
    });
    console.log(`[Slack] Sent report for ${businessName} to ${channelId}`);
  } catch (err) {
    console.error(`[Slack] Error sending to ${channelId}:`, err.message);
    throw err;
  }
}

module.exports = { sendSlackReport, buildSlackBlocks };
