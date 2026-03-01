// monthly-report.js — Monthly Business Performance Report
// Runs on the 1st of each month (or manually) to review prior month vs YTD
// Reuses existing API credentials from config.js
// Usage:
//   node monthly-report.js --business noody
//   node monthly-report.js --business noody --month 2026-02  (specific month)

require("dotenv").config();
const config = require("./config.js");
const axios = require("axios");
const { analyzeMonthlyData } = require("./utils/monthly-analyzer");
const { sendMonthlySlackReport } = require("./utils/monthly-slack-report");

// ─────────────────────────────────────────────────────────────
// DATE HELPERS (NZ timezone)
// ─────────────────────────────────────────────────────────────
function getNZDates(targetMonth) {
  const nzTimeString = new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" });
  const nowNZ = new Date(nzTimeString);

  let reportYear, reportMonthIdx;
  if (targetMonth) {
    // e.g. "2026-02"
    const [y, m] = targetMonth.split("-").map(Number);
    reportYear = y;
    reportMonthIdx = m - 1;
  } else {
    // Default: last completed month
    const lastMonth = new Date(nowNZ.getFullYear(), nowNZ.getMonth() - 1, 1);
    reportYear = lastMonth.getFullYear();
    reportMonthIdx = lastMonth.getMonth();
  }

  const monthStart = new Date(reportYear, reportMonthIdx, 1);
  const monthEnd = new Date(reportYear, reportMonthIdx + 1, 0, 23, 59, 59, 999);
  const daysInMonth = monthEnd.getDate();
  const yearStart = new Date(reportYear, 0, 1);
  const ytdEnd = monthEnd; // YTD through end of report month

  // For YTD daily average: days from Jan 1 to end of report month
  const msInDay = 86400000;
  const ytdDays = Math.ceil((monthEnd.getTime() - yearStart.getTime()) / msInDay) + 1;

  // Prior month for comparison
  const prevMonthStart = new Date(reportYear, reportMonthIdx - 1, 1);
  const prevMonthEnd = new Date(reportYear, reportMonthIdx, 0, 23, 59, 59, 999);

  // Same month last year
  const smlyStart = new Date(reportYear - 1, reportMonthIdx, 1);
  const smlyEnd = new Date(reportYear - 1, reportMonthIdx + 1, 0, 23, 59, 59, 999);

  const monthName = monthStart.toLocaleDateString("en-NZ", { month: "long", year: "numeric" });

  return { monthStart, monthEnd, daysInMonth, yearStart, ytdEnd, ytdDays, prevMonthStart, prevMonthEnd, smlyStart, smlyEnd, monthName, reportYear, reportMonthIdx };
}

const fmt = (d) => d.toISOString();
const fmtDate = (d) => d.toISOString().split("T")[0];

// ─────────────────────────────────────────────────────────────
// SHOPIFY — Full month + YTD with pagination
// ─────────────────────────────────────────────────────────────
async function getShopifyMonthly(storeName, clientIdOrToken, clientSecret, businessName, dates) {
  let accessToken;
  if (clientSecret) {
    const res = await axios.post(
      `https://${storeName}.myshopify.com/admin/oauth/access_token`,
      `client_id=${encodeURIComponent(clientIdOrToken)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    accessToken = res.data.access_token;
  } else {
    accessToken = clientIdOrToken;
  }

  const base = `https://${storeName}.myshopify.com/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": accessToken };
  const validStatuses = ["paid", "partially_paid", "pending", "authorized", "partially_refunded"];

  // Paginate all orders in a date range
  async function fetchAllOrders(startDate, endDate, fields) {
    let allOrders = [];
    let url = `${base}/orders.json`;
    let params = {
      status: "any",
      created_at_min: fmt(startDate),
      created_at_max: fmt(endDate),
      limit: 250,
      ...(fields && { fields }),
    };

    while (true) {
      const res = await axios.get(url, { headers, params });
      const orders = res.data.orders || [];
      allOrders = allOrders.concat(orders);

      // Check for pagination
      const linkHeader = res.headers["link"];
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          url = nextMatch[1];
          params = {}; // URL already has params
          continue;
        }
      }
      break;
    }
    return allOrders.filter(o => validStatuses.includes(o.financial_status));
  }

  console.log(`[Shopify Monthly/${businessName}] Fetching ${dates.monthName}...`);

  const orderFields = "id,total_price,subtotal_price,total_discounts,total_tax,financial_status,line_items,customer,source_name,created_at,tags,discount_codes,refunds";
  const summaryFields = "id,total_price,financial_status,customer,created_at,source_name";

  const [monthOrders, prevMonthOrders, ytdOrders] = await Promise.all([
    fetchAllOrders(dates.monthStart, dates.monthEnd, orderFields),
    fetchAllOrders(dates.prevMonthStart, dates.prevMonthEnd, summaryFields),
    fetchAllOrders(dates.yearStart, dates.monthEnd, summaryFields),
  ]);

  console.log(`[Shopify Monthly/${businessName}] Report month: ${monthOrders.length} orders | Prev month: ${prevMonthOrders.length} | YTD: ${ytdOrders.length}`);

  const calcRev = (orders) => orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
  const calcGross = (orders) => orders.reduce((s, o) => s + parseFloat(o.subtotal_price || 0), 0);
  const calcAOV = (orders) => orders.length > 0 ? calcRev(orders) / orders.length : 0;

  // Customer analysis for report month
  const emailCounts = {};
  monthOrders.forEach(o => {
    const email = o.customer?.email || "";
    if (email) emailCounts[email] = (emailCounts[email] || 0) + 1;
  });
  const uniqueCustomers = Object.keys(emailCounts).length;
  const repeatCustomers = Object.values(emailCounts).filter(c => c > 1).length;

  // Product breakdown
  const productSales = {};
  monthOrders.forEach(o => {
    (o.line_items || []).forEach(item => {
      const k = item.title;
      if (!productSales[k]) productSales[k] = { qty: 0, revenue: 0, orders: 0 };
      productSales[k].qty += item.quantity;
      productSales[k].revenue += parseFloat(item.price) * item.quantity;
      productSales[k].orders++;
    });
  });
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([name, d]) => ({ name, qty: d.qty, revenue: Math.round(d.revenue * 100) / 100, orders: d.orders }));

  // Source breakdown
  const sourceBreakdown = {};
  monthOrders.forEach(o => {
    const s = o.source_name || "unknown";
    if (!sourceBreakdown[s]) sourceBreakdown[s] = { orders: 0, revenue: 0 };
    sourceBreakdown[s].orders++;
    sourceBreakdown[s].revenue += parseFloat(o.total_price || 0);
  });

  // Weekly breakdown within the month
  const weeklyBreakdown = [];
  let weekStart = new Date(dates.monthStart);
  while (weekStart <= dates.monthEnd) {
    const weekEnd = new Date(Math.min(
      new Date(weekStart.getTime() + 6 * 86400000).getTime(),
      dates.monthEnd.getTime()
    ));
    const weekOrders = monthOrders.filter(o => {
      const d = new Date(o.created_at);
      return d >= weekStart && d <= new Date(weekEnd.getTime() + 86400000);
    });
    weeklyBreakdown.push({
      week: `${weekStart.getDate()}-${weekEnd.getDate()}`,
      orders: weekOrders.length,
      revenue: Math.round(calcRev(weekOrders) * 100) / 100,
      aov: Math.round(calcAOV(weekOrders) * 100) / 100,
    });
    weekStart = new Date(weekEnd.getTime() + 86400000);
  }

  // Discounts analysis
  const totalDiscounts = monthOrders.reduce((s, o) => s + parseFloat(o.total_discounts || 0), 0);
  const discountedOrders = monthOrders.filter(o => parseFloat(o.total_discounts || 0) > 0).length;

  const monthRevenue = calcRev(monthOrders);
  const prevMonthRevenue = calcRev(prevMonthOrders);
  const ytdRevenue = calcRev(ytdOrders);
  const ytdDailyAvg = ytdRevenue / dates.ytdDays;
  const ytdMonthlyAvg = ytdDailyAvg * 30.44; // avg days per month

  return {
    source: "shopify",
    period: dates.monthName,
    month: {
      orders: monthOrders.length,
      revenue: Math.round(monthRevenue * 100) / 100,
      grossSales: Math.round(calcGross(monthOrders) * 100) / 100,
      aov: Math.round(calcAOV(monthOrders) * 100) / 100,
      dailyAvgRevenue: Math.round((monthRevenue / dates.daysInMonth) * 100) / 100,
      dailyAvgOrders: Math.round((monthOrders.length / dates.daysInMonth) * 10) / 10,
      uniqueCustomers,
      repeatCustomers,
      repeatRate: uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      discountedOrderPct: monthOrders.length > 0 ? Math.round((discountedOrders / monthOrders.length) * 100) : 0,
      topProducts,
      sourceBreakdown: Object.entries(sourceBreakdown).map(([name, d]) => ({
        name, orders: d.orders, revenue: Math.round(d.revenue * 100) / 100,
      })).sort((a, b) => b.revenue - a.revenue),
      weeklyBreakdown,
    },
    prevMonth: {
      orders: prevMonthOrders.length,
      revenue: Math.round(prevMonthRevenue * 100) / 100,
      aov: Math.round(calcAOV(prevMonthOrders) * 100) / 100,
      dailyAvgRevenue: Math.round((prevMonthRevenue / dates.prevMonthEnd.getDate()) * 100) / 100,
    },
    ytd: {
      orders: ytdOrders.length,
      revenue: Math.round(ytdRevenue * 100) / 100,
      aov: Math.round(calcAOV(ytdOrders) * 100) / 100,
      dailyAvgRevenue: Math.round(ytdDailyAvg * 100) / 100,
      monthlyAvgRevenue: Math.round(ytdMonthlyAvg * 100) / 100,
      months: dates.reportMonthIdx + 1,
    },
    comparison: {
      vsPreMonthRevPct: prevMonthRevenue > 0 ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : null,
      vsPreMonthOrdersPct: prevMonthOrders.length > 0 ? Math.round(((monthOrders.length - prevMonthOrders.length) / prevMonthOrders.length) * 100) : null,
      vsYtdAvgRevPct: ytdMonthlyAvg > 0 ? Math.round(((monthRevenue - ytdMonthlyAvg) / ytdMonthlyAvg) * 100) : null,
      vsYtdAvgAOVPct: calcAOV(ytdOrders) > 0 ? Math.round(((calcAOV(monthOrders) - calcAOV(ytdOrders)) / calcAOV(ytdOrders)) * 100) : null,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// META ADS — Full month + YTD
// ─────────────────────────────────────────────────────────────
async function getMetaMonthly(accessToken, adAccountId, businessName, dates) {
  const base = "https://graph.facebook.com/v21.0";
  const allFields = "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,cost_per_action_type";

  const parseActions = (actions = [], type) => parseFloat((actions.find(a => a.action_type === type) || {}).value || 0);
  const parseActionValue = (avs = [], type) => parseFloat((avs.find(a => a.action_type === type) || {}).value || 0);

  const parseData = (raw) => {
    const spend = parseFloat(raw.spend || 0);
    const purchases = parseActions(raw.actions || [], "purchase");
    const purchaseValue = parseActionValue(raw.action_values || [], "purchase");
    const addToCart = parseActions(raw.actions || [], "add_to_cart");
    const initiateCheckout = parseActions(raw.actions || [], "initiate_checkout");
    const linkClicks = parseActions(raw.actions || [], "link_click");
    return {
      spend: Math.round(spend * 100) / 100,
      impressions: parseInt(raw.impressions || 0),
      clicks: parseInt(raw.clicks || 0),
      ctr: Math.round(parseFloat(raw.ctr || 0) * 100) / 100,
      cpc: Math.round(parseFloat(raw.cpc || 0) * 100) / 100,
      cpm: Math.round(parseFloat(raw.cpm || 0) * 100) / 100,
      reach: parseInt(raw.reach || 0),
      frequency: Math.round(parseFloat(raw.frequency || 0) * 100) / 100,
      purchases,
      purchaseValue: Math.round(purchaseValue * 100) / 100,
      roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
      cpa: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
      addToCart,
      initiateCheckout,
      linkClicks,
    };
  };

  console.log(`[Meta Monthly/${businessName}] Fetching ${dates.monthName}...`);

  try {
    const makeParams = (since, until, level, extra = "") => ({
      access_token: accessToken,
      fields: allFields + (extra ? "," + extra : ""),
      time_range: JSON.stringify({ since: fmtDate(since), until: fmtDate(until) }),
      level,
      action_attribution_windows: "['7d_click','1d_view']",
      limit: 50,
    });

    const [monthAcct, ytdAcct, prevMonthAcct, monthCampaigns] = await Promise.all([
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(dates.monthStart, dates.monthEnd, "account") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(dates.yearStart, dates.monthEnd, "account") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(dates.prevMonthStart, dates.prevMonthEnd, "account") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(dates.monthStart, dates.monthEnd, "campaign", "campaign_name,campaign_id") }),
    ]);

    const month = parseData(monthAcct.data.data?.[0] || {});
    const ytd = parseData(ytdAcct.data.data?.[0] || {});
    const prevMonth = parseData(prevMonthAcct.data.data?.[0] || {});

    const campaigns = (monthCampaigns.data.data || []).map(c => {
      const s = parseFloat(c.spend || 0);
      const p = parseActions(c.actions || [], "purchase");
      const pv = parseActionValue(c.action_values || [], "purchase");
      return {
        name: c.campaign_name,
        spend: Math.round(s * 100) / 100,
        purchases: p,
        purchaseValue: Math.round(pv * 100) / 100,
        roas: s > 0 ? Math.round((pv / s) * 100) / 100 : 0,
        cpa: p > 0 ? Math.round((s / p) * 100) / 100 : 0,
        ctr: Math.round(parseFloat(c.ctr || 0) * 100) / 100,
        reach: parseInt(c.reach || 0),
      };
    }).sort((a, b) => b.spend - a.spend);

    const ytdMonths = dates.reportMonthIdx + 1;
    const ytdMonthlyAvgSpend = ytd.spend / ytdMonths;

    return {
      source: "meta_ads",
      period: dates.monthName,
      month,
      prevMonth,
      ytd,
      ytdMonthlyAvg: {
        spend: Math.round(ytdMonthlyAvgSpend * 100) / 100,
        roas: ytd.roas,
        cpa: ytd.cpa,
        ctr: ytd.ctr,
      },
      campaigns,
      comparison: {
        vsPreMonthSpendPct: prevMonth.spend > 0 ? Math.round(((month.spend - prevMonth.spend) / prevMonth.spend) * 100) : null,
        vsPreMonthROASPct: prevMonth.roas > 0 ? Math.round(((month.roas - prevMonth.roas) / prevMonth.roas) * 100) : null,
        vsYtdAvgSpendPct: ytdMonthlyAvgSpend > 0 ? Math.round(((month.spend - ytdMonthlyAvgSpend) / ytdMonthlyAvgSpend) * 100) : null,
      },
    };
  } catch (err) {
    console.error(`[Meta Monthly/${businessName}] Error:`, err.response?.data || err.message);
    return { source: "meta_ads", error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// KLAVIYO — Monthly email performance
// ─────────────────────────────────────────────────────────────
async function getKlaviyoMonthly(apiKey, dates) {
  const headers = { Authorization: `Klaviyo-API-Key ${apiKey}`, revision: "2024-02-15", Accept: "application/json" };
  const base = "https://a.klaviyo.com/api";

  console.log(`[Klaviyo Monthly] Fetching ${dates.monthName}...`);

  try {
    // Get campaigns sent during the report month
    const campaignsRes = await axios.get(`${base}/campaigns`, {
      headers,
      params: { "filter": `equals(messages.channel,'email'),greater-or-equal(send_time,${fmtDate(dates.monthStart)}T00:00:00Z),less-or-equal(send_time,${fmtDate(dates.monthEnd)}T23:59:59Z)` },
    });

    const campaigns = campaignsRes.data?.data || [];

    // Get list/subscriber counts
    const listsRes = await axios.get(`${base}/lists`, { headers });
    const lists = listsRes.data?.data || [];

    // Get flow summary — count active flows
    const flowsRes = await axios.get(`${base}/flows`, { headers, params: { "filter": "equals(status,'live')" } });
    const activeFlows = flowsRes.data?.data?.length || 0;

    return {
      source: "klaviyo",
      period: dates.monthName,
      month: {
        campaignsSent: campaigns.length,
        campaignNames: campaigns.slice(0, 10).map(c => c.attributes?.name || "Unknown"),
        activeFlows,
      },
      lists: lists.slice(0, 5).map(l => ({
        name: l.attributes?.name,
        created: l.attributes?.created,
      })),
    };
  } catch (err) {
    console.error(`[Klaviyo Monthly] Error:`, err.response?.data || err.message);
    return { source: "klaviyo", error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// XERO — Monthly P&L + YTD
// ─────────────────────────────────────────────────────────────
async function getXeroMonthly(clientId, clientSecret, refreshToken, tenantId, businessName, dates) {
  console.log(`[Xero Monthly/${businessName}] Fetching ${dates.monthName}...`);

  try {
    const tokenRes = await axios.post("https://identity.xero.com/connect/token",
      new URLSearchParams({
        grant_type: "refresh_token", refresh_token: refreshToken,
        client_id: clientId, client_secret: clientSecret,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const accessToken = tokenRes.data.access_token;
    const xHeaders = { Authorization: `Bearer ${accessToken}`, "xero-tenant-id": tenantId, Accept: "application/json" };
    const base = "https://api.xero.com/api.xro/2.0";

    const fmtX = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const [monthPL, ytdPL, prevMonthPL, overdueRes] = await Promise.all([
      axios.get(`${base}/Reports/ProfitAndLoss`, { headers: xHeaders, params: { fromDate: fmtX(dates.monthStart), toDate: fmtX(dates.monthEnd) } }),
      axios.get(`${base}/Reports/ProfitAndLoss`, { headers: xHeaders, params: { fromDate: fmtX(dates.yearStart), toDate: fmtX(dates.monthEnd) } }),
      axios.get(`${base}/Reports/ProfitAndLoss`, { headers: xHeaders, params: { fromDate: fmtX(dates.prevMonthStart), toDate: fmtX(dates.prevMonthEnd) } }),
      axios.get(`${base}/Invoices`, { headers: xHeaders, params: { where: 'Status=="AUTHORISED"', order: "DueDate ASC" } }),
    ]);

    const extractPL = (report) => {
      const r = report.data?.Reports?.[0];
      const findRow = (title) => {
        for (const section of r?.Rows || []) {
          for (const row of section.Rows || []) {
            if (row.Cells?.[0]?.Value === title) return parseFloat(row.Cells?.[1]?.Value?.replace(/[^0-9.-]/g, "") || 0);
          }
          // Check section header rows
          if (section.Title === title && section.Rows?.length > 0) {
            const lastRow = section.Rows[section.Rows.length - 1];
            if (lastRow.RowType === "SummaryRow") return parseFloat(lastRow.Cells?.[1]?.Value?.replace(/[^0-9.-]/g, "") || 0);
          }
        }
        return null;
      };

      // Extract expense line items
      const expenses = [];
      for (const section of r?.Rows || []) {
        if (section.Title === "Less Operating Expenses" || section.Title === "Operating Expenses") {
          for (const row of section.Rows || []) {
            if (row.RowType === "Row" && row.Cells?.[0]?.Value && row.Cells?.[1]?.Value) {
              const val = parseFloat(row.Cells[1].Value.replace(/[^0-9.-]/g, "") || 0);
              if (val > 0) expenses.push({ name: row.Cells[0].Value, amount: Math.round(val * 100) / 100 });
            }
          }
        }
      }

      return {
        revenue: findRow("Total Income"),
        cogs: findRow("Total Cost of Sales") || findRow("Less Cost of Sales"),
        grossProfit: findRow("Gross Profit"),
        operatingExpenses: findRow("Total Operating Expenses"),
        netProfit: findRow("Net Profit"),
        topExpenses: expenses.sort((a, b) => b.amount - a.amount).slice(0, 10),
      };
    };

    const month = extractPL(monthPL);
    const ytd = extractPL(ytdPL);
    const prevMonth = extractPL(prevMonthPL);

    const ytdMonths = dates.reportMonthIdx + 1;

    // Overdue invoices
    const allInvoices = overdueRes.data.Invoices || [];
    const today = new Date();
    const overdueInvoices = allInvoices.filter(inv => new Date(inv.DueDateString) < today && inv.AmountDue > 0);
    const totalOverdue = overdueInvoices.reduce((s, i) => s + (i.AmountDue || 0), 0);

    return {
      source: "xero",
      period: dates.monthName,
      month: {
        ...month,
        grossMarginPct: month.revenue > 0 ? Math.round((month.grossProfit / month.revenue) * 100) : null,
        netMarginPct: month.revenue > 0 ? Math.round((month.netProfit / month.revenue) * 100) : null,
      },
      prevMonth: {
        ...prevMonth,
        grossMarginPct: prevMonth.revenue > 0 ? Math.round((prevMonth.grossProfit / prevMonth.revenue) * 100) : null,
        netMarginPct: prevMonth.revenue > 0 ? Math.round((prevMonth.netProfit / prevMonth.revenue) * 100) : null,
      },
      ytd: {
        ...ytd,
        months: ytdMonths,
        monthlyAvgRevenue: ytd.revenue > 0 ? Math.round((ytd.revenue / ytdMonths) * 100) / 100 : null,
        monthlyAvgNetProfit: ytd.netProfit != null ? Math.round((ytd.netProfit / ytdMonths) * 100) / 100 : null,
        grossMarginPct: ytd.revenue > 0 ? Math.round((ytd.grossProfit / ytd.revenue) * 100) : null,
        netMarginPct: ytd.revenue > 0 ? Math.round((ytd.netProfit / ytd.revenue) * 100) : null,
      },
      receivables: {
        overdueCount: overdueInvoices.length,
        overdueAmount: Math.round(totalOverdue * 100) / 100,
        topOverdue: overdueInvoices.slice(0, 5).map(i => ({
          contact: i.Contact?.Name,
          amount: i.AmountDue,
          dueDate: i.DueDateString,
          daysOverdue: Math.floor((today - new Date(i.DueDateString)) / 86400000),
        })),
      },
      comparison: {
        vsPreMonthRevPct: prevMonth.revenue > 0 ? Math.round(((month.revenue - prevMonth.revenue) / prevMonth.revenue) * 100) : null,
        vsPreMonthNetProfitPct: prevMonth.netProfit > 0 ? Math.round(((month.netProfit - prevMonth.netProfit) / prevMonth.netProfit) * 100) : null,
        vsYtdAvgRevPct: ytd.revenue > 0 ? Math.round(((month.revenue - (ytd.revenue / ytdMonths)) / (ytd.revenue / ytdMonths)) * 100) : null,
      },
    };
  } catch (err) {
    console.error(`[Xero Monthly/${businessName}] Error:`, err.response?.data || err.message);
    return { source: "xero", error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// SOCIAL — Monthly Instagram/Facebook summary
// ─────────────────────────────────────────────────────────────
async function getSocialMonthly(socialConfig, businessName, dates) {
  console.log(`[Social Monthly/${businessName}] Fetching ${dates.monthName}...`);

  try {
    const result = { source: "social", period: dates.monthName };

    if (socialConfig.instagram) {
      const { accountId, accessToken } = socialConfig.instagram;
      const base = "https://graph.facebook.com/v21.0";

      // Get profile info
      const profileRes = await axios.get(`${base}/${accountId}`, {
        params: { fields: "followers_count,media_count,username", access_token: accessToken },
      });

      // Get recent media for engagement
      const mediaRes = await axios.get(`${base}/${accountId}/media`, {
        params: {
          fields: "id,timestamp,like_count,comments_count,media_type,caption",
          access_token: accessToken,
          limit: 50,
        },
      });

      const allMedia = mediaRes.data?.data || [];
      const monthMedia = allMedia.filter(m => {
        const d = new Date(m.timestamp);
        return d >= dates.monthStart && d <= dates.monthEnd;
      });

      const totalLikes = monthMedia.reduce((s, m) => s + (m.like_count || 0), 0);
      const totalComments = monthMedia.reduce((s, m) => s + (m.comments_count || 0), 0);
      const totalEngagement = totalLikes + totalComments;

      // Media type breakdown
      const mediaTypes = {};
      monthMedia.forEach(m => {
        const t = m.media_type || "unknown";
        mediaTypes[t] = (mediaTypes[t] || 0) + 1;
      });

      result.instagram = {
        followers: profileRes.data.followers_count,
        postsThisMonth: monthMedia.length,
        totalLikes,
        totalComments,
        totalEngagement,
        avgEngagementPerPost: monthMedia.length > 0 ? Math.round(totalEngagement / monthMedia.length) : 0,
        engagementRate: profileRes.data.followers_count > 0 && monthMedia.length > 0
          ? Math.round((totalEngagement / monthMedia.length / profileRes.data.followers_count) * 10000) / 100
          : 0,
        mediaTypeBreakdown: mediaTypes,
      };
    }

    return result;
  } catch (err) {
    console.error(`[Social Monthly/${businessName}] Error:`, err.response?.data || err.message);
    return { source: "social", error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ─────────────────────────────────────────────────────────────
async function runMonthlyReport(businessKey, targetMonth) {
  const businessName = config.businesses[businessKey]?.name || businessKey;
  const dates = getNZDates(targetMonth);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 MONTHLY BUSINESS REVIEW — ${dates.monthName}`);
  console.log(`   Business: ${businessName}`);
  console.log(`   Period: ${fmtDate(dates.monthStart)} to ${fmtDate(dates.monthEnd)}`);
  console.log(`   YTD: ${fmtDate(dates.yearStart)} to ${fmtDate(dates.monthEnd)} (${dates.ytdDays} days)`);
  console.log(`${"=".repeat(60)}\n`);

  const collectors = [];

  // Shopify
  const sc = config.shopify[businessKey];
  if (sc?.storeName) {
    const id = sc.clientId || sc.accessToken;
    const secret = sc.clientId ? sc.clientSecret : null;
    collectors.push(getShopifyMonthly(sc.storeName, id, secret, businessName, dates).catch(err => ({ source: "shopify", error: err.message })));
  }

  // Meta Ads
  if (config.meta?.accessToken && config.meta[`${businessKey}AdAccountId`]) {
    collectors.push(getMetaMonthly(config.meta.accessToken, config.meta[`${businessKey}AdAccountId`], businessName, dates).catch(err => ({ source: "meta_ads", error: err.message })));
  }

  // Klaviyo (Noody only)
  if (businessKey === "noody" && config.klaviyo?.apiKey) {
    collectors.push(getKlaviyoMonthly(config.klaviyo.apiKey, dates).catch(err => ({ source: "klaviyo", error: err.message })));
  }

  // Xero
  if (config.xero?.clientId && config.xero[`${businessKey}TenantId`]) {
    collectors.push(getXeroMonthly(config.xero.clientId, config.xero.clientSecret, config.xero.refreshToken, config.xero[`${businessKey}TenantId`], businessName, dates).catch(err => ({ source: "xero", error: err.message })));
  }

  // Social
  if (businessKey === "noody") {
    const socialCfg = {};
    if (config.social?.instagram?.noodyAccountId) {
      socialCfg.instagram = { accountId: config.social.instagram.noodyAccountId, accessToken: config.social.instagram.accessToken };
    }
    if (Object.keys(socialCfg).length > 0) {
      collectors.push(getSocialMonthly(socialCfg, businessName, dates).catch(err => ({ source: "social", error: err.message })));
    }
  }

  const results = await Promise.allSettled(collectors);
  const data = results.map(r => r.status === "fulfilled" ? r.value : { error: r.reason?.message });

  const successful = data.filter(d => !d.error).length;
  const failed = data.filter(d => d.error).length;
  console.log(`\n[Monthly] Collected ${successful} sources, ${failed} failed`);
  data.filter(d => d.error).forEach(d => console.warn(`  ⚠️  ${d.source || "unknown"}: ${d.error}`));

  // AI Analysis
  console.log(`[Monthly] Running AI analysis...`);
  const analysis = await analyzeMonthlyData(data, config, businessName, dates);

  // Deliver to Slack
  const slackToken = config.slack?.botToken;
  const channel = config.slack?.channels?.[`${businessKey}Daily`] || config.slack?.channels?.combined;

  if (slackToken && channel) {
    await sendMonthlySlackReport(slackToken, channel, analysis, data, businessName, dates);
    console.log(`✅ Monthly report delivered to Slack`);
  }

  console.log(`\n✅ [${businessName}] Monthly report complete for ${dates.monthName}\n`);
  return { analysis, data };
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const businessKey = args.includes("--business") ? args[args.indexOf("--business") + 1] : "noody";
const targetMonth = args.includes("--month") ? args[args.indexOf("--month") + 1] : null;

runMonthlyReport(businessKey, targetMonth)
  .then(() => process.exit(0))
  .catch(err => { console.error("Fatal:", err); process.exit(1); });
