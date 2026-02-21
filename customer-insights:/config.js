/**
 * Configuration for Customer Insights Engine
 * Uses environment variables (set in GitHub Secrets)
 */

module.exports = {
  reamaze: {
    brand: process.env.REAMAZE_BRAND || 'noody',
    email: process.env.REAMAZE_EMAIL,
    apiToken: process.env.REAMAZE_API_TOKEN,
    baseUrl: `https://${process.env.REAMAZE_BRAND || 'noody'}.reamaze.io/api/v1`,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
  },

  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    channel: process.env.SLACK_INSIGHTS_CHANNEL || process.env.SLACK_CHANNEL || 'noody-customer-insights',
  },

  email: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'insights@noody.co.nz',
    to: (process.env.EMAIL_TO || '').split(',').map(e => e.trim()).filter(Boolean),
  },

  // Channel origin codes from Re:amaze API
  channelOrigins: {
    0: 'Website Chat',
    1: 'Email',
    2: 'Twitter',
    3: 'Facebook',
    6: 'Classic Chat',
    7: 'API',
    8: 'Instagram',
    9: 'SMS',
    10: 'Voice',
    11: 'Custom',
    15: 'WhatsApp',
    16: 'Staff Outbound',
    17: 'Contact Form',
    19: 'Instagram DM',
  },

  // Status codes from Re:amaze API
  conversationStatuses: {
    0: 'Unresolved',
    1: 'Pending',
    2: 'Resolved',
    3: 'Spam',
    4: 'Archived',
    5: 'On Hold',
    6: 'Auto-Resolved',
    7: 'Chatbot Assigned',
    8: 'Chatbot Resolved',
    9: 'AI Spam',
  },
};
