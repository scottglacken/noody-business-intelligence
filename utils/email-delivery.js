// utils/email-delivery.js
// Sends beautifully formatted HTML email with full report

const sgMail = require("@sendgrid/mail");

const SCORE_COLOR = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };
const SCORE_BG = { green: "#f0fdf4", yellow: "#fffbeb", red: "#fef2f2" };

function formatCurrency(amount, currency = "NZD") {
  if (amount === null || amount === undefined) return "N/A";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function scoreTag(score, label) {
  const color = SCORE_COLOR[score] || "#94a3b8";
  const bg = SCORE_BG[score] || "#f8fafc";
  return `<span style="background:${bg};color:${color};border:1px solid ${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${label}</span>`;
}

function buildEmailHTML(analysis, data, businessName, date) {
  const shopify = data.find(d => d.source === "shopify");
  const meta = data.find(d => d.source === "meta_ads");
  const googleAds = data.find(d => d.source === "google_ads");
  const ga4 = data.find(d => d.source === "ga4");
  const cs = data.find(d => d.source === "customer_service");
  const inventory = data.find(d => d.source === "unleashed");
  const xero = data.find(d => d.source === "xero");

  const overallColor = SCORE_COLOR[analysis.overallScore] || "#94a3b8";

  const actionItemsHTML = (analysis.actionItems || []).map((item, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
        <span style="background:#3b82f6;color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${item.priority}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${item.action}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:12px;">${item.owner}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:11px;color:#64748b;">${item.timeframe}</span>
      </td>
    </tr>
  `).join("");

  const deptScoresHTML = Object.entries(analysis.departmentScores || {}).map(([dept, info]) => `
    <td style="padding:12px;text-align:center;border-right:1px solid #f1f5f9;">
      <div style="font-size:20px;">${info.score === "green" ? "🟢" : info.score === "yellow" ? "🟡" : "🔴"}</div>
      <div style="font-size:12px;font-weight:600;margin:4px 0;text-transform:capitalize;">${dept}</div>
      <div style="font-size:11px;color:#64748b;">${info.note}</div>
    </td>
  `).join("");

  const winsHTML = (analysis.wins || []).map(w => `
    <div style="padding:8px 0;border-bottom:1px solid #f0fdf4;">
      ✅ <strong>${w.metric}:</strong> ${w.value} — <span style="color:#16a34a;">${w.context}</span>
    </div>
  `).join("");

  const concernsHTML = (analysis.concerns || []).map(c => `
    <div style="padding:8px 0;border-bottom:1px solid #fef2f2;">
      ${c.urgency === "high" ? "🚨" : "⚠️"} <strong>${c.metric}:</strong> ${c.value} — <span style="color:#dc2626;">${c.context}</span>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:700px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px;color:white;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;margin-bottom:8px;">Daily Business Intelligence</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;">${businessName}</h1>
      <div style="margin-top:8px;font-size:14px;opacity:0.8;">${date}</div>
      <div style="margin-top:16px;background:${overallColor};display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;">
        ${analysis.headline}
      </div>
    </div>

    <!-- Summary -->
    <div style="padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <p style="margin:0;color:#374151;line-height:1.6;">${analysis.summary}</p>
    </div>

    <!-- Department Scorecard -->
    <div style="padding:24px 32px;">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 16px;">Department Scorecard</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;">
        <tr style="background:#f8fafc;">${deptScoresHTML}</tr>
      </table>
    </div>

    <!-- Revenue Block -->
    ${shopify && !shopify.error ? `
    <div style="padding:0 32px 24px;">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 16px;">💰 Revenue & Orders</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#f0fdf4;padding:16px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#16a34a;">${formatCurrency(shopify.daily?.revenue)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Yesterday Revenue</div>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#1e293b;">${shopify.daily?.orders || 0}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Orders</div>
        </div>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#1e293b;">${formatCurrency(shopify.daily?.aov)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Avg Order Value</div>
        </div>
      </div>
      <div style="margin-top:12px;padding:12px 16px;background:#eff6ff;border-radius:8px;font-size:13px;">
        📊 MTD Revenue: <strong>${formatCurrency(shopify.mtd?.revenue)}</strong> from <strong>${shopify.mtd?.orders}</strong> orders | ${shopify.mtd?.daysElapsed} days elapsed
      </div>
    </div>
    ` : ""}

    <!-- Meta Ads Block -->
    ${meta && !meta.error ? `
    <div style="padding:0 32px 24px;">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 16px;">📣 Meta Ads</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f8fafc;">
          <td style="padding:12px;text-align:center;border:1px solid #e2e8f0;border-radius:4px;">
            <div style="font-weight:700;font-size:18px;">${formatCurrency(meta.daily?.spend)}</div>
            <div style="font-size:11px;color:#64748b;">Spend</div>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid ${meta.daily?.roas >= 3 ? "#22c55e" : "#ef4444"};">
            <div style="font-weight:700;font-size:18px;color:${meta.daily?.roas >= 3 ? "#16a34a" : "#dc2626"};">${meta.daily?.roas}x</div>
            <div style="font-size:11px;color:#64748b;">ROAS</div>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid ${meta.daily?.ctr >= 1.0 ? "#22c55e" : "#ef4444"};">
            <div style="font-weight:700;font-size:18px;color:${meta.daily?.ctr >= 1.0 ? "#16a34a" : "#dc2626"};">${meta.daily?.ctr}%</div>
            <div style="font-size:11px;color:#64748b;">CTR</div>
          </td>
          <td style="padding:12px;text-align:center;border:1px solid #e2e8f0;">
            <div style="font-weight:700;font-size:18px;">${meta.daily?.purchases || 0}</div>
            <div style="font-size:11px;color:#64748b;">Purchases</div>
          </td>
        </tr>
      </table>
    </div>
    ` : ""}

    <!-- Wins & Concerns -->
    <div style="padding:0 32px 24px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${winsHTML ? `
      <div>
        <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 12px;">🏆 Wins</h2>
        <div style="font-size:13px;line-height:1.6;">${winsHTML}</div>
      </div>
      ` : ""}
      ${concernsHTML ? `
      <div>
        <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 12px;">⚠️ Needs Attention</h2>
        <div style="font-size:13px;line-height:1.6;">${concernsHTML}</div>
      </div>
      ` : ""}
    </div>

    <!-- Action Items -->
    <div style="padding:0 32px 24px;">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 16px;">🎯 Today's Action Items</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">
          <td style="padding:8px 12px;">#</td>
          <td style="padding:8px 12px;">Action</td>
          <td style="padding:8px 12px;">Owner</td>
          <td style="padding:8px 12px;">When</td>
        </tr>
        ${actionItemsHTML}
      </table>
    </div>

    <!-- Trend Alert -->
    ${analysis.trendAlert ? `
    <div style="margin:0 32px 24px;padding:16px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
      <strong>📈 Trend Alert:</strong> ${analysis.trendAlert}
    </div>
    ` : ""}

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      Business Intelligence System • Generated ${new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })} NZT
    </div>
  </div>
</body>
</html>`;
}

async function sendEmailReport(emailConfig, analysis, data, businessName, date) {
  sgMail.setApiKey(emailConfig.apiKey);

  const html = buildEmailHTML(analysis, data, businessName, date);
  const scoreLabel = { green: "✅", yellow: "⚠️", red: "🚨" };
  const subject = `${scoreLabel[analysis.overallScore] || "📊"} ${businessName} Daily Report — ${date}`;

  try {
    await sgMail.send({
      to: emailConfig.recipients,
      from: emailConfig.fromAddress,
      subject,
      html,
      text: `${businessName} Daily Report\n${date}\n\n${analysis.headline}\n\n${analysis.summary}\n\nAction Items:\n${(analysis.actionItems || []).map(a => `${a.priority}. ${a.action} (${a.owner})`).join("\n")}`,
    });
    console.log(`[Email] Sent report for ${businessName}`);
  } catch (err) {
    console.error(`[Email] Error:`, err.response?.body || err.message);
    throw err;
  }
}

module.exports = { sendEmailReport };
