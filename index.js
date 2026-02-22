// index.js — Main Orchestrator (REWRITE Feb 2026)
// Multi-channel report routing:
//   - Daily summary → #noody-daily
//   - Shopify detail → #noody-ecommerce
//   - Meta/Google Ads → #noody-ppc
//   - Klaviyo → #noody-marketing
//   - Social → #noody-social
//   - Xero → #noody-finance

require("dotenv").config();
const cron = require("node-cron");
const config = require("./config.js");

const { getShopifyData } = require("./connectors/shopify");
const { getMetaData } = require("./connectors/meta");
const { getGoogleAdsData, getGA4Data } = require("./connectors/google");
const { getKlaviyoData } = require("./connectors/klaviyo");
const { getXeroData } = require("./connectors/xero");
const { getUnleashedData } = require("./connectors/unleashed");
const { getSocialData } = require("./connectors/social-cs");
const { getCustomerServiceData } = require("./connectors/customer-service");

const { analyzeBusinessData } = require("./utils/analyzer");
const { sendSlackReport } = require("./utils/slack-delivery");
const { sendEmailReport } = require("./utils/email-delivery");
const { sendSocialReport } = require("./utils/social-report");
const { sendEcommerceReport } = require("./utils/ecommerce-report");
const { sendPPCReport } = require("./utils/ppc-report");
const { sendMarketingReport } = require("./utils/marketing-report");
const { sendFinanceReport } = require("./utils/finance-report");
const { sendCSReport, sendCSWeeklyReport } = require("./utils/cs-report");

// ─────────────────────────────────────────────────────────────
// COLLECT ALL DATA
// ─────────────────────────────────────────────────────────────
async function collectData(businessKey) {
  const businessName = config.businesses[businessKey]?.name || businessKey;
  console.log(`\n[${businessName}] Starting data collection...`);

  const collectors = [];

  // Shopify
  if (config.shopify[businessKey]?.storeName) {
    const sc = config.shopify[businessKey];
    if (sc.clientId && sc.clientSecret) {
      collectors.push(getShopifyData(sc.storeName, sc.clientId, sc.clientSecret, businessName)
        .catch(err => ({ source: "shopify", error: err.message })));
    } else if (sc.accessToken) {
      collectors.push(getShopifyData(sc.storeName, sc.accessToken, null, businessName)
        .catch(err => ({ source: "shopify", error: err.message })));
    }
  }

  // Meta Ads
  if (config.meta?.accessToken && config.meta[`${businessKey}AdAccountId`]) {
    collectors.push(getMetaData(config.meta.accessToken, config.meta[`${businessKey}AdAccountId`], businessName)
      .catch(err => ({ source: "meta_ads", error: err.message })));
  }

  // Google Ads
  if (config.googleAds?.developerToken && config.googleAds[`${businessKey}CustomerId`]) {
    collectors.push(getGoogleAdsData(config.googleAds, config.googleAds[`${businessKey}CustomerId`], businessName)
      .catch(err => ({ source: "google_ads", error: err.message })));
  }

  // GA4
  if (config.analytics?.credentials && config.analytics[`${businessKey}PropertyId`]) {
    collectors.push(getGA4Data(config.analytics.credentials, config.analytics[`${businessKey}PropertyId`], businessName)
      .catch(err => ({ source: "ga4", error: err.message })));
  }

  // Klaviyo (Noody only)
  if (businessKey === "noody" && config.klaviyo?.apiKey) {
    collectors.push(getKlaviyoData(config.klaviyo.apiKey)
      .catch(err => ({ source: "klaviyo", error: err.message })));
  }

  // Xero
  if (config.xero?.clientId && config.xero[`${businessKey}TenantId`]) {
    collectors.push(getXeroData(config.xero.clientId, config.xero.clientSecret, config.xero.refreshToken, config.xero[`${businessKey}TenantId`], businessName)
      .catch(err => ({ source: "xero", error: err.message })));
  }

  // Unleashed (Noody only)
  if (businessKey === "noody" && config.unleashed?.apiId) {
    collectors.push(getUnleashedData(config.unleashed.apiId, config.unleashed.apiKey)
      .catch(err => ({ source: "unleashed", error: err.message })));
  }

  // Social Media
  if (businessKey === "noody") {
    const socialConfig = {};
    if (config.social?.instagram?.noodyAccountId && config.social?.instagram?.accessToken) {
      socialConfig.instagram = { accountId: config.social.instagram.noodyAccountId, accessToken: config.social.instagram.accessToken };
    }
    if (config.social?.facebook?.noodyPageId && config.social?.facebook?.accessToken) {
      socialConfig.facebook = { pageId: config.social.facebook.noodyPageId, accessToken: config.social.facebook.accessToken };
    }
    if (socialConfig.instagram || socialConfig.facebook) {
      collectors.push(getSocialData(socialConfig, businessName)
        .catch(err => ({ source: "social", error: err.message })));
    }

    // Customer Service (Re:amaze + Meta Inbox)
    if (config.customerService?.reamaze?.brand || config.customerService?.meta?.pageId) {
      collectors.push(getCustomerServiceData(config.customerService, businessName)
        .catch(err => ({ source: "customer_service", error: err.message })));
    }
  }

  const results = await Promise.allSettled(collectors);
  const data = results.map(r => r.status === "fulfilled" ? r.value : { error: r.reason?.message });

  const successful = data.filter(d => !d.error).length;
  const failed = data.filter(d => d.error).length;
  console.log(`[${businessName}] Collected ${successful} data sources successfully, ${failed} failed`);
  if (failed > 0) {
    data.filter(d => d.error).forEach(d => console.warn(`  ⚠️  ${d.source || "unknown"}: ${d.error}`));
  }

  return data;
}

// ─────────────────────────────────────────────────────────────
// RUN FULL REPORT
// ─────────────────────────────────────────────────────────────
async function runBusinessReport(businessKey) {
  const businessName = config.businesses[businessKey]?.name || businessKey;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const reportDate = yesterday.toLocaleDateString("en-NZ", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: config.schedule.timezone,
  });

  try {
    const data = await collectData(businessKey);

    // AI Analysis
    console.log(`[${businessName}] Running AI analysis...`);
    const analysis = await analyzeBusinessData(data, config, businessName, reportDate);

    if (analysis.error) {
      console.error(`[${businessName}] AI analysis failed:`, analysis.error);
      // Continue anyway — send department reports even without AI
    }

    const deliveries = [];
    const slackToken = config.slack?.botToken;

    // Helper to find data sources
    const findSource = (name) => data.find(d => d.source === name && !d.error);

    // ── 1. DAILY SUMMARY → main channel ──────────────────────
    const dailyChannel = config.slack?.channels?.[`${businessKey}Daily`] || config.slack?.channels?.combined;
    if (slackToken && dailyChannel && !analysis.error) {
      deliveries.push(
        sendSlackReport(slackToken, dailyChannel, analysis, data, businessName, reportDate)
          .catch(err => console.error(`[Slack/Daily] Failed:`, err.message))
      );
    }

    // ── 2. ECOMMERCE → #noody-ecommerce ─────────────────────
    const shopifyData = findSource("shopify");
    if (slackToken && config.slack?.channels?.ecommerce && shopifyData) {
      deliveries.push(
        sendEcommerceReport(slackToken, config.slack.channels.ecommerce, shopifyData, businessName, reportDate)
          .catch(err => console.error(`[Slack/Ecommerce] Failed:`, err.message))
      );
    }

    // ── 3. PPC → #noody-ppc ─────────────────────────────────
    const metaData = findSource("meta_ads");
    const googleAdsData = findSource("google_ads");
    if (slackToken && config.slack?.channels?.ppc && (metaData || googleAdsData)) {
      deliveries.push(
        sendPPCReport(slackToken, config.slack.channels.ppc, metaData, googleAdsData, businessName, reportDate)
          .catch(err => console.error(`[Slack/PPC] Failed:`, err.message))
      );
    }

    // ── 4. MARKETING → #noody-marketing ─────────────────────
    const klaviyoData = findSource("klaviyo");
    if (slackToken && config.slack?.channels?.marketing && klaviyoData) {
      deliveries.push(
        sendMarketingReport(slackToken, config.slack.channels.marketing, klaviyoData, businessName, reportDate)
          .catch(err => console.error(`[Slack/Marketing] Failed:`, err.message))
      );
    }

    // ── 5. SOCIAL → #noody-social ───────────────────────────
    const socialData = data.find(d => d.source === "social" && !d.error) || data.find(d => d.source === "instagram" && !d.error);
    if (slackToken && config.slack?.channels?.social && socialData) {
      deliveries.push(
        sendSocialReport(slackToken, config.slack.channels.social, socialData, businessName, reportDate)
          .catch(err => console.error(`[Slack/Social] Failed:`, err.message))
      );
    }

    // ── 6. FINANCE → #noody-finance ─────────────────────────
    const xeroData = findSource("xero");
    if (slackToken && config.slack?.channels?.finance && xeroData) {
      deliveries.push(
        sendFinanceReport(slackToken, config.slack.channels.finance, xeroData, businessName, reportDate)
          .catch(err => console.error(`[Slack/Finance] Failed:`, err.message))
      );
    }

    // ── 7. CUSTOMER SERVICE → #noody-cs ─────────────────────
    const csData = findSource("customer_service");
    if (slackToken && config.slack?.channels?.cs && csData) {
      // Daily report every day
      deliveries.push(
        sendCSReport(slackToken, config.slack.channels.cs, csData, businessName, reportDate, config.anthropic)
          .catch(err => console.error(`[Slack/CS] Failed:`, err.message))
      );
      // Weekly report on Mondays (or force with --weekly-cs flag)
      const dayOfWeek = new Date().getDay();
      const forceWeekly = process.argv.includes("--weekly-cs");
      if (dayOfWeek === 1 || forceWeekly) {
        deliveries.push(
          sendCSWeeklyReport(slackToken, config.slack.channels.cs, csData, businessName, config.anthropic)
            .catch(err => console.error(`[Slack/CS Weekly] Failed:`, err.message))
        );
      }
    }

    // ── 8. EMAIL ────────────────────────────────────────────
    if (config.email?.apiKey && config.email.recipients?.length > 0 && !analysis.error) {
      deliveries.push(
        sendEmailReport(config.email, analysis, data, businessName, reportDate)
          .catch(err => console.error(`[Email] Failed:`, err.message))
      );
    }

    await Promise.allSettled(deliveries);
    console.log(`✅ [${businessName}] Report delivered successfully`);
    return true;

  } catch (err) {
    console.error(`❌ [${businessName}] Report failed:`, err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
async function runAllReports() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 Business Intelligence System — ${new Date().toLocaleString()}`);
  console.log(`${"=".repeat(60)}`);

  const results = await Promise.allSettled([
    runBusinessReport("noody"),
    runBusinessReport("facialist"),
  ]);

  const passed = results.filter(r => r.value === true).length;
  console.log(`\n📊 Reports complete: ${passed}/${results.length} successful\n`);
}

const args = process.argv.slice(2);
if (args.includes("--schedule")) {
  console.log(`⏰ Scheduled mode: ${config.schedule.dailyReport} (${config.schedule.timezone})`);
  cron.schedule(config.schedule.dailyReport, runAllReports, { timezone: config.schedule.timezone });
  runAllReports();
} else if (args.includes("--business")) {
  const businessKey = args[args.indexOf("--business") + 1];
  runBusinessReport(businessKey).then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  runAllReports().then(() => { if (!args.includes("--keep-alive")) process.exit(0); }).catch(() => process.exit(1));
}
