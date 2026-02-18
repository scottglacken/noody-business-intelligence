// connectors/customer-service.js
// Supports Gorgias (primary), Zendesk, Freshdesk

const axios = require("axios");

async function getCustomerServiceData(config) {
  const { provider, apiKey, apiSecret, domain } = config;

  try {
    if (provider === "gorgias") {
      return await getGorgiasData(domain, apiKey);
    } else if (provider === "zendesk") {
      return await getZendeskData(domain, apiKey);
    } else if (provider === "freshdesk") {
      return await getFreshdeskData(domain, apiKey);
    }
    return { source: "customer_service", error: "Unknown provider" };
  } catch (err) {
    console.error(`[CS/${provider}] Error:`, err.message);
    return { source: "customer_service", error: err.message };
  }
}

async function getGorgiasData(domain, apiKey) {
  const base = `https://${domain}/api`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const fmt = (d) => d.toISOString();

  const [ticketsRes, openRes] = await Promise.all([
    axios.get(`${base}/tickets`, {
      headers,
      params: {
        created_datetime_gte: fmt(yesterday),
        created_datetime_lte: fmt(today),
        limit: 100,
        page: 1,
      }
    }),
    axios.get(`${base}/tickets`, {
      headers,
      params: { status: "open", limit: 100 }
    }),
  ]);

  const tickets = ticketsRes.data.data || [];
  const openTickets = openRes.data.data || [];

  // Calculate first response time
  const responseTimes = tickets
    .filter(t => t.first_message_datetime && t.created_datetime)
    .map(t => {
      const created = new Date(t.created_datetime);
      const firstResp = new Date(t.first_message_datetime);
      return (firstResp - created) / 3600000; // hours
    });

  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : null;

  // Ticket categories (from tags)
  const tagCounts = {};
  tickets.forEach(t => {
    (t.tags || []).forEach(tag => {
      tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
    });
  });

  // Satisfaction scores
  const ratedTickets = tickets.filter(t => t.satisfaction_score !== null && t.satisfaction_score !== undefined);
  const avgSatisfaction = ratedTickets.length > 0
    ? ratedTickets.reduce((s, t) => s + t.satisfaction_score, 0) / ratedTickets.length
    : null;

  return {
    source: "customer_service",
    provider: "gorgias",
    daily: {
      newTickets: tickets.length,
      resolvedTickets: tickets.filter(t => t.status === "closed").length,
      openTotal: openTickets.length,
      avgResponseTimeHours: avgResponseTime ? Math.round(avgResponseTime * 10) / 10 : null,
      avgSatisfaction: avgSatisfaction ? Math.round(avgSatisfaction * 10) / 10 : null,
      topIssues: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
    }
  };
}

async function getZendeskData(domain, apiKey) {
  // Zendesk implementation placeholder
  const base = `https://${domain}.zendesk.com/api/v2`;
  return { source: "customer_service", provider: "zendesk", note: "Connect your Zendesk token" };
}

async function getFreshdeskData(domain, apiKey) {
  // Freshdesk implementation placeholder
  return { source: "customer_service", provider: "freshdesk", note: "Connect your Freshdesk token" };
}

module.exports = { getCustomerServiceData };


// ============================================================
// connectors/social.js - Instagram & Facebook via Meta Graph API
// ============================================================

async function getSocialData(accountId, accessToken, businessName) {
  const base = "https://graph.facebook.com/v19.0";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 7); // Instagram only allows 7-day periods

  try {
    const [profileRes, mediaRes, insightsRes] = await Promise.all([
      axios.get(`${base}/${accountId}`, {
        params: {
          fields: "followers_count,media_count,name,username",
          access_token: accessToken,
        }
      }),
      axios.get(`${base}/${accountId}/media`, {
        params: {
          fields: "id,caption,media_type,timestamp,like_count,comments_count,reach,impressions,engagement",
          limit: 10,
          access_token: accessToken,
        }
      }),
      axios.get(`${base}/${accountId}/insights`, {
        params: {
          metric: "reach,impressions,profile_views,follower_count",
          period: "day",
          since: Math.floor(yesterday.getTime() / 1000),
          until: Math.floor(today.getTime() / 1000),
          access_token: accessToken,
        }
      }),
    ]);

    const profile = profileRes.data;
    const recentMedia = (mediaRes.data.data || []).slice(0, 5);
    const insights = insightsRes.data.data || [];

    const getInsightValue = (name) => {
      const metric = insights.find(i => i.name === name);
      const latest = metric?.values?.slice(-1)[0];
      return latest?.value || 0;
    };

    return {
      business: businessName,
      source: "instagram",
      profile: {
        followers: profile.followers_count,
        totalPosts: profile.media_count,
        username: profile.username,
      },
      daily: {
        reach: getInsightValue("reach"),
        impressions: getInsightValue("impressions"),
        profileViews: getInsightValue("profile_views"),
      },
      recentPosts: recentMedia.map(p => ({
        type: p.media_type,
        likes: p.like_count || 0,
        comments: p.comments_count || 0,
        postedAt: p.timestamp,
        captionPreview: (p.caption || "").substring(0, 80),
      }))
    };

  } catch (err) {
    console.error(`[Social/${businessName}] Error:`, JSON.stringify(err.response?.data || err.message));
    return { business: businessName, source: "instagram", error: err.response?.data || err.message };
  }
}

module.exports = { getCustomerServiceData, getSocialData };
