// connectors/google-ads.js
const { GoogleAdsApi } = require("google-ads-api");

async function getGoogleAdsData(config, customerId, businessName) {
  try {
    const client = new GoogleAdsApi({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      developer_token: config.developerToken,
    });

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: config.refreshToken,
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const results = await customer.query(`
      SELECT
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${fmt(yesterday)}' AND '${fmt(yesterday)}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 20
    `);

    const campaigns = results.map(r => {
      const spend = (r.metrics.cost_micros || 0) / 1_000_000;
      return {
        name: r.campaign.name,
        spend: Math.round(spend * 100) / 100,
        impressions: r.metrics.impressions || 0,
        clicks: r.metrics.clicks || 0,
        ctr: Math.round((r.metrics.ctr || 0) * 10000) / 100,
        avgCpc: Math.round(((r.metrics.average_cpc || 0) / 1_000_000) * 100) / 100,
        conversions: r.metrics.conversions || 0,
        conversionValue: r.metrics.conversions_value || 0,
        roas: spend > 0 ? Math.round(((r.metrics.conversions_value || 0) / spend) * 100) / 100 : 0,
      };
    });

    const totals = campaigns.reduce((acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
      conversionValue: acc.conversionValue + c.conversionValue,
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 });

    return {
      business: businessName,
      source: "google_ads",
      daily: {
        ...totals,
        spend: Math.round(totals.spend * 100) / 100,
        ctr: totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0,
        roas: totals.spend > 0 ? Math.round((totals.conversionValue / totals.spend) * 100) / 100 : 0,
      },
      campaigns,
    };

  } catch (err) {
    console.error(`[Google Ads/${businessName}] Error:`, err.message);
    return { business: businessName, source: "google_ads", error: err.message };
  }
}

module.exports = { getGoogleAdsData };


// ============================================================
// connectors/ga4.js - Google Analytics 4
// ============================================================
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

async function getGA4Data(credentialsPath, propertyId, businessName) {
  try {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    const analyticsDataClient = new BetaAnalyticsDataClient();

    const [response] = await analyticsDataClient.runReport({
      property: propertyId,
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "addToCarts" },
        { name: "checkouts" },
      ],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
    });

    const channelData = {};
    const totals = { sessions: 0, users: 0, newUsers: 0, revenue: 0, purchases: 0, addToCarts: 0 };

    (response.rows || []).forEach(row => {
      const channel = row.dimensionValues[0].value;
      const metrics = row.metricValues.map(m => parseFloat(m.value || 0));
      channelData[channel] = {
        sessions: metrics[0],
        users: metrics[1],
        newUsers: metrics[2],
        bounceRate: Math.round(metrics[3] * 100),
        avgSessionDuration: Math.round(metrics[4]),
        purchases: metrics[5],
        revenue: metrics[6],
        addToCarts: metrics[7],
        checkouts: metrics[8],
      };
      totals.sessions += metrics[0];
      totals.users += metrics[1];
      totals.newUsers += metrics[2];
      totals.revenue += metrics[6];
      totals.purchases += metrics[5];
      totals.addToCarts += metrics[7];
    });

    const convRate = totals.sessions > 0 ? Math.round((totals.purchases / totals.sessions) * 10000) / 100 : 0;
    const cartRate = totals.sessions > 0 ? Math.round((totals.addToCarts / totals.sessions) * 10000) / 100 : 0;

    return {
      business: businessName,
      source: "ga4",
      daily: {
        ...totals,
        conversionRate: convRate,
        addToCartRate: cartRate,
        topChannels: Object.entries(channelData).sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 6),
      }
    };

  } catch (err) {
    console.error(`[GA4/${businessName}] Error:`, err.message);
    return { business: businessName, source: "ga4", error: err.message };
  }
}

module.exports = { getGA4Data };
