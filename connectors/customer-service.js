// connectors/customer-service.js
// Pulls from Re:amaze (tickets, conversations) + Meta Business Inbox (FB/IG messages)
// Provides daily + weekly summary data

const axios = require("axios");

// ═══════════════════════════════════════════════════════════
// RE:AMAZE
// ═══════════════════════════════════════════════════════════
async function getReamazeData(brand, email, apiToken) {
  const base = `https://${brand}.reamaze.io/api/v1`;
  const auth = { username: email, password: apiToken };
  const headers = { Accept: "application/json" };

  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(0,0,0,0);
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

  const fmt = (d) => d.toISOString();

  console.log("[Re:amaze] Fetching conversations...");

  try {
    // Get all open/unresolved conversations
    const [openRes, allYesterdayRes, allWeekRes, ratingsRes] = await Promise.all([
      axios.get(`${base}/conversations`, { auth, headers, params: { filter: "open" } }).catch(e => ({ data: { conversations: [], total_count: 0 } })),
      axios.get(`${base}/conversations`, { auth, headers, params: { filter: "all", start_date: fmt(yesterday), end_date: fmt(now), sort: "updated" } }).catch(e => ({ data: { conversations: [], total_count: 0 } })),
      axios.get(`${base}/conversations`, { auth, headers, params: { filter: "all", start_date: fmt(weekAgo), end_date: fmt(now), sort: "updated" } }).catch(e => ({ data: { conversations: [], total_count: 0 } })),
      axios.get(`${base}/satisfaction_ratings`, { auth, headers, params: { created_after: fmt(monthAgo) } }).catch(e => ({ data: { satisfaction_ratings: [], total_count: 0 } })),
    ]);

    const openConvos = openRes.data.conversations || [];
    const yesterdayConvos = allYesterdayRes.data.conversations || [];
    const weekConvos = allWeekRes.data.conversations || [];
    const ratings = ratingsRes.data.satisfaction_ratings || [];

    console.log(`[Re:amaze] Open: ${openConvos.length}, Yesterday: ${yesterdayConvos.length}, Week: ${weekConvos.length}, Ratings: ${ratings.length}`);

    // Categorize yesterday's conversations
    const yesterdayByChannel = {};
    const yesterdayByTag = {};
    const yesterdayUnassigned = [];
    
    yesterdayConvos.forEach(c => {
      const channel = c.category?.name || "Unknown";
      yesterdayByChannel[channel] = (yesterdayByChannel[channel] || 0) + 1;
      
      (c.tag_list || []).forEach(t => { yesterdayByTag[t] = (yesterdayByTag[t] || 0) + 1; });
      
      if (!c.assignee) yesterdayUnassigned.push({ subject: c.subject, slug: c.slug, created: c.created_at });
    });

    // Week summary
    const weekByChannel = {};
    const weekByTag = {};
    weekConvos.forEach(c => {
      const channel = c.category?.name || "Unknown";
      weekByChannel[channel] = (weekByChannel[channel] || 0) + 1;
      (c.tag_list || []).forEach(t => { weekByTag[t] = (weekByTag[t] || 0) + 1; });
    });

    // Open conversations breakdown
    const openByAge = { under1h: 0, under4h: 0, under24h: 0, over24h: 0, over48h: 0 };
    const openUnassigned = [];
    
    openConvos.forEach(c => {
      const lastMsg = c.last_customer_message?.created_at;
      if (lastMsg) {
        const ageMs = now - new Date(lastMsg);
        const ageHours = ageMs / 3600000;
        if (ageHours < 1) openByAge.under1h++;
        else if (ageHours < 4) openByAge.under4h++;
        else if (ageHours < 24) openByAge.under24h++;
        else if (ageHours < 48) openByAge.over24h++;
        else openByAge.over48h++;
      }
      if (!c.assignee) openUnassigned.push({ subject: c.subject, slug: c.slug, age: lastMsg });
    });

    // Top issues (by tag frequency this week)
    const topIssues = Object.entries(weekByTag)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Satisfaction ratings
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + (r.rating || 0), 0) / ratings.length) * 10) / 10
      : null;
    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach(r => { if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating]++; });

    // Recent conversations with subjects (for AI analysis)
    const recentSubjects = yesterdayConvos.slice(0, 20).map(c => ({
      subject: c.subject,
      channel: c.category?.name,
      tags: c.tag_list,
      status: c.status,
      lastCustomerMsg: c.last_customer_message?.body?.substring(0, 200),
    }));

    // ── FETCH ACTUAL MESSAGES (7 days) for AI analysis ──
    console.log("[Re:amaze] Fetching customer messages for AI analysis...");
    let allCustomerMessages = [];
    try {
      const msgsRes = await axios.get(`${base}/messages`, {
        auth, headers,
        params: {
          filter: "customer",
          start_date: fmt(weekAgo),
          end_date: fmt(now),
        }
      });
      const msgs = msgsRes.data.messages || [];
      allCustomerMessages = msgs.map(m => ({
        body: (m.body || "").replace(/<[^>]*>/g, "").substring(0, 300), // strip HTML, limit length
        from: m.user?.name || m.user?.email || "Unknown",
        date: m.created_at,
        channel: m.conversation?.category?.name || "Unknown",
        subject: m.conversation?.subject || "",
      })).filter(m => m.body.trim().length > 10); // skip empty/short

      // Paginate if needed (up to 3 pages)
      let page = 2;
      let pageCount = msgsRes.data.page_count || 1;
      while (page <= Math.min(pageCount, 3)) {
        try {
          const nextPage = await axios.get(`${base}/messages`, {
            auth, headers,
            params: { filter: "customer", start_date: fmt(weekAgo), end_date: fmt(now), page }
          });
          const moreMsgs = (nextPage.data.messages || []).map(m => ({
            body: (m.body || "").replace(/<[^>]*>/g, "").substring(0, 300),
            from: m.user?.name || m.user?.email || "Unknown",
            date: m.created_at,
            channel: m.conversation?.category?.name || "Unknown",
            subject: m.conversation?.subject || "",
          })).filter(m => m.body.trim().length > 10);
          allCustomerMessages = allCustomerMessages.concat(moreMsgs);
          pageCount = nextPage.data.page_count || pageCount;
          page++;
        } catch (e) { break; }
      }

      console.log(`[Re:amaze] Fetched ${allCustomerMessages.length} customer messages (7d)`);
    } catch (e) {
      console.log(`[Re:amaze] Message fetch error: ${e.response?.data?.error || e.message}`);
    }

    return {
      source: "reamaze",
      daily: {
        totalConversations: yesterdayConvos.length,
        byChannel: yesterdayByChannel,
        byTag: yesterdayByTag,
        unassigned: yesterdayUnassigned.length,
        unassignedList: yesterdayUnassigned.slice(0, 5),
        recentSubjects,
      },
      weekly: {
        totalConversations: weekConvos.length,
        byChannel: weekByChannel,
        byTag: weekByTag,
        topIssues,
        dailyAvg: Math.round((weekConvos.length / 7) * 10) / 10,
      },
      open: {
        total: openConvos.length,
        byAge: openByAge,
        unassigned: openUnassigned.length,
        unassignedList: openUnassigned.slice(0, 5),
      },
      satisfaction: {
        avgRating,
        totalRatings: ratings.length,
        distribution: ratingDist,
      },
      customerMessages: allCustomerMessages,
    };
  } catch (err) {
    console.error("[Re:amaze] Error:", err.response?.data || err.message);
    return { source: "reamaze", error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// META BUSINESS INBOX (Facebook + Instagram DMs)
// ═══════════════════════════════════════════════════════════
async function getMetaInboxData(pageId, accessToken) {
  const base = `https://graph.facebook.com/v21.0`;
  
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(0,0,0,0);
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);

  console.log("[Meta Inbox] Fetching conversations...");

  try {
    // Get conversations from page (includes FB Messenger + IG DMs if connected)
    const convosRes = await axios.get(`${base}/${pageId}/conversations`, {
      params: {
        access_token: accessToken,
        fields: "id,updated_time,message_count,snippet,link",
        limit: 100,
      }
    });

    const allConvos = convosRes.data.data || [];
    
    // Filter by date
    const yesterdayConvos = allConvos.filter(c => new Date(c.updated_time) >= yesterday);
    const weekConvos = allConvos.filter(c => new Date(c.updated_time) >= weekAgo);

    console.log(`[Meta Inbox] Total: ${allConvos.length}, Yesterday: ${yesterdayConvos.length}, Week: ${weekConvos.length}`);

    // Get message details for yesterday's conversations
    const recentMessages = [];
    for (const convo of yesterdayConvos.slice(0, 10)) {
      try {
        const msgRes = await axios.get(`${base}/${convo.id}/messages`, {
          params: {
            access_token: accessToken,
            fields: "message,from,created_time",
            limit: 5,
          }
        });
        const msgs = msgRes.data.data || [];
        const customerMsgs = msgs.filter(m => m.from?.id !== pageId);
        if (customerMsgs.length > 0) {
          recentMessages.push({
            snippet: customerMsgs[0].message?.substring(0, 200),
            from: customerMsgs[0].from?.name,
            time: customerMsgs[0].created_time,
          });
        }
      } catch (e) { /* skip individual failures */ }
    }

    return {
      source: "meta_inbox",
      daily: {
        conversations: yesterdayConvos.length,
        messages: recentMessages,
      },
      weekly: {
        conversations: weekConvos.length,
      },
    };
  } catch (err) {
    console.error("[Meta Inbox] Error:", err.response?.data?.error?.message || err.message);
    return { source: "meta_inbox", error: err.response?.data?.error?.message || err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// COMBINED CUSTOMER SERVICE DATA
// ═══════════════════════════════════════════════════════════
async function getCustomerServiceData(csConfig, businessName) {
  console.log(`[CS/${businessName}] Collecting customer service data...`);

  const results = {};

  // Re:amaze
  if (csConfig.reamaze?.brand && csConfig.reamaze?.email && csConfig.reamaze?.apiToken) {
    results.reamaze = await getReamazeData(csConfig.reamaze.brand, csConfig.reamaze.email, csConfig.reamaze.apiToken);
  }

  // Meta Business Inbox
  if (csConfig.meta?.pageId && csConfig.meta?.accessToken) {
    results.metaInbox = await getMetaInboxData(csConfig.meta.pageId, csConfig.meta.accessToken);
  }

  // Combine totals
  const reamaze = results.reamaze || {};
  const meta = results.metaInbox || {};

  const combined = {
    source: "customer_service",
    business: businessName,
    
    daily: {
      totalTickets: (reamaze.daily?.totalConversations || 0) + (meta.daily?.conversations || 0),
      reamaze: reamaze.daily || {},
      metaInbox: meta.daily || {},
    },
    
    weekly: {
      totalTickets: (reamaze.weekly?.totalConversations || 0) + (meta.weekly?.conversations || 0),
      reamaze: reamaze.weekly || {},
      metaInbox: meta.weekly || {},
    },
    
    open: reamaze.open || { total: 0 },
    satisfaction: reamaze.satisfaction || {},
    
    // For AI analysis
    recentSubjects: reamaze.daily?.recentSubjects || [],
    topIssues: reamaze.weekly?.topIssues || [],
    customerMessages: reamaze.customerMessages || [],
  };

  console.log(`[CS/${businessName}] Complete. Daily: ${combined.daily.totalTickets} tickets, Open: ${combined.open.total}, Weekly: ${combined.weekly.totalTickets}`);

  return combined;
}

module.exports = { getCustomerServiceData };
