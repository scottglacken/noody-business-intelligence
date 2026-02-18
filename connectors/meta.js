// connectors/meta.js
// Pulls Meta Ads performance: spend, impressions, clicks, CTR, ROAS, CPP

const axios = require("axios");

async function getMetaData(accessToken, adAccountId, businessName) {
  const base = "https://graph.facebook.com/v19.0";

  // Get current date in NZ timezone (Pacific/Auckland)
  const nzTime = new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" });
  const today = new Date(nzTime);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const fmt = (d) => d.toISOString().split("T")[0]; // YYYY-MM-DD

  const commonFields = [
    "spend", "impressions", "clicks", "ctr", "cpc", "cpm",
    "reach", "frequency",
    "actions", "action_values",
    "cost_per_action_type", "purchase_roas",
    "website_purchase_roas"
  ].join(",");

  const params = {
    access_token: accessToken,
    fields: commonFields,
    time_range: JSON.stringify({ since: fmt(yesterday), until: fmt(yesterday) }),
    level: "account",
    action_attribution_windows: "['7d_click','1d_view']",
  };

  try {
    // ── Account Level (yesterday) ───────────────────────────
    const [accountRes, campaignRes, adsetRes] = await Promise.all([
      axios.get(`${base}/${adAccountId}/insights`, { params }),
      axios.get(`${base}/${adAccountId}/insights`, {
        params: {
          ...params,
          level: "campaign",
          fields: commonFields + ",campaign_name",
          limit: 20,
        }
      }),
      axios.get(`${base}/${adAccountId}/insights`, {
        params: {
          ...params,
          level: "adset",
          fields: "spend,impressions,clicks,ctr,cpc,adset_name,campaign_name,actions,action_values",
          limit: 20,
        }
      }),
    ]);

    const accountData = accountRes.data.data?.[0] || {};
    const campaigns = campaignRes.data.data || [];
    const adsets = adsetRes.data.data || [];

    // ── Parse Actions (purchases, add to cart, etc.) ────────
    const parseActions = (actions = [], type) => {
      const found = actions.find(a => a.action_type === type);
      return parseFloat(found?.value || 0);
    };

    const parseActionValue = (action_values = [], type) => {
      const found = action_values.find(a => a.action_type === type);
      return parseFloat(found?.value || 0);
    };

    const accountActions = accountData.actions || [];
    const accountActionValues = accountData.action_values || [];

    const purchases = parseActions(accountActions, "purchase");
    const purchaseValue = parseActionValue(accountActionValues, "purchase");
    const addToCart = parseActions(accountActions, "add_to_cart");
    const initiateCheckout = parseActions(accountActions, "initiate_checkout");

    const spend = parseFloat(accountData.spend || 0);
    const roas = spend > 0 ? purchaseValue / spend : 0;
    const cpa = purchases > 0 ? spend / purchases : 0;

    // ── Campaign Breakdown ──────────────────────────────────
    const campaignBreakdown = campaigns.map(c => {
      const cSpend = parseFloat(c.spend || 0);
      const cPurchases = parseActions(c.actions || [], "purchase");
      const cPurchaseValue = parseActionValue(c.action_values || [], "purchase");
      return {
        name: c.campaign_name,
        spend: Math.round(cSpend * 100) / 100,
        impressions: parseInt(c.impressions || 0),
        clicks: parseInt(c.clicks || 0),
        ctr: Math.round(parseFloat(c.ctr || 0) * 100) / 100,
        cpc: Math.round(parseFloat(c.cpc || 0) * 100) / 100,
        purchases: cPurchases,
        roas: cSpend > 0 ? Math.round((cPurchaseValue / cSpend) * 100) / 100 : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    // ── MTD Comparison ──────────────────────────────────────
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const mtdRes = await axios.get(`${base}/${adAccountId}/insights`, {
      params: {
        ...params,
        time_range: JSON.stringify({ since: fmt(monthStart), until: fmt(yesterday) }),
        level: "account",
      }
    });
    const mtdData = mtdRes.data.data?.[0] || {};
    const mtdSpend = parseFloat(mtdData.spend || 0);
    const mtdPurchases = parseActions(mtdData.actions || [], "purchase");
    const mtdPurchaseValue = parseActionValue(mtdData.action_values || [], "purchase");

    return {
      business: businessName,
      source: "meta_ads",
      daily: {
        spend: Math.round(spend * 100) / 100,
        impressions: parseInt(accountData.impressions || 0),
        clicks: parseInt(accountData.clicks || 0),
        ctr: Math.round(parseFloat(accountData.ctr || 0) * 100) / 100,
        cpc: Math.round(parseFloat(accountData.cpc || 0) * 100) / 100,
        cpm: Math.round(parseFloat(accountData.cpm || 0) * 100) / 100,
        reach: parseInt(accountData.reach || 0),
        purchases,
        purchaseValue: Math.round(purchaseValue * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        cpa: Math.round(cpa * 100) / 100,
        addToCart,
        initiateCheckout,
        cartToCheckoutRate: addToCart > 0 ? Math.round((initiateCheckout / addToCart) * 100) : 0,
        checkoutToPurchaseRate: initiateCheckout > 0 ? Math.round((purchases / initiateCheckout) * 100) : 0,
      },
      campaigns: campaignBreakdown,
      mtd: {
        spend: Math.round(mtdSpend * 100) / 100,
        purchases: mtdPurchases,
        purchaseValue: Math.round(mtdPurchaseValue * 100) / 100,
        roas: mtdSpend > 0 ? Math.round((mtdPurchaseValue / mtdSpend) * 100) / 100 : 0,
      }
    };

  } catch (err) {
    console.error(`[Meta/${businessName}] Error:`, err.response?.data || err.message);
    return { business: businessName, source: "meta_ads", error: err.message };
  }
}

module.exports = { getMetaData };
