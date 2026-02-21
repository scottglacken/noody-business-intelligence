// utils/finance-report.js — Xero financial report → #noody-finance
const axios = require("axios");
function fmt$(v) { return v != null ? `$${Number(v).toLocaleString("en-NZ",{minimumFractionDigits:0,maximumFractionDigits:0})}` : "N/A"; }

async function sendFinanceReport(botToken, channelId, xero, businessName, date) {
  const mtd = xero.mtd || {}, recv = xero.receivables || {};
  const marginEmoji = (mtd.profitMargin||0) >= 30 ? "🟢" : (mtd.profitMargin||0) >= 20 ? "🟡" : "🔴";
  const overdueEmoji = (recv.overdueCount||0) > 5 ? "🔴" : (recv.overdueCount||0) > 0 ? "🟡" : "🟢";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: `💰 ${businessName} Finance Report` } },
    { type: "section", text: { type: "mrkdwn", text: `*${date}* | Cash Flow & P&L Overview` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: "*📊 Month to Date P&L*" }, fields: [
      { type: "mrkdwn", text: `*Revenue*\n${fmt$(mtd.revenue)}` },
      { type: "mrkdwn", text: `*Expenses*\n${fmt$(mtd.expenses)}` },
      { type: "mrkdwn", text: `*Net Profit*\n${fmt$(mtd.netProfit)}` },
      { type: "mrkdwn", text: `${marginEmoji} *Margin*\n${mtd.profitMargin != null ? mtd.profitMargin+"%" : "N/A"}` },
    ]},
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*📋 Accounts Receivable*\n${overdueEmoji} *${recv.overdueCount||0} overdue invoices* totalling *${fmt$(recv.overdueAmount)}*` } },
  ];

  if (recv.overdueInvoices?.length > 0) {
    recv.overdueInvoices.forEach(inv => {
      const u = inv.daysOverdue > 30 ? "🔴" : inv.daysOverdue > 14 ? "🟡" : "⚪";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `${u} *${inv.contact}* — ${fmt$(inv.amount)} (${inv.daysOverdue}d overdue)` } });
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `💰 Finance Report • ${new Date().toLocaleString("en-NZ",{timeZone:"Pacific/Auckland"})}` }] });

  await axios.post("https://slack.com/api/chat.postMessage", { channel: channelId, blocks, text: `${businessName} Finance Report — ${date}` }, { headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" } });
  console.log(`[Finance Report] Sent to ${channelId}`);
}

module.exports = { sendFinanceReport };
