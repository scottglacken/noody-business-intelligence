// config.js — UPDATED Feb 2026
// Added: per-department Slack channels, ecommerce benchmarks

console.log("[DEBUG] Environment check:", {
  SHOPIFY_NOODY_CLIENT_ID: process.env.SHOPIFY_NOODY_CLIENT_ID ? "SET" : "NOT SET",
  SHOPIFY_NOODY_CLIENT_SECRET: process.env.SHOPIFY_NOODY_CLIENT_SECRET ? "SET" : "NOT SET",
  IG_NOODY_ACCOUNT_ID: process.env.IG_NOODY_ACCOUNT_ID ? "SET" : "NOT SET",
  FB_NOODY_PAGE_ID: process.env.FB_NOODY_PAGE_ID ? "SET" : "NOT SET",
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN ? "SET" : "NOT SET",
  KLAVIYO_API_KEY: process.env.KLAVIYO_API_KEY ? "SET" : "NOT SET",
});

module.exports = {

  businesses: {
    noody: {
      name: "Noody Skincare",
      currency: "NZD",
      timezone: "Pacific/Auckland",
      revenueTarget: { monthly: 83000 },
      profitMarginTarget: 0.30,
    },
    facialist: {
      name: "The Facialist",
      currency: "NZD",
      timezone: "Pacific/Auckland",
    },
  },

  schedule: {
    dailyReport: "0 7 * * *",
    timezone: "Pacific/Auckland",
  },

  shopify: {
    noody: {
      storeName: process.env.SHOPIFY_NOODY_STORE,
      clientId: process.env.SHOPIFY_NOODY_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_NOODY_CLIENT_SECRET,
      accessToken: process.env.SHOPIFY_NOODY_TOKEN,
    },
    facialist: {
      storeName: process.env.SHOPIFY_FACIALIST_STORE,
      clientId: process.env.SHOPIFY_FACIALIST_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_FACIALIST_CLIENT_SECRET,
      accessToken: process.env.SHOPIFY_FACIALIST_TOKEN,
    },
  },

  meta: {
    accessToken: process.env.META_ACCESS_TOKEN,
    noodyAdAccountId: process.env.META_NOODY_AD_ACCOUNT,
    facialistAdAccountId: process.env.META_FACIALIST_AD_ACCOUNT,
  },

  googleAds: {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    noodyCustomerId: process.env.GOOGLE_ADS_NOODY_CUSTOMER_ID,
    facialistCustomerId: process.env.GOOGLE_ADS_FACIALIST_CUSTOMER_ID,
  },

  klaviyo: {
    apiKey: process.env.KLAVIYO_API_KEY,
  },

  xero: {
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    refreshToken: process.env.XERO_REFRESH_TOKEN,
    noodyTenantId: process.env.XERO_NOODY_TENANT_ID,
    facialistTenantId: process.env.XERO_FACIALIST_TENANT_ID,
  },

  unleashed: {
    apiId: process.env.UNLEASHED_API_ID,
    apiKey: process.env.UNLEASHED_API_KEY,
  },

  customerService: {
    provider: "gorgias",
    apiKey: process.env.CS_API_KEY,
    apiSecret: process.env.CS_API_SECRET,
    domain: process.env.CS_DOMAIN,
  },

  social: {
    instagram: {
      noodyAccountId: process.env.IG_NOODY_ACCOUNT_ID,
      accessToken: process.env.IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN,
    },
    facebook: {
      noodyPageId: process.env.FB_NOODY_PAGE_ID,
      accessToken: process.env.FB_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN,
    },
  },

  analytics: {
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    noodyPropertyId: process.env.GA4_NOODY_PROPERTY_ID,
    facialistPropertyId: process.env.GA4_FACIALIST_PROPERTY_ID,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-sonnet-4-20250514",
  },

  // ── SLACK CHANNELS (multi-channel routing) ─────────────────
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    channels: {
      // Per-business daily summary
      noodyDaily: process.env.SLACK_NOODY_CHANNEL,
      facialistDaily: process.env.SLACK_FACIALIST_CHANNEL,
      combined: process.env.SLACK_COMBINED_CHANNEL,
      // Department-specific channels
      ecommerce: process.env.SLACK_ECOMMERCE_CHANNEL,    // Shopify detailed report
      ppc: process.env.SLACK_PPC_CHANNEL,                 // Meta + Google Ads
      marketing: process.env.SLACK_MARKETING_CHANNEL,     // Klaviyo email marketing
      social: process.env.SLACK_SOCIAL_CHANNEL,           // Instagram + Facebook
      finance: process.env.SLACK_FINANCE_CHANNEL,         // Xero cashflow
    },
  },

  email: {
    provider: "sendgrid",
    apiKey: process.env.SENDGRID_API_KEY,
    fromAddress: process.env.EMAIL_FROM,
    recipients: (process.env.EMAIL_RECIPIENTS || "").split(",").filter(Boolean),
  },

  benchmarks: {
    meta: {
      ctr: { poor: 0.5, average: 1.0, good: 2.0 },
      roas: { poor: 1.5, average: 3.0, good: 5.0 },
      cpc: { poor: 3.0, average: 1.5, good: 0.8 },
      frequency: { warning: 3.0, critical: 5.0 },
    },
    email: {
      openRate: { poor: 15, average: 25, good: 40 },
      clickRate: { poor: 1, average: 2.5, good: 5 },
      bounceRate: { good: 0.5, average: 2, poor: 5 },
      unsubscribeRate: { good: 0.1, average: 0.3, poor: 0.5 },
      revenuePerRecipient: { poor: 0.05, average: 0.15, good: 0.30 },
    },
    social: {
      instagramEngagement: { poor: 1, average: 2.5, good: 4 },
      followerGrowthMonthly: { poor: 1, average: 3, good: 5 },
    },
  },
};
