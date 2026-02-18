// connectors/klaviyo.js
const axios = require("axios");

async function getKlaviyoData(apiKey) {
  const headers = { Authorization: `Klaviyo-API-Key ${apiKey}`, revision: "2024-02-15" };
  const base = "https://a.klaviyo.com/api";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const fmt = (d) => d.toISOString();

  try {
    // Get recent campaigns (last 7 days)
    const campaignsRes = await axios.get(`${base}/campaigns`, {
      headers,
      params: {
        "fields[campaign]": "name,send_time,status,audiences",
        "page[size]": 20,
      }
    });

    const campaigns = (campaignsRes.data.data || [])
      .filter(c => {
        const sendTime = new Date(c.attributes?.send_time);
        const daysDiff = (today - sendTime) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7 && daysDiff >= 0;
      })
      .slice(0, 10);

    const yesterdayCampaigns = campaigns.filter(c => {
      const sendTime = new Date(c.attributes?.send_time);
      return sendTime >= yesterday && sendTime < today;
    });

    // Get flows metrics
    const metricsRes = await axios.get(`${base}/metrics`, { headers });
    const metrics = metricsRes.data.data || [];

    // Get aggregate stats for key email metrics over last 30 days
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find metric IDs for opens, clicks, etc.
    const openMetric = metrics.find(m => m.attributes?.name === "Opened Email");
    const clickMetric = metrics.find(m => m.attributes?.name === "Clicked Email");
    const unsubMetric = metrics.find(m => m.attributes?.name === "Unsubscribed");
    const placedOrderMetric = metrics.find(m => m.attributes?.name === "Placed Order");

    // Profile/list stats
    const listsRes = await axios.get(`${base}/lists`, {
      headers,
      params: { "fields[list]": "name,profile_count" }
    });
    const lists = listsRes.data.data || [];
    const totalSubscribers = lists.reduce((s, l) => s + (l.attributes?.profile_count || 0), 0);

    return {
      source: "klaviyo",
      daily: {
        campaignsSent: yesterdayCampaigns.length,
        campaigns: yesterdayCampaigns.map(c => ({ name: c.attributes?.name, sentAt: c.attributes?.send_time })),
      },
      recent: {
        campaignsLast7Days: campaigns.length,
      },
      lists: lists.map(l => ({ name: l.attributes?.name, subscribers: l.attributes?.profile_count })),
      totalSubscribers,
      note: "Campaign-level open/click rates require individual campaign metric queries"
    };

  } catch (err) {
    console.error(`[Klaviyo] Error:`, err.response?.data || err.message);
    return { source: "klaviyo", error: err.message };
  }
}

module.exports = { getKlaviyoData };
