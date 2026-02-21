// utils/ecommerce-report.js — Shopify detail → #noody-ecommerce
const axios = require("axios");
function fmt$(v) { return v != null ? `$${Number(v).toLocaleString("en-NZ",{minimumFractionDigits:0,maximumFractionDigits:0})}` : "N/A"; }

async function sendEcommerceReport(botToken, channelId, shopify, businessName, date) {
  const d = shopify.daily || {};
  const mtd = shopify.mtd || {};
  const perf = shopify.performance || {};
  const comp = shopify.comparison || {};
  const lw = comp.lastWeek || {};
  const pw = comp.prevWeek || {};
  const lm = comp.lastMonth || {};

  const vsAvg = perf.vsLastMonthAvg || 0;
  const statusEmoji = vsAvg >= 10 ? "🟢" : vsAvg >= -10 ? "🟡" : "🔴";
  const statusLabel = vsAvg >= 10 ? "Above Average" : vsAvg >= -10 ? "Average" : "Below Average";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: `🛒 ${businessName} E-Commerce Report` } },
    { type: "section", text: { type: "mrkdwn", text: `*${date}* | Daily Performance vs Last Month Avg` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `${statusEmoji} *${statusLabel}* — Revenue: *${fmt$(d.revenue)}* (${vsAvg > 0 ? "+" : ""}${vsAvg}% vs last month avg of ${fmt$(perf.lastMonthDailyAvg)})` } },
    { type: "section", fields: [
      { type: "mrkdwn", text: `*Revenue*\n${fmt$(d.revenue)}` },
      { type: "mrkdwn", text: `*Orders*\n${d.orders || 0}` },
      { type: "mrkdwn", text: `*AOV*\n${fmt$(d.aov)}` },
      { type: "mrkdwn", text: `*Gross Sales*\n${fmt$(d.grossSales)}` },
      { type: "mrkdwn", text: `*New Customers*\n${d.newCustomers || 0}` },
      { type: "mrkdwn", text: `*Returning Rate*\n${d.returningCustomerRate || 0}%` },
    ]},
    { type: "divider" },
  ];

  // Week over week
  const wowRev = pw.wowChangePercent || perf.wowChange || 0;
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📅 Last 7 Days*` }, fields: [
    { type: "mrkdwn", text: `*Revenue*\n${fmt$(lw.revenue)}\n${wowRev >= 0 ? "📈" : "📉"} ${wowRev}% WoW` },
    { type: "mrkdwn", text: `*Orders*\n${lw.orders || 0}` },
    { type: "mrkdwn", text: `*AOV*\n${fmt$(lw.aov)}` },
    { type: "mrkdwn", text: `*DoD*\n${perf.dodChange >= 0 ? "📈" : "📉"} ${perf.dodChange || 0}%` },
  ]});

  blocks.push({ type: "divider" });

  // MTD
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📊 Month to Date* (${mtd.daysElapsed || 0} days)` }, fields: [
    { type: "mrkdwn", text: `*MTD Revenue*\n${fmt$(mtd.revenue)}` },
    { type: "mrkdwn", text: `*MTD Orders*\n${mtd.orders || 0}` },
    { type: "mrkdwn", text: `*MTD AOV*\n${fmt$(mtd.aov)}` },
    { type: "mrkdwn", text: `*Pace*\n${mtd.pacePercent || 0}% vs last month` },
  ]});

  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Projected month:* ${fmt$(mtd.projectedMonthly)} | *Last month avg:* ${fmt$(perf.lastMonthDailyAvg)}/day | *MTD avg:* ${fmt$(perf.mtdDailyAvg)}/day | *Returning (MTD):* ${mtd.returningCustomerRate || 0}%` } });

  if (d.topProducts?.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🏆 Top Products (Yesterday)*\n" + d.topProducts.map((p,i) => `${i+1}. *${p.name}* — ${p.qty} sold, ${fmt$(p.revenue)}`).join("\n") } });
  }

  if (mtd.topProducts?.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🏆 Top Products (MTD)*\n" + mtd.topProducts.map((p,i) => `${i+1}. *${p.name}* — ${p.qty} sold, ${fmt$(p.revenue)}`).join("\n") } });
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `🛒 E-Commerce Report • ${new Date().toLocaleString("en-NZ",{timeZone:"Pacific/Auckland"})}` }] });

  await axios.post("https://slack.com/api/chat.postMessage", { channel: channelId, blocks, text: `${businessName} E-Commerce — ${fmt$(d.revenue)} revenue` }, { headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" } });
  console.log(`[Ecommerce Report] Sent to ${channelId}`);
}

module.exports = { sendEcommerceReport };
