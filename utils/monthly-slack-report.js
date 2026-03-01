// utils/monthly-slack-report.js — Rich Slack formatting for monthly business review
const axios = require("axios");

const gradeEmoji = (grade) => {
  if (!grade) return "❓";
  const g = grade.toUpperCase().charAt(0);
  return { A: "🟢", B: "🔵", C: "🟡", D: "🟠", F: "🔴" }[g] || "❓";
};

const pctEmoji = (pct) => {
  if (pct == null) return "";
  return pct > 0 ? `📈 +${pct}%` : pct < 0 ? `📉 ${pct}%` : `➡️ 0%`;
};

const fmtMoney = (v) => {
  if (v == null) return "N/A";
  return `$${Number(v).toLocaleString("en-NZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

async function sendMonthlySlackReport(token, channel, analysis, rawData, businessName, dates) {
  const post = async (blocks) => {
    try {
      await axios.post("https://slack.com/api/chat.postMessage", {
        channel,
        blocks,
        unfurl_links: false,
      }, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    } catch (err) {
      console.error("[Monthly Slack] Post error:", err.message);
    }
  };

  const shopify = rawData.find(d => d.source === "shopify" && !d.error);
  const meta = rawData.find(d => d.source === "meta_ads" && !d.error);
  const xero = rawData.find(d => d.source === "xero" && !d.error);
  const social = rawData.find(d => d.source === "social" && !d.error);

  // ── 1. HEADER & EXECUTIVE SUMMARY ────────────────────────
  const headerBlocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 ${businessName} — ${dates.monthName} Monthly Review`, emoji: true },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${gradeEmoji(analysis.overallGrade)} *Overall Grade: ${analysis.overallGrade || "N/A"}*  —  ${analysis.gradeRationale || ""}\n\n${analysis.executiveSummary || "No summary available."}`,
      },
    },
    { type: "divider" },
  ];
  await post(headerBlocks);

  // ── 2. REVENUE & SHOPIFY PERFORMANCE ─────────────────────
  if (shopify || analysis.revenueAnalysis) {
    const ra = analysis.revenueAnalysis || {};
    const s = shopify?.month || {};
    const comp = shopify?.comparison || {};

    const revenueBlocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "💰 Revenue Performance", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${ra.headline || "Revenue Summary"}*`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Month Revenue*\n${fmtMoney(s.revenue || ra.monthRevenue)}` },
          { type: "mrkdwn", text: `*vs YTD Avg*\n${pctEmoji(comp.vsYtdAvgRevPct)}` },
          { type: "mrkdwn", text: `*Orders*\n${s.orders || "N/A"}` },
          { type: "mrkdwn", text: `*vs Prev Month*\n${pctEmoji(comp.vsPreMonthRevPct)}` },
          { type: "mrkdwn", text: `*AOV*\n${fmtMoney(s.aov)}` },
          { type: "mrkdwn", text: `*Daily Avg*\n${fmtMoney(s.dailyAvgRevenue)}` },
        ],
      },
    ];

    // Customer metrics
    if (s.uniqueCustomers) {
      revenueBlocks.push({
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Unique Customers*\n${s.uniqueCustomers}` },
          { type: "mrkdwn", text: `*Repeat Rate*\n${s.repeatRate || 0}%` },
          { type: "mrkdwn", text: `*Discounted Orders*\n${s.discountedOrderPct || 0}%` },
          { type: "mrkdwn", text: `*Total Discounts*\n${fmtMoney(s.totalDiscounts)}` },
        ],
      });
    }

    // Top products
    if (s.topProducts?.length > 0) {
      const prodList = s.topProducts.slice(0, 5).map((p, i) => `${i + 1}. *${p.name}* — ${p.qty} units, ${fmtMoney(p.revenue)}`).join("\n");
      revenueBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*🏆 Top Products*\n${prodList}` },
      });
    }

    // Weekly breakdown
    if (s.weeklyBreakdown?.length > 0) {
      const weekLines = s.weeklyBreakdown.map(w => `Day ${w.week}: ${fmtMoney(w.revenue)} (${w.orders} orders)`).join(" → ");
      revenueBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*📅 Weekly Trend*\n${weekLines}` },
      });
    }

    if (ra.keyInsight) {
      revenueBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `💡 ${ra.keyInsight}` },
      });
    }

    revenueBlocks.push({ type: "divider" });
    await post(revenueBlocks);
  }

  // ── 3. YTD COMPARISON ────────────────────────────────────
  if (shopify?.ytd) {
    const ytd = shopify.ytd;
    const ytdBlocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "📈 YTD Benchmark Comparison", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*YTD Revenue*\n${fmtMoney(ytd.revenue)}` },
          { type: "mrkdwn", text: `*YTD Monthly Avg*\n${fmtMoney(ytd.monthlyAvgRevenue)}` },
          { type: "mrkdwn", text: `*YTD Orders*\n${ytd.orders}` },
          { type: "mrkdwn", text: `*YTD AOV*\n${fmtMoney(ytd.aov)}` },
          { type: "mrkdwn", text: `*YTD Daily Avg*\n${fmtMoney(ytd.dailyAvgRevenue)}` },
          { type: "mrkdwn", text: `*Months Covered*\n${ytd.months}` },
        ],
      },
      { type: "divider" },
    ];
    await post(ytdBlocks);
  }

  // ── 4. META ADS ──────────────────────────────────────────
  if (meta && !meta.error) {
    const m = meta.month || {};
    const mComp = meta.comparison || {};

    const metaBlocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "📣 Meta Ads Performance", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Spend*\n${fmtMoney(m.spend)}` },
          { type: "mrkdwn", text: `*Revenue*\n${fmtMoney(m.purchaseValue)}` },
          { type: "mrkdwn", text: `*ROAS*\n${m.roas || "N/A"}x` },
          { type: "mrkdwn", text: `*CPA*\n${fmtMoney(m.cpa)}` },
          { type: "mrkdwn", text: `*Purchases*\n${m.purchases || 0}` },
          { type: "mrkdwn", text: `*CTR*\n${m.ctr || 0}%` },
          { type: "mrkdwn", text: `*Reach*\n${(m.reach || 0).toLocaleString()}` },
          { type: "mrkdwn", text: `*Frequency*\n${m.frequency || 0}x` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*vs Prev Month:* Spend ${pctEmoji(mComp.vsPreMonthSpendPct)} | ROAS ${pctEmoji(mComp.vsPreMonthROASPct)}\n*vs YTD Avg:* Spend ${pctEmoji(mComp.vsYtdAvgSpendPct)}`,
        },
      },
    ];

    // Campaign breakdown
    if (meta.campaigns?.length > 0) {
      const campLines = meta.campaigns.slice(0, 5).map(c =>
        `• *${c.name}*: ${fmtMoney(c.spend)} spend → ${fmtMoney(c.purchaseValue)} rev (${c.roas}x ROAS, ${c.purchases} purchases)`
      ).join("\n");
      metaBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Campaign Breakdown*\n${campLines}` },
      });
    }

    metaBlocks.push({ type: "divider" });
    await post(metaBlocks);
  }

  // ── 5. FINANCIALS (Xero) ─────────────────────────────────
  if (xero && !xero.error) {
    const xm = xero.month || {};
    const xy = xero.ytd || {};
    const xComp = xero.comparison || {};

    const finBlocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "🏦 Financial Summary (Xero)", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Revenue*\n${fmtMoney(xm.revenue)}` },
          { type: "mrkdwn", text: `*Gross Profit*\n${fmtMoney(xm.grossProfit)} (${xm.grossMarginPct || "?"}%)` },
          { type: "mrkdwn", text: `*Net Profit*\n${fmtMoney(xm.netProfit)} (${xm.netMarginPct || "?"}%)` },
          { type: "mrkdwn", text: `*Operating Expenses*\n${fmtMoney(xm.operatingExpenses)}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*vs YTD:* Revenue ${pctEmoji(xComp.vsYtdAvgRevPct)} | YTD Avg Monthly Net Profit: ${fmtMoney(xy.monthlyAvgNetProfit)} (${xy.netMarginPct || "?"}%)`,
        },
      },
    ];

    // Top expenses
    if (xm.topExpenses?.length > 0) {
      const expLines = xm.topExpenses.slice(0, 5).map(e => `• ${e.name}: ${fmtMoney(e.amount)}`).join("\n");
      finBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Top Expenses*\n${expLines}` },
      });
    }

    // Overdue invoices
    if (xero.receivables?.overdueCount > 0) {
      finBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Overdue Receivables:* ${xero.receivables.overdueCount} invoices totaling ${fmtMoney(xero.receivables.overdueAmount)}`,
        },
      });
    }

    finBlocks.push({ type: "divider" });
    await post(finBlocks);
  }

  // ── 6. SOCIAL MEDIA ──────────────────────────────────────
  if (social?.instagram) {
    const ig = social.instagram;
    const socialBlocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "📱 Instagram Performance", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Followers*\n${(ig.followers || 0).toLocaleString()}` },
          { type: "mrkdwn", text: `*Posts This Month*\n${ig.postsThisMonth || 0}` },
          { type: "mrkdwn", text: `*Total Engagement*\n${(ig.totalEngagement || 0).toLocaleString()}` },
          { type: "mrkdwn", text: `*Engagement Rate*\n${ig.engagementRate || 0}%` },
          { type: "mrkdwn", text: `*Avg Engagement/Post*\n${ig.avgEngagementPerPost || 0}` },
          { type: "mrkdwn", text: `*Likes / Comments*\n${ig.totalLikes || 0} / ${ig.totalComments || 0}` },
        ],
      },
    ];

    if (ig.mediaTypeBreakdown) {
      const types = Object.entries(ig.mediaTypeBreakdown).map(([t, c]) => `${t}: ${c}`).join(", ");
      socialBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Content Mix:* ${types}` },
      });
    }

    socialBlocks.push({ type: "divider" });
    await post(socialBlocks);
  }

  // ── 7. CHANNEL GRADES ────────────────────────────────────
  if (analysis.channelPerformance?.length > 0) {
    const gradeLines = analysis.channelPerformance.map(ch =>
      `${gradeEmoji(ch.grade)} *${ch.channel}* — Grade: *${ch.grade}*\n     ${ch.monthValue} | vs YTD: ${ch.vsYtdAvg}\n     _${ch.insight}_`
    ).join("\n\n");

    await post([
      { type: "header", text: { type: "plain_text", text: "📋 Channel Report Card", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: gradeLines } },
      { type: "divider" },
    ]);
  }

  // ── 8. WINS & CONCERNS ───────────────────────────────────
  const winsAndConcerns = [];

  if (analysis.wins?.length > 0) {
    const winLines = analysis.wins.map(w => `✅ *${w.title}* — ${w.detail}`).join("\n");
    winsAndConcerns.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🏆 Wins*\n${winLines}` },
    });
  }

  if (analysis.concerns?.length > 0) {
    const concernLines = analysis.concerns.map(c => {
      const urgencyEmoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" }[c.urgency] || "⚪";
      return `${urgencyEmoji} *${c.title}* (${c.urgency}) — ${c.detail}\n     💡 _${c.suggestedFix}_`;
    }).join("\n\n");
    winsAndConcerns.push({
      type: "section",
      text: { type: "mrkdwn", text: `*⚠️ Concerns*\n${concernLines}` },
    });
  }

  if (winsAndConcerns.length > 0) {
    await post([
      { type: "header", text: { type: "plain_text", text: "🎯 Wins & Concerns", emoji: true } },
      ...winsAndConcerns,
      { type: "divider" },
    ]);
  }

  // ── 9. STRATEGIC RECOMMENDATIONS ─────────────────────────
  if (analysis.strategicRecommendations?.length > 0) {
    const recLines = analysis.strategicRecommendations.map(r =>
      `*${r.priority}.* ${r.recommendation}\n     📊 _Expected impact:_ ${r.expectedImpact}\n     👤 ${r.owner} | ⏰ ${r.timeframe}`
    ).join("\n\n");

    await post([
      { type: "header", text: { type: "plain_text", text: "🚀 Strategic Recommendations", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: recLines } },
      { type: "divider" },
    ]);
  }

  // ── 10. OUTLOOK ──────────────────────────────────────────
  if (analysis.nextMonthOutlook) {
    await post([
      { type: "header", text: { type: "plain_text", text: "🔮 Next Month Outlook", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: analysis.nextMonthOutlook } },
      { type: "context", elements: [{ type: "mrkdwn", text: `_Report generated ${new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} | Powered by Noody Business Intelligence_` }] },
    ]);
  }

  console.log("[Monthly Slack] Report delivered successfully");
}

module.exports = { sendMonthlySlackReport };
