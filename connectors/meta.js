// connectors/meta.js - REWRITE Feb 2026
// Full Meta Ads: yesterday + 7d + MTD, campaign/adset breakdowns, frequency alerts
const axios = require("axios");

async function getMetaData(accessToken, adAccountId, businessName) {
  const base = "https://graph.facebook.com/v21.0";
  const now = new Date();
  const nzOffset = 13 * 60;
  const nzTime = new Date(now.getTime() + (nzOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  const today = new Date(nzTime.toISOString().split("T")[0]);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d) => d.toISOString().split("T")[0];

  const allFields = "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,cost_per_action_type,purchase_roas,website_purchase_roas";

  const parseActions = (actions = [], type) => parseFloat((actions.find(a => a.action_type === type) || {}).value || 0);
  const parseActionValue = (avs = [], type) => parseFloat((avs.find(a => a.action_type === type) || {}).value || 0);

  const parseData = (raw) => {
    const spend = parseFloat(raw.spend || 0);
    const purchases = parseActions(raw.actions || [], "purchase");
    const purchaseValue = parseActionValue(raw.action_values || [], "purchase");
    const addToCart = parseActions(raw.actions || [], "add_to_cart");
    const initiateCheckout = parseActions(raw.actions || [], "initiate_checkout");
    const linkClicks = parseActions(raw.actions || [], "link_click");
    const viewContent = parseActions(raw.actions || [], "view_content");
    const videoViews = parseActions(raw.actions || [], "video_view");
    const landingPageViews = parseActions(raw.actions || [], "landing_page_view");
    return {
      spend: Math.round(spend * 100) / 100, impressions: parseInt(raw.impressions || 0),
      clicks: parseInt(raw.clicks || 0), ctr: Math.round(parseFloat(raw.ctr || 0) * 100) / 100,
      cpc: Math.round(parseFloat(raw.cpc || 0) * 100) / 100, cpm: Math.round(parseFloat(raw.cpm || 0) * 100) / 100,
      reach: parseInt(raw.reach || 0), frequency: Math.round(parseFloat(raw.frequency || 0) * 100) / 100,
      purchases, purchaseValue: Math.round(purchaseValue * 100) / 100,
      roas: spend > 0 ? Math.round((purchaseValue / spend) * 100) / 100 : 0,
      cpa: purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0,
      addToCart, initiateCheckout, linkClicks, viewContent, videoViews, landingPageViews,
      cartToCheckoutRate: addToCart > 0 ? Math.round((initiateCheckout / addToCart) * 100) : 0,
      checkoutToPurchaseRate: initiateCheckout > 0 ? Math.round((purchases / initiateCheckout) * 100) : 0,
    };
  };

  try {
    console.log(`[Meta/${businessName}] Querying date range: ${fmt(yesterday)} (yesterday in NZ)`);
    const makeParams = (since, until, level, extraFields = "") => ({
      access_token: accessToken, fields: allFields + (extraFields ? "," + extraFields : ""),
      time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }),
      level, action_attribution_windows: "['7d_click','1d_view']", limit: 25,
    });

    const [acctDay, acct7d, acctMtd, campDay, camp7d, adsetDay] = await Promise.all([
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(yesterday, yesterday, "account") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(weekAgo, yesterday, "account") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(monthStart, yesterday, "account") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(yesterday, yesterday, "campaign", "campaign_name,campaign_id") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: makeParams(weekAgo, yesterday, "campaign", "campaign_name,campaign_id") }),
      axios.get(`${base}/${adAccountId}/insights`, { params: { ...makeParams(yesterday, yesterday, "adset"), fields: "spend,impressions,clicks,ctr,cpc,adset_name,adset_id,campaign_name,actions,action_values,reach,frequency" } }),
    ]);

    console.log(`[Meta/${businessName}] API Response:`, JSON.stringify(acctDay.data, null, 2));

    const daily = parseData(acctDay.data.data?.[0] || {});
    const weekly = parseData(acct7d.data.data?.[0] || {});
    const mtd = parseData(acctMtd.data.data?.[0] || {});

    const parseCampaigns = (data) => (data || []).map(c => {
      const s = parseFloat(c.spend || 0), p = parseActions(c.actions || [], "purchase"), pv = parseActionValue(c.action_values || [], "purchase");
      return { id: c.campaign_id, name: c.campaign_name, spend: Math.round(s * 100) / 100,
        impressions: parseInt(c.impressions || 0), clicks: parseInt(c.clicks || 0),
        ctr: Math.round(parseFloat(c.ctr || 0) * 100) / 100, cpc: Math.round(parseFloat(c.cpc || 0) * 100) / 100,
        reach: parseInt(c.reach || 0), frequency: Math.round(parseFloat(c.frequency || 0) * 100) / 100,
        purchases: p, purchaseValue: Math.round(pv * 100) / 100,
        roas: s > 0 ? Math.round((pv / s) * 100) / 100 : 0, cpa: p > 0 ? Math.round((s / p) * 100) / 100 : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    const adsetBreakdown = (adsetDay.data.data || []).map(as => {
      const s = parseFloat(as.spend || 0), p = parseActions(as.actions || [], "purchase"), pv = parseActionValue(as.action_values || [], "purchase");
      return { id: as.adset_id, name: as.adset_name, campaign: as.campaign_name,
        spend: Math.round(s * 100) / 100, impressions: parseInt(as.impressions || 0),
        clicks: parseInt(as.clicks || 0), ctr: Math.round(parseFloat(as.ctr || 0) * 100) / 100,
        reach: parseInt(as.reach || 0), frequency: Math.round(parseFloat(as.frequency || 0) * 100) / 100,
        purchases: p, roas: s > 0 ? Math.round((pv / s) * 100) / 100 : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    const frequencyWarnings = [];
    if (weekly.frequency > 3.0) frequencyWarnings.push(`Account frequency ${weekly.frequency}x over 7d — ad fatigue risk`);
    parseCampaigns(camp7d.data.data).forEach(c => { if (c.frequency > 4.0) frequencyWarnings.push(`"${c.name}" frequency ${c.frequency}x — needs fresh creative`); });

    return {
      business: businessName, source: "meta_ads",
      score: daily.roas >= 3 && daily.ctr >= 1.0 ? "green" : daily.roas < 1.5 || daily.ctr < 0.5 ? "red" : "yellow",
      daily, last7Days: weekly, mtd,
      campaigns: { yesterday: parseCampaigns(campDay.data.data), last7Days: parseCampaigns(camp7d.data.data) },
      adSets: { yesterday: adsetBreakdown.slice(0, 10) },
      frequencyWarnings,
    };
  } catch (err) {
    console.error(`[Meta/${businessName}] Error:`, err.response?.data || err.message);
    return { business: businessName, source: "meta_ads", error: err.response?.data?.error?.message || err.message };
  }
}

module.exports = { getMetaData };
