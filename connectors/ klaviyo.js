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
    // Get recent email campaigns
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

    // Filter to campaigns from last 30 days
    const recentCampaigns = allCampaigns.filter(c => {
      if (!c.attributes?.send_time) return false;
      const sendTime = new Date(c.attributes.send_time);
      const daysDiff = (today - sendTime) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30 && daysDiff >= 0;
    }).slice(0, 10);

    // Get campaign stats for recent campaigns
    const campaignStats = await Promise.all(
      recentCampaigns.slice(0, 5).map(async (campaign) => {
        try {
          // Get campaign messages
          const messagesRes = await axios.get(`${base}/campaigns/${campaign.id}/campaign-messages`, {
            headers,
          });
          
          const messages = messagesRes.data.data || [];
          const firstMessage = messages[0];
          
          if (firstMessage) {
            // Try to get recipient estimation
            try {
              const estimationRes = await axios.get(`${base}/campaign-recipient-estimations`, {
                headers,
                params: {
                  "filter": `equals(campaign_id,'${campaign.id}')`
                }
              });
              const estimation = estimationRes.data.data?.[0]?.attributes;
              
              return {
                name: campaign.attributes?.name,
                sentAt: campaign.attributes?.send_time,
                recipients: estimation?.estimated_recipient_count || 0,
              };
            } catch (e) {
              return {
                name: campaign.attributes?.name,
                sentAt: campaign.attributes?.send_time,
              };
            }
          }
          
          return {
            name: campaign.attributes?.name,
            sentAt: campaign.attributes?.send_time,
          };
        } catch (err) {
          return {
            name: campaign.attributes?.name,
            sentAt: campaign.attributes?.send_time,
          };
        }
      })
    );

    // Get flows
    const flowsRes = await axios.get(`${base}/flows`, {
      headers,
      params: {
        "fields[flow]": "name,status,created,updated"
      }
    });
    const flows = flowsRes.data.data || [];
    const activeFlows = flows.filter(f => f.attributes?.status === "active");

    // Get lists
    const listsRes = await axios.get(`${base}/lists`, {
      headers,
      params: { 
        "fields[list]": "name,created,updated"
      }
    });
    const lists = listsRes.data.data || [];

    // Calculate metrics
    const totalRecipients = campaignStats.reduce((sum, c) => sum + (c.recipients || 0), 0);
    const avgRecipients = campaignStats.length > 0 ? Math.round(totalRecipients / campaignStats.length) : 0;

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
      last30Days: {
        totalCampaigns: recentCampaigns.length,
        avgRecipientsPerCampaign: avgRecipients,
        recentCampaigns: campaignStats,
      },
      flows: {
        total: flows.length,
        active: activeFlows.length,
        topFlows: activeFlows.slice(0, 5).map(f => f.attributes?.name).filter(Boolean),
      },
      lists: {
        totalLists: lists.length,
        listNames: lists.slice(0, 5).map(l => l.attributes?.name).filter(Boolean),
      },
    };

  } catch (err) {
    console.error(`[Klaviyo] Error:`, err.response?.data || err.message);
    return { source: "klaviyo", error: err.response?.data?.errors?.[0]?.detail || err.message };
  }
}

module.exports = { getKlaviyoData };
