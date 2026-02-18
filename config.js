// ============================================================
// DAILY BUSINESS INTELLIGENCE SYSTEM - Configuration
// ============================================================
// Copy this file to config.local.js and fill in your real values
// Never commit config.local.js to version control

console.log('[DEBUG] Environment check:', {
  SHOPIFY_NOODY_CLIENT_ID: process.env.SHOPIFY_NOODY_CLIENT_ID ? 'SET' : 'NOT SET',
  SHOPIFY_NOODY_CLIENT_SECRET: process.env.SHOPIFY_NOODY_CLIENT_SECRET ? 'SET' : 'NOT SET'
});

module.exports = {

  // ── BUSINESS SETTINGS ─────────────────────────────────────
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
    }
  },

  // ── REPORTING SCHEDULE ────────────────────────────────────
  schedule: {
    // Cron format: "0 7 * * *" = 7am every day
    dailyReport: "0 7 * * *",
    timezone: "Pacific/Auckland",
  },

  // ── SHOPIFY ──────────────────────────────────────────────
  shopify: {
    noody: {
      storeName: process.env.SHOPIFY_NOODY_STORE,
      // New 2026 method: Client ID + Secret (from Dev Dashboard)
      clientId: process.env.SHOPIFY_NOODY_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_NOODY_CLIENT_SECRET,
      // Old method (deprecated Jan 2026): Direct access token
      accessToken: process.env.SHOPIFY_NOODY_TOKEN,
    },
    facialist: {
      storeName: process.env.SHOPIFY_FACIALIST_STORE,
      clientId: process.env.SHOPIFY_FACIALIST_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_FACIALIST_CLIENT_SECRET,
      accessToken: process.env.SHOPIFY_FACIALIST_TOKEN,
    }
  },

  // ── META ADS ─────────────────────────────────────────────
  meta: {
    accessToken: process.env.META_ACCESS_TOKEN,
    noodyAdAccountId: process.env.META_NOODY_AD_ACCOUNT,   // e.g. "act_123456789"
    facialistAdAccountId: process.env.META_FACIALIST_AD_ACCOUNT,
  },

  // ── GOOGLE ADS ───────────────────────────────────────────
  googleAds: {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    noodyCustomerId: process.env.GOOGLE_ADS_NOODY_CUSTOMER_ID,
    facialistCustomerId: process.env.GOOGLE_ADS_FACIALIST_CUSTOMER_ID,
  },

  // ── KLAVIYO ──────────────────────────────────────────────
  klaviyo: {
    apiKey: process.env.KLAVIYO_API_KEY,
  },

  // ── XERO ─────────────────────────────────────────────────
  xero: {
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    refreshToken: process.env.XERO_REFRESH_TOKEN,
    noodyTenantId: process.env.XERO_NOODY_TENANT_ID,
    facialistTenantId: process.env.XERO_FACIALIST_TENANT_ID,
  },

  // ── UNLEASHED (Inventory) ────────────────────────────────
  unleashed: {
    apiId: process.env.UNLEASHED_API_ID,
    apiKey: process.env.UNLEASHED_API_KEY,
  },

  // ── CUSTOMER SERVICE (Gorgias / Zendesk / Freshdesk) ────
  customerService: {
    provider: "gorgias",  // options: "gorgias", "zendesk", "freshdesk", "reamaze"
    apiKey: process.env.CS_API_KEY,
    apiSecret: process.env.CS_API_SECRET,
    domain: process.env.CS_DOMAIN,  // e.g. "noody.gorgias.com"
  },

  // ── SOCIAL MEDIA ─────────────────────────────────────────
  social: {
    instagram: {
      noodyAccountId: process.env.IG_NOODY_ACCOUNT_ID,
      accessToken: process.env.IG_ACCESS_TOKEN,  // via Meta Graph API
    },
    facebook: {
      noodyPageId: process.env.FB_NOODY_PAGE_ID,
      accessToken: process.env.FB_ACCESS_TOKEN,
    }
  },

  // ── GOOGLE ANALYTICS (GA4) ───────────────────────────────
  analytics: {
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,  // path to service account JSON
    noodyPropertyId: process.env.GA4_NOODY_PROPERTY_ID,       // e.g. "properties/123456789"
    facialistPropertyId: process.env.GA4_FACIALIST_PROPERTY_ID,
  },

  // ── ANTHROPIC (Claude AI Analysis) ──────────────────────
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-opus-4-5-20251101",
  },

  // ── SLACK ────────────────────────────────────────────────
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    channels: {
      noodyDaily: process.env.SLACK_NOODY_CHANNEL,        // e.g. "#noody-daily-report"
      facialistDaily: process.env.SLACK_FACIALIST_CHANNEL,
      combined: process.env.SLACK_COMBINED_CHANNEL,        // e.g. "#business-intelligence"
    }
  },

  // ── EMAIL ────────────────────────────────────────────────
  email: {
    provider: "sendgrid",  // options: "sendgrid", "mailgun", "smtp"
    apiKey: process.env.SENDGRID_API_KEY,
    fromAddress: process.env.EMAIL_FROM,
    recipients: (process.env.EMAIL_RECIPIENTS || "").split(","),
  },

  // ── BENCHMARKS (used for AI analysis context) ────────────
  benchmarks: {
    meta: {
      ctr: { poor: 0.5, average: 1.0, good: 2.0 },
      roas: { poor: 1.5, average: 3.0, good: 5.0 },
      cpc: { poor: 3.0, average: 1.5, good: 0.8 },  // NZD
    },
    email: {
      openRate: { poor: 15, average: 25, good: 40 },
      clickRate: { poor: 1, average: 2.5, good: 5 },
    },
    customerService: {
      responseTimeHours: { poor: 24, average: 8, good: 2 },
      satisfactionScore: { poor: 3.5, average: 4.0, good: 4.5 },
    }
  }
};
