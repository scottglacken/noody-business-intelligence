// utils/ecommerce-report.js — Shopify detail → #noody-ecommerce
const axios = require("axios");
function fmt$(v) { return v != null ? `$${Number(v).toLocaleString("en-NZ",{minimumFractionDigits:0,maximumFractionDigits:0})}` : "N/A"; }

async function sendEcommerceReport(botToken, channelId, shopify, businessName, date) {
  const d = shopify.daily || {}, mtd = shopify.mtd || {}, ytd = shopify.ytd || {};
  const bench = shopify.benchmarks || {}, wow = shopify.wow || {}, l7 = shopify.last7Days || {};
  const vsAvg = bench.vsYtdDailyAvg || 0;
  const statusEmoji = vsAvg >= 10 ? "🟢" : vsAvg >= -10 ? "🟡" : "🔴";
  const statusLabel = vsAvg >= 10 ? "Above Average" : vsAvg >= -10 ? "Average" : "Below Average";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: `🛒 ${businessName} E-Commerce Report` } },
    { type: "section", text: { type: "mrkdwn", text: `*${date}* | Daily Performance vs YTD Benchmark` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `${statusEmoji} *${statusLabel}* — Total Sales: *${fmt$(d.totalSales)}* (${vsAvg > 0 ? "+" : ""}${vsAvg}% vs YTD daily avg of ${fmt$(bench.ytdDailyAvg)})` } },
    { type: "section", fields: [
      { type: "mrkdwn", text: `*Total Sales*\n${fmt$(d.totalSales)}` },
      { type: "mrkdwn", text: `*Orders*\n${d.orders || 0}` },
      { type: "mrkdwn", text: `*AOV*\n${fmt$(d.aov)}` },
      { type: "mrkdwn", text: `*Gross Sales*\n${fmt$(d.grossSales)}` },
      { type: "mrkdwn", text: `*New Customers*\n${d.newCustomers || 0}` },
      { type: "mrkdwn", text: `*Returning Rate*\n${d.returningCustomerRate || 0}%` },
    ]},
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*📅 Last 7 Days*` }, fields: [
      { type: "mrkdwn", text: `*Revenue*\n${fmt$(l7.revenue)}\n${(wow.revenueChange||0) >= 0 ? "📈" : "📉"} ${wow.revenueChange != null ? wow.revenueChange+"% WoW" : "N/A"}` },
      { type: "mrkdwn", text: `*Orders*\n${l7.orders || 0}\n${(wow.ordersChange||0) >= 0 ? "📈" : "📉"} ${wow.ordersChange != null ? wow.ordersChange+"% WoW" : "N/A"}` },
      { type: "mrkdwn", text: `*Daily Avg*\n${fmt$(l7.dailyAvg)}` },
      { type: "mrkdwn", text: `*AOV*\n${fmt$(l7.aov)}` },
    ]},
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*📊 Month to Date*` }, fields: [
      { type: "mrkdwn", text: `*MTD Revenue*\n${fmt$(mtd.revenue)}` },
      { type: "mrkdwn", text: `*MTD Orders*\n${mtd.orders || 0}` },
      { type: "mrkdwn", text: `*MTD AOV*\n${fmt$(mtd.aov)}` },
      { type: "mrkdwn", text: `*Daily Avg (MTD)*\n${fmt$(mtd.dailyAvg)}` },
    ]},
  ];

  if (d.topProducts?.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🏆 Top Products (Yesterday)*\n" + d.topProducts.map((p,i) => `${i+1}. *${p.name}* — ${p.qty} sold, ${fmt$(p.revenue)}`).join("\n") } });
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📈 YTD Benchmark*\nTotal: ${fmt$(ytd.revenue)} from ${ytd.orders} orders (${ytd.daysElapsed}d) | Daily avg: ${fmt$(bench.ytdDailyAvg)} | AOV: ${fmt$(ytd.aov)}` } });
  blocks.push({ type: "divider" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `🛒 E-Commerce Report • ${new Date().toLocaleString("en-NZ",{timeZone:"Pacific/Auckland"})}` }] });

  await axios.post("https://slack.com/api/chat.postMessage", { channel: channelId, blocks, text: `${businessName} E-Commerce — ${fmt$(d.totalSales)} revenue` }, { headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" } });
  console.log(`[Ecommerce Report] Sent to ${channelId}`);
}

module.exports = { sendEcommerceReport };
