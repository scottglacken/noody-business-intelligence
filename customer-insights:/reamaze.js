/**
 * Re:amaze Data Connector
 * ========================
 * Pulls conversations and customer messages from all channels:
 * - Instagram DMs (origin: 19)
 * - Facebook Messenger (origin: 3)
 * - Email (origin: 1)
 * - Website Chat (origin: 0)
 * - Contact Form (origin: 17)
 *
 * Re:amaze centralizes all these channels, so we only need one API.
 */

const config = require('../config');

const AUTH = Buffer.from(`${config.reamaze.email}:${config.reamaze.apiToken}`).toString('base64');

const HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Authorization': `Basic ${AUTH}`,
};

/**
 * Fetch all conversations within a date range
 */
async function fetchConversations(startDate, endDate, filter = 'all') {
  const conversations = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      filter,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      page: page.toString(),
    });

    const url = `${config.reamaze.baseUrl}/conversations?${params}`;
    console.log(`  [Re:amaze] Fetching conversations page ${page}...`);

    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('  [Re:amaze] Rate limited, waiting 10s...');
        await sleep(10000);
        continue;
      }
      throw new Error(`Re:amaze API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const batch = data.conversations || [];
    conversations.push(...batch);

    console.log(`  [Re:amaze] Page ${page}: ${batch.length} conversations (total: ${conversations.length})`);

    // Check if there are more pages
    if (batch.length < (data.page_size || 30)) {
      hasMore = false;
    } else {
      page++;
      await sleep(500); // Rate limit courtesy
    }
  }

  return conversations;
}

/**
 * Fetch customer messages within a date range
 */
async function fetchMessages(startDate, endDate) {
  const messages = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      filter: 'customer',  // Only customer messages, not staff replies
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      page: page.toString(),
    });

    const url = `${config.reamaze.baseUrl}/messages?${params}`;
    console.log(`  [Re:amaze] Fetching messages page ${page}...`);

    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('  [Re:amaze] Rate limited, waiting 10s...');
        await sleep(10000);
        continue;
      }
      throw new Error(`Re:amaze API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const batch = data.messages || [];
    messages.push(...batch);

    console.log(`  [Re:amaze] Page ${page}: ${batch.length} messages (total: ${messages.length})`);

    if (batch.length < (data.page_size || 30)) {
      hasMore = false;
    } else {
      page++;
      await sleep(500);
    }
  }

  return messages;
}

/**
 * Fetch satisfaction ratings
 */
async function fetchSatisfactionRatings(startDate, endDate) {
  try {
    const params = new URLSearchParams({
      updated_after: startDate.toISOString(),
    });

    const url = `${config.reamaze.baseUrl}/satisfaction_ratings?${params}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) return [];

    const data = await response.json();
    return data.satisfaction_ratings || [];
  } catch (err) {
    console.log('  [Re:amaze] Could not fetch satisfaction ratings:', err.message);
    return [];
  }
}

/**
 * Main data collection function
 */
async function collectReamazeData(startDate, endDate) {
  console.log('  [Re:amaze] Connecting...');

  // Fetch conversations and messages in parallel
  const [conversations, messages, ratings] = await Promise.all([
    fetchConversations(startDate, endDate),
    fetchMessages(startDate, endDate),
    fetchSatisfactionRatings(startDate, endDate),
  ]);

  // ─── Process and categorize ───

  // Channel breakdown (from message origins)
  const byChannel = {};
  const channelMessages = {};

  messages.forEach(msg => {
    const originCode = msg.origin;
    const channelName = config.channelOrigins[originCode] || `Unknown (${originCode})`;
    byChannel[channelName] = (byChannel[channelName] || 0) + 1;

    if (!channelMessages[channelName]) channelMessages[channelName] = [];
    channelMessages[channelName].push({
      body: stripHtml(msg.body || ''),
      createdAt: msg.created_at,
      user: msg.user?.name || msg.user?.email || 'Unknown',
      conversationSubject: msg.conversation?.subject || 'No subject',
      category: msg.conversation?.category?.name || 'General',
    });
  });

  // Conversation status breakdown
  const byStatus = {};
  conversations.forEach(conv => {
    const statusCode = conv.status;
    const statusName = config.conversationStatuses[statusCode] || `Unknown (${statusCode})`;
    byStatus[statusName] = (byStatus[statusName] || 0) + 1;
  });

  // Tag breakdown
  const byTag = {};
  conversations.forEach(conv => {
    (conv.tag_list || []).forEach(tag => {
      byTag[tag] = (byTag[tag] || 0) + 1;
    });
  });

  // Unresolved/open conversations
  const unresolvedConversations = conversations
    .filter(c => c.status === 0)
    .map(c => ({
      subject: c.subject,
      author: c.author?.name || c.author?.email || 'Unknown',
      createdAt: c.created_at,
      tags: c.tag_list || [],
      channel: config.channelOrigins[c.category?.channel] || 'Unknown',
      lastCustomerMessage: c.last_customer_message?.body ? stripHtml(c.last_customer_message.body) : null,
    }));

  // Satisfaction ratings summary
  const ratingsSummary = {
    total: ratings.length,
    average: ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length).toFixed(1)
      : 'N/A',
    breakdown: {},
  };
  ratings.forEach(r => {
    const score = r.rating || 0;
    ratingsSummary.breakdown[score] = (ratingsSummary.breakdown[score] || 0) + 1;
  });

  // Build message samples for AI analysis (limit to prevent token overflow)
  const messageSamples = messages
    .filter(m => m.body && stripHtml(m.body).length > 10)
    .slice(0, 200) // Cap at 200 messages for AI
    .map(m => ({
      body: stripHtml(m.body).substring(0, 500), // Truncate long messages
      origin: config.channelOrigins[m.origin] || 'Unknown',
      date: m.created_at,
      subject: m.conversation?.subject || '',
      category: m.conversation?.category?.name || '',
    }));

  return {
    totalMessages: messages.length,
    totalConversations: conversations.length,
    byChannel,
    channelMessages,
    byStatus,
    byTag,
    unresolvedConversations,
    ratingsSummary,
    messageSamples,
    dateRange: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
  };
}

// ─── Helpers ───

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { collectReamazeData };
