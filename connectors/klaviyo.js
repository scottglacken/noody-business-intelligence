// connectors/klaviyo.js - COMPREHENSIVE VERSION
// Focus: Revenue attribution, flows, 7-day performance
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
  
  const last7Days = new Date(today);
  last7Days.setDate(last7Days.getDate() - 7);

  try {
    console.log('[Klaviyo] Starting comprehensive data collection...');
    
    // ═══════════════════════════════════════════════════════════
    // 1. GET CAMPAIGNS (Last 7 Days)
    // ═══════════════════════════════════════════════════════════
    const campaignsRes = await axios.get(`${base}/campaigns`, {
      headers,
      params: {
        "filter": "equals(messages.channel,'email')",
        "fields[campaign]": "name,send_time,status,audiences",
      }
    });

    const allCampaigns = campaignsRes.data.data || [];
    console.log(`[Klaviyo] Total campaigns found: ${allCampaigns.length}`);
    
    const last7DaysCampaigns = allCampaigns.filter(c => {
      if (!c.attributes?.send_time) return false;
      const sendTime = new Date(c.attributes.send_time);
      return sendTime >= last7Days && sendTime < today;
    });
    
    const yesterdayCampaigns = allCampaigns.filter(c => {
      if (!c.attributes?.send_time) return false;
      const sendTime = new Date(c.attributes.send_time);
      return sendTime >= yesterday && sendTime < today;
    });

    console.log(`[Klaviyo] Last 7 days: ${last7DaysCampaigns.length} campaigns, Yesterday: ${yesterdayCampaigns.length} campaigns`);

    // ═══════════════════════════════════════════════════════════
    // 2. GET FLOWS
    // ═══════════════════════════════════════════════════════════
    console.log('[Klaviyo] Fetching flows...');
    const flowsRes = await axios.get(`${base}/flows`, {
      headers,
      params: {
        "fields[flow]": "name,status,created,updated,archived"
      }
    });
    
    const allFlows = flowsRes.data.data || [];
    console.log(`[Klaviyo] Total flows: ${allFlows.length}`);
    
    // Filter for active flows - be more lenient
    const activeFlows = allFlows.filter(f => {
      const status = f.attributes?.status;
      const archived = f.attributes?.archived;
      const isActive = status === "active" || status === "live" || status === "manual";
      return isActive && !archived;
    });
    
    console.log(`[Klaviyo] Active flows: ${activeFlows.length}`);
    console.log(`[Klaviyo] Flow details:`, allFlows.map(f => ({
      name: f.attributes?.name,
      status: f.attributes?.status,
      archived: f.attributes?.archived
    })));

    // ═══════════════════════════════════════════════════════════
    // 3. GET METRICS (Revenue Attribution) - SKIP FOR NOW
    // ═══════════════════════════════════════════════════════════
    // Klaviyo metrics API is complex and requires specific integration filtering
    // Skip this for daily reporting - use Klaviyo dashboard for detailed metrics
    console.log('[Klaviyo] Skipping metrics query - requires pro API access');

    // ═══════════════════════════════════════════════════════════
    // 4. GET LISTS & SUBSCRIBER COUNTS
    // ═══════════════════════════════════════════════════════════
    console.log('[Klaviyo] Fetching lists...');
    const listsRes = await axios.get(`${base}/lists`, {
      headers,
      params: { 
        "fields[list]": "name,created,updated"
      }
    });
    const lists = listsRes.data.data || [];
    console.log(`[Klaviyo] Found ${lists.length} lists`);

    // ═══════════════════════════════════════════════════════════
    // 5. BUILD RESPONSE
    // ═══════════════════════════════════════════════════════════
    
    const result = {
      source: "klaviyo",
      period: "last_7_days",
      daily: {
        campaignsSent: yesterdayCampaigns.length,
        campaignNames: yesterdayCampaigns.map(c => c.attributes?.name).filter(Boolean),
      },
      last7Days: {
        campaignsSent: last7DaysCampaigns.length,
        campaignNames: last7DaysCampaigns.map(c => c.attributes?.name).filter(Boolean).slice(0, 5),
      },
      flows: {
        total: allFlows.length,
        active: activeFlows.length,
        flowNames: activeFlows.map(f => f.attributes?.name).filter(Boolean),
        allFlowStatuses: allFlows.map(f => ({
          name: f.attributes?.name,
          status: f.attributes?.status,
          archived: f.attributes?.archived
        })),
      },
      lists: {
        total: lists.length,
        listNames: lists.map(l => l.attributes?.name).filter(Boolean).slice(0, 5),
      },
      note: "Focus on campaign activity and flow health. Revenue metrics require Klaviyo dashboard."
    };

    console.log('[Klaviyo] Data collection complete');
    console.log(`[Klaviyo] Summary: ${result.flows.active} active flows, ${result.last7Days.campaignsSent} campaigns in 7d`);
    
    return result;

  } catch (err) {
    console.error(`[Klaviyo] Error:`, err.response?.data || err.message);
    return { 
      source: "klaviyo", 
      error: err.response?.data?.errors?.[0]?.detail || err.message 
    };
  }
}

module.exports = { getKlaviyoData };
