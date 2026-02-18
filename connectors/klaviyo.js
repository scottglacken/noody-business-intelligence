// connectors/klaviyo.js
const axios = require("axios");

async function getKlaviyoData(apiKey) {
  const headers = { 
    Authorization: `Klaviyo-API-Key ${apiKey}`, 
    revision: "2024-02-15",
    Accept: "application/json"
  };
  const base = "https://a.klaviyo.com/api";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  try {
    // Get recent email campaigns (campaigns sent in last 7 days)
    const campaignsRes = await axios.get(`${base}/campaigns`, {
      headers,
      params: {
        "filter": "equals(messages.channel,'email')",
        "fields[campaign]": "name,send_time,status",
      }
    });

    const allCampaigns = campaignsRes.data.data || [];
    
    // Filter to campaigns from yesterday
    const yesterdayCampaigns = allCampaigns.filter(c => {
      if (!c.attributes?.send_time) return false;
      const sendTime = new Date(c.attributes.send_time);
      return sendTime >= yesterday && sendTime < today;
    });

    // Filter to campaigns from last 7 days for context
    const recentCampaigns = allCampaigns.filter(c => {
      if (!c.attributes?.send_time) return false;
      const sendTime = new Date(c.attributes.send_time);
      const daysDiff = (today - sendTime) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7 && daysDiff >= 0;
    });

    // Get lists (using only valid fields)
    const listsRes = await axios.get(`${base}/lists`, {
      headers,
      params: { 
        "fields[list]": "name,created,updated"
      }
    });
    const lists = listsRes.data.data || [];

    return {
      source: "klaviyo",
      daily: {
        campaignsSent: yesterdayCampaigns.length,
        campaigns: yesterdayCampaigns.map(c => ({
          name: c.attributes?.name,
          status: c.attributes?.status,
          sentAt: c.attributes?.send_time
        })),
      },
      recent: {
        campaignsLast7Days: recentCampaigns.length,
        recentCampaigns: recentCampaigns.slice(0, 5).map(c => ({
          name: c.attributes?.name,
          status: c.attributes?.status,
          sentAt: c.attributes?.send_time
        })),
      },
      lists: {
        totalLists: lists.length,
        listNames: lists.map(l => l.attributes?.name).filter(Boolean),
      },
    };

  } catch (err) {
    console.error(`[Klaviyo] Error:`, err.response?.data || err.message);
    return { source: "klaviyo", error: err.response?.data?.errors?.[0]?.detail || err.message };
  }
}

module.exports = { getKlaviyoData };
