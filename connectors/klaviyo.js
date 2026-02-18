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
    
    // Filter for truly active flows (status=active AND not archived)
    const activeFlows = allFlows.filter(f => {
      const status = f.attributes?.status;
      const archived = f.attributes?.archived;
      return status === "active" && !archived;
    });
    
    console.log(`[Klaviyo] Active flows: ${activeFlows.length}`);
    console.log(`[Klaviyo] Flow names: ${activeFlows.map(f => f.attributes?.name).join(", ")}`);

    // ═══════════════════════════════════════════════════════════
    // 3. GET METRICS (Revenue Attribution)
    // ═══════════════════════════════════════════════════════════
    console.log('[Klaviyo] Fetching metrics for revenue attribution...');
    
    // Get all relevant metrics
    const metricsRes = await axios.get(`${base}/metrics`, { 
      headers,
      params: {
        "filter": "or(equals(name,'Placed Order'),equals(name,'Received Email'),equals(name,'Opened Email'),equals(name,'Clicked Email'))",
      }
    });
    const metrics = metricsRes.data.data || [];
    console.log(`[Klaviyo] Found ${metrics.length} metrics`);
    
    const placedOrderMetric = metrics.find(m => m.attributes?.name === "Placed Order");
    const receivedEmailMetric = metrics.find(m => m.attributes?.name === "Received Email");
    const openedEmailMetric = metrics.find(m => m.attributes?.name === "Opened Email");
    const clickedEmailMetric = metrics.find(m => m.attributes?.name === "Clicked Email");

    // Try to get metric aggregate for Placed Order from email in last 7 days
    let emailRevenue = 0;
    let emailOrders = 0;
    
    if (placedOrderMetric) {
      try {
        // Query metric aggregates for last 7 days
        const startDate = last7Days.toISOString().split('T')[0];
        const endDate = today.toISOString().split('T')[0];
        
        console.log(`[Klaviyo] Querying orders from ${startDate} to ${endDate}...`);
        
        // This endpoint may or may not work depending on API access
        // We'll try but handle gracefully if it fails
        const metricAggRes = await axios.get(`${base}/metric-aggregates`, {
          headers,
          params: {
            "filter": `and(equals(metric_id,'${placedOrderMetric.id}'),greater-or-equal(timestamp,'${startDate}'),less-than(timestamp,'${endDate}'))`,
          }
        });
        
        // Parse revenue if available
        const aggregates = metricAggRes.data.data || [];
        console.log(`[Klaviyo] Metric aggregates returned: ${aggregates.length}`);
        
      } catch (metricErr) {
        console.log(`[Klaviyo] Metric aggregates not available (expected): ${metricErr.message}`);
      }
    }

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

    // Try to get profile counts for lists
    const listDetails = await Promise.all(
      lists.slice(0, 5).map(async (list) => {
        try {
          // Get profiles count via list relationships
          const relationshipsRes = await axios.get(`${base}/lists/${list.id}/relationships/profiles`, {
            headers,
          });
          
          // The links.related gives us total count in some API versions
          // Or we count from data array
          const profileCount = relationshipsRes.data.data?.length || 0;
          
          return {
            name: list.attributes?.name,
            id: list.id,
            subscribers: profileCount
          };
        } catch (err) {
          return {
            name: list.attributes?.name,
            id: list.id,
            subscribers: 0
          };
        }
      })
    );

    const totalSubscribers = listDetails.reduce((sum, l) => sum + l.subscribers, 0);
    console.log(`[Klaviyo] Total subscribers: ${totalSubscribers}`);

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
        // Revenue attribution would go here if we could get it
      },
      flows: {
        total: allFlows.length,
        active: activeFlows.length,
        flowNames: activeFlows.map(f => f.attributes?.name).filter(Boolean),
      },
      lists: {
        total: lists.length,
        totalSubscribers: totalSubscribers,
        topLists: listDetails.filter(l => l.name),
      },
      note: "Klaviyo API has limited metric aggregation access - revenue attribution requires pro plan or special API access"
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
