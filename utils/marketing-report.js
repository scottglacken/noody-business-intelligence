// utils/marketing-report.js — Klaviyo email marketing → #noody-marketing
const axios = require("axios");
function fmtPct(v) { return v != null ? `${Number(v).toFixed(1)}%` : "N/A"; }
function fmt$(v) { return v != null ? `$${Number(v).toFixed(2)}` : "N/A"; }
function re(val, good, avg) { if (val == null) return "⚪"; return val >= good ? "🟢" : val >= avg ? "🟡" : "🔴"; }

async function sendMarketingReport(botToken, channelId, klaviyo, businessName, date) {
  const d7 = klaviyo.last7Days || {}, d30 = klaviyo.last30Days || {}, flows = klaviyo.flows || {};
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `📧 ${businessName} Email Marketing Report` } },
    { type: "section", text: { type: "mrkdwn", text: `*${date}* | Klaviyo Performance Overview` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*📬 Campaign Performance (Last 7 Days)* — ${d7.campaignsSent || 0} campaigns sent` } },
  ];

  if (d7.avgOpenRate != null) {
    blocks.push({ type: "section", fields: [
      { type: "mrkdwn", text: `${re(d7.avgOpenRate,40,25)} *Open Rate*\n${fmtPct(d7.avgOpenRate)}` },
      { type: "mrkdwn", text: `${re(d7.avgClickRate,5,2.5)} *Click Rate*\n${fmtPct(d7.avgClickRate)}` },
      { type: "mrkdwn", text: `*Revenue*\n${fmt$(d7.totalRevenue)}` },
      { type: "mrkdwn", text: `*Rev/Recipient*\n${fmt$(d7.revenuePerRecipient)}` },
      { type: "mrkdwn", text: `*Delivered*\n${(d7.totalDelivered||0).toLocaleString()}` },
      { type: "mrkdwn", text: `${re(100-(d7.bounceRate||0),98,95)} *Bounce Rate*\n${fmtPct(d7.bounceRate)}` },
    ]});
    const camps = d7.campaigns || [];
    if (camps.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📨 Individual Campaigns*` } });
      camps.forEach(c => {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${c.name||"Untitled"}*\n${re(c.openRate,40,25)} Open: ${fmtPct(c.openRate)} | ${re(c.clickRate,5,2.5)} Click: ${fmtPct(c.clickRate)} | Rev: ${fmt$(c.revenue)} | Rev/Recip: ${fmt$(c.revenuePerRecipient)}` } });
      });
    }
  } else {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `⚠️ Detailed metrics not available — may need additional Klaviyo API scopes (campaigns:read)` } });
    if (d7.campaignNames?.length > 0) blocks.push({ type: "section", text: { type: "mrkdwn", text: `📨 *Sent:* ${d7.campaignNames.join(", ")}` } });
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📅 30-Day Overview* — ${d30.campaignsSent||0} campaigns` } });
  if (d30.avgOpenRate != null) {
    blocks.push({ type: "section", fields: [
      { type: "mrkdwn", text: `*Avg Open*\n${fmtPct(d30.avgOpenRate)}` }, { type: "mrkdwn", text: `*Avg Click*\n${fmtPct(d30.avgClickRate)}` },
      { type: "mrkdwn", text: `*Total Revenue*\n${fmt$(d30.totalRevenue)}` }, { type: "mrkdwn", text: `*Rev/Recipient*\n${fmt$(d30.revenuePerRecipient)}` },
    ]});
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*🔄 Active Flows (${flows.active||0}/${flows.total||0})*${flows.flowNames?.length ? "\n" + flows.flowNames.map(n=>`• ${n}`).join("\n") : ""}` } });

  if (flows.topFlows?.length > 0) {
    const revFlows = flows.topFlows.filter(f => f.revenue > 0);
    if (revFlows.length > 0) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Top Flows by Revenue (30d)*` } });
      revFlows.slice(0, 5).forEach(f => {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${f.name}* — Rev: ${fmt$(f.revenue)} | Open: ${fmtPct(f.openRate)} | Click: ${fmtPct(f.clickRate)}` } });
      });
    }
    if (flows.totalRevenue30d > 0) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Total Flow Revenue (30d):* ${fmt$(flows.totalRevenue30d)}` } });
  }

  if (klaviyo.attributedRevenue30d > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*💰 Total Klaviyo Attributed Revenue (30d): ${fmt$(klaviyo.attributedRevenue30d)}*` } });
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `📊 Open 🔴<15% 🟡15-40% 🟢>40% | Click 🔴<1% 🟡1-5% 🟢>5%\n📧 Marketing Report • ${new Date().toLocaleString("en-NZ",{timeZone:"Pacific/Auckland"})}` }] });

  await axios.post("https://slack.com/api/chat.postMessage", { channel: channelId, blocks, text: `${businessName} Marketing Report — ${date}` }, { headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" } });
  console.log(`[Marketing Report] Sent to ${channelId}`);
}

module.exports = { sendMarketingReport };
