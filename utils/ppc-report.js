// utils/ppc-report.js — Meta + Google Ads → #noody-ppc
const axios = require("axios");
function fmt$(v) { return v != null ? `$${Number(v).toFixed(2)}` : "N/A"; }
function fmtPct(v) { return v != null ? `${Number(v).toFixed(2)}%` : "N/A"; }
function se(val, good, avg) { return val >= good ? "🟢" : val >= avg ? "🟡" : "🔴"; }

async function sendPPCReport(botToken, channelId, metaData, googleAdsData, businessName, date) {
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `📣 ${businessName} PPC Performance Report` } },
    { type: "section", text: { type: "mrkdwn", text: `*${date}* | Paid Advertising Analysis` } },
    { type: "divider" },
  ];

  if (metaData && !metaData.error) {
    const d = metaData.daily || {}, w = metaData.last7Days || {}, mtd = metaData.mtd || {};

    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📘 Meta Ads — Yesterday*` } });
    blocks.push({ type: "section", fields: [
      { type: "mrkdwn", text: `*Spend*\n${fmt$(d.spend)}` },
      { type: "mrkdwn", text: `${se(d.roas,3,1.5)} *ROAS*\n${d.roas}x` },
      { type: "mrkdwn", text: `${se(d.ctr,1,0.5)} *CTR*\n${fmtPct(d.ctr)}` },
      { type: "mrkdwn", text: `*CPC*\n${fmt$(d.cpc)}` },
      { type: "mrkdwn", text: `*CPA*\n${fmt$(d.cpa)}` },
      { type: "mrkdwn", text: `*Purchases*\n${d.purchases||0} (${fmt$(d.purchaseValue)})` },
    ]});
    blocks.push({ type: "section", fields: [
      { type: "mrkdwn", text: `*Reach*\n${(d.reach||0).toLocaleString()}` },
      { type: "mrkdwn", text: `*Frequency*\n${d.frequency||0}x` },
      { type: "mrkdwn", text: `*CPM*\n${fmt$(d.cpm)}` },
      { type: "mrkdwn", text: `*Impressions*\n${(d.impressions||0).toLocaleString()}` },
    ]});
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Funnel:* ${d.linkClicks||0} clicks → ${d.viewContent||0} views → ${d.addToCart||0} ATC → ${d.initiateCheckout||0} checkout → ${d.purchases||0} purchase\nATC→Checkout: ${d.cartToCheckoutRate}% | Checkout→Purchase: ${d.checkoutToPurchaseRate}%` } });

    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📘 Meta Ads — Last 7 Days*` }, fields: [
      { type: "mrkdwn", text: `*Spend*\n${fmt$(w.spend)}` }, { type: "mrkdwn", text: `*ROAS*\n${w.roas}x` },
      { type: "mrkdwn", text: `*CTR*\n${fmtPct(w.ctr)}` }, { type: "mrkdwn", text: `*CPA*\n${fmt$(w.cpa)}` },
      { type: "mrkdwn", text: `*Reach*\n${(w.reach||0).toLocaleString()}` }, { type: "mrkdwn", text: `*Frequency*\n${w.frequency}x` },
    ]});

    // Campaign breakdown 7d
    const camps = metaData.campaigns?.last7Days || [];
    if (camps.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📊 Campaign Performance (7 Days)*` } });
      camps.slice(0, 8).forEach(c => {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `${se(c.roas,3,1.5)} *${c.name}*\nSpend: ${fmt$(c.spend)} | ROAS: ${c.roas}x | CTR: ${fmtPct(c.ctr)} | CPC: ${fmt$(c.cpc)} | Freq: ${c.frequency}x | Purchases: ${c.purchases} (${fmt$(c.purchaseValue)})` } });
      });
    }

    // Adset breakdown
    const adsets = metaData.adSets?.yesterday || [];
    if (adsets.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📋 Ad Sets (Yesterday)*` } });
      adsets.slice(0, 5).forEach(as => {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${as.name}* _(${as.campaign})_\nSpend: ${fmt$(as.spend)} | ROAS: ${as.roas}x | CTR: ${fmtPct(as.ctr)} | Freq: ${as.frequency}x` } });
      });
    }

    if (metaData.frequencyWarnings?.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*⚠️ Frequency Alerts*\n${metaData.frequencyWarnings.map(w => `• ${w}`).join("\n")}` } });
    }

    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📅 MTD*: Spend ${fmt$(mtd.spend)} | Revenue ${fmt$(mtd.purchaseValue)} | ROAS ${mtd.roas}x | Purchases ${mtd.purchases}` } });
  } else if (metaData?.error) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📘 Meta Ads* ⚠️ ${metaData.error}` } });
  }

  if (googleAdsData && !googleAdsData.error) {
    blocks.push({ type: "divider" });
    const g = googleAdsData.daily || {};
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*🔍 Google Ads — Yesterday*` }, fields: [
      { type: "mrkdwn", text: `*Spend*\n${fmt$(g.spend)}` }, { type: "mrkdwn", text: `*ROAS*\n${g.roas}x` },
      { type: "mrkdwn", text: `*CTR*\n${fmtPct(g.ctr)}` }, { type: "mrkdwn", text: `*Conversions*\n${g.conversions||0} (${fmt$(g.conversionValue)})` },
    ]});
    (googleAdsData.campaigns || []).slice(0, 5).forEach(c => {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `• *${c.name}* — ${fmt$(c.spend)} | ROAS: ${c.roas}x | CTR: ${fmtPct(c.ctr)} | Conv: ${c.conversions}` } });
    });
  } else if (googleAdsData?.error) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*🔍 Google Ads* ⚠️ ${googleAdsData.error}` } });
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `📊 CTR 🔴<0.5% 🟡0.5-1% 🟢>1% | ROAS 🔴<1.5x 🟡1.5-3x 🟢>3x | Freq ⚠️>3x\n📣 PPC Report • ${new Date().toLocaleString("en-NZ",{timeZone:"Pacific/Auckland"})}` }] });

  await axios.post("https://slack.com/api/chat.postMessage", { channel: channelId, blocks, text: `${businessName} PPC Report — ${date}` }, { headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" } });
  console.log(`[PPC Report] Sent to ${channelId}`);
}

module.exports = { sendPPCReport };
