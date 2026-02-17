// index.js — Main Orchestrator
// Run this file daily via cron, GitHub Actions, or Railway
// Usage: node index.js
// Or scheduled: node index.js --schedule

require("dotenv").config();
const cron = require("node-cron");
const config = require("./config.js");

const { getShopifyData } = require("./connectors/shopify");
const { getMetaData } = require("./connectors/meta");
const { getGoogleAdsData, getGA4Data } = require("./connectors/google");
const { getKlaviyoData } = require("./connectors/klaviyo");
const { getXeroData } = require("./connectors/xero");
const { getUnleashedData } = require("./connectors/unleashed");
const { getCustomerServiceData, getSocialData } = require("./connectors/social-cs");

const { analyzeBusinessData } = require("./utils/analyzer");
const { sendSlackReport } = require("./utils/slack-delivery");
const { sendEmailReport } = require("./utils/email-delivery");

// ─────────────────────────────────────────────────────────────
// COLLECT ALL DATA FOR ONE BUSINESS
// ─────────────────────────────────────────────────────────────
async function collectData(businessKey) {
  const businessName = config.businesses[businessKey]?.name || businessKey;
  console.log(`\n[${businessName}] Starting data collection...`);

  const collectors = [];

  // Shopify
  if (config.shopify[businessKey]?.storeName && config.shopify[businessKey]?.accessToken) {
    collectors.push(
      getShopifyData(
        config.shopify[businessKey].storeName,
        config.shopify[businessKey].accessToken,
        businessName
      ).catch(err => ({ source: "shopify", error: err.message }))
    );
  }

  // Meta Ads
  if (config.meta?.accessToken && config.meta[`${businessKey}AdAccountId`]) {
    collectors.push(
      getMetaData(
        config.meta.accessToken,
        config.meta[`${businessKey}AdAccountId`],
        businessName
      ).catch(err => ({ source: "meta_ads", error: err.message }))
    );
  }

  // Google Ads
  if (config.googleAds?.developerToken && config.googleAds[`${businessKey}CustomerId`]) {
    collectors.push(
      getGoogleAdsData(
        config.googleAds,
        config.googleAds[`${businessKey}CustomerId`],
        businessName
      ).catch(err => ({ source: "google_ads", error: err.message }))
    );
  }

  // GA4
  if (config.analytics?.credentials && config.analytics[`${businessKey}PropertyId`]) {
    collectors.push(
      getGA4Data(
        config.analytics.credentials,
        config.analytics[`${businessKey}PropertyId`],
        businessName
      ).catch(err => ({ source: "ga4", error: err.message }))
    );
  }

  // Klaviyo (Noody only)
  if (businessKey === "noody" && config.klaviyo?.apiKey) {
    collectors.push(
      getKlaviyoData(config.klaviyo.apiKey)
        .catch(err => ({ source: "klaviyo", error: err.message }))
    );
  }

  // Xero
  if (config.xero?.clientId && config.xero[`${businessKey}TenantId`]) {
    collectors.push(
      getXeroData(
        config.xero.clientId,
        config.xero.clientSecret,
        config.xero.refreshToken,
        config.xero[`${businessKey}TenantId`],
        businessName
      ).catch(err => ({ source: "xero", error: err.message }))
    );
  }

  // Unleashed (Noody only)
  if (businessKey === "noody" && config.unleashed?.apiId) {
    collectors.push(
      getUnleashedData(config.unleashed.apiId, config.unleashed.apiKey)
        .catch(err => ({ source: "unleashed", error: err.message }))
    );
  }

  // Customer Service
  if (config.customerService?.apiKey) {
    collectors.push(
      getCustomerServiceData(config.customerService)
        .catch(err => ({ source: "customer_service", error: err.message }))
    );
  }

  // Instagram
  if (config.social?.instagram?.noodyAccountId && config.social?.instagram?.accessToken && businessKey === "noody") {
    collectors.push(
      getSocialData(
        config.social.instagram.noodyAccountId,
        config.social.instagram.accessToken,
        businessName
      ).catch(err => ({ source: "instagram", error: err.message }))
    );
  }

  // Run all collectors in parallel
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
// RUN FULL REPORT FOR ONE BUSINESS
// ─────────────────────────────────────────────────────────────
async function runBusinessReport(businessKey) {
  const businessName = config.businesses[businessKey]?.name || businessKey;
  const dateStr = new Date().toLocaleDateString("en-NZ", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: config.schedule.timezone
  });

  try {
    // Step 1: Collect all data in parallel
    const data = await collectData(businessKey);

    // Step 2: AI Analysis
    console.log(`[${businessName}] Running AI analysis...`);
    const analysis = await analyzeBusinessData(data, config, businessName);

    if (analysis.error) {
      console.error(`[${businessName}] AI analysis failed:`, analysis.error);
      return false;
    }

    // Step 3: Deliver reports
    const deliveries = [];

    // Slack
    if (config.slack?.botToken) {
      const channelId = config.slack.channels[`${businessKey}Daily`] || config.slack.channels.combined;
      if (channelId) {
        deliveries.push(
          sendSlackReport(config.slack.botToken, channelId, analysis, data, businessName, dateStr)
            .catch(err => console.error(`[Slack/${businessName}] Failed:`, err.message))
        );
      }
    }

    // Combined channel
    if (config.slack?.channels?.combined && config.slack.channels.combined !== config.slack.channels[`${businessKey}Daily`]) {
      deliveries.push(
        sendSlackReport(config.slack.botToken, config.slack.channels.combined, analysis, data, businessName, dateStr)
          .catch(err => console.error(`[Slack/Combined] Failed:`, err.message))
      );
    }

    // Email
    if (config.email?.apiKey && config.email.recipients?.length > 0) {
      deliveries.push(
        sendEmailReport(config.email, analysis, data, businessName, dateStr)
          .catch(err => console.error(`[Email/${businessName}] Failed:`, err.message))
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
// RUN ALL BUSINESSES
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

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--schedule")) {
  // Run on schedule (7am Auckland time daily)
  console.log(`⏰ Scheduled mode: running at ${config.schedule.dailyReport} (${config.schedule.timezone})`);
  cron.schedule(config.schedule.dailyReport, runAllReports, { timezone: config.schedule.timezone });
  // Also run immediately on start
  runAllReports();
} else if (args.includes("--business")) {
  // Run for specific business: node index.js --business noody
  const businessKey = args[args.indexOf("--business") + 1];
  runBusinessReport(businessKey).then(process.exit);
} else {
  // Run once immediately
  runAllReports().then(() => {
    if (!args.includes("--keep-alive")) process.exit(0);
  });
}
