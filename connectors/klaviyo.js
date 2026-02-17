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
    // Get campaigns sent yesterday
    const campaignsRes = await axios.get(`${base}/campaigns`, {
      headers,
      params: {
        "filter": `and(equals(messages.channel,'email'),greater-or-equal(send_time,'${fmt(yesterday)}'),less-than(send_time,'${fmt(today)}'))`,
        "fields[campaign]": "name,send_time,status",
        "fields[campaign-message]": "label",
      }
    });

    const campaigns = campaignsRes.data.data || [];

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
        campaignsSent: campaigns.length,
        campaigns: campaigns.map(c => ({ name: c.attributes?.name, sentAt: c.attributes?.send_time })),
      },
      lists: lists.map(l => ({ name: l.attributes?.name, subscribers: l.attributes?.profile_count })),
      totalSubscribers,
      note: "For detailed open/click rates, pull from campaign-specific reporting endpoints"
    };

  } catch (err) {
    console.error(`[Klaviyo] Error:`, err.response?.data || err.message);
    return { source: "klaviyo", error: err.message };
  }
}

module.exports = { getKlaviyoData };
