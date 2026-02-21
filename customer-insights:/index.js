/**
 * Noody Customer Insights Engine
 * ================================
 * Pulls all customer messages from Re:amaze (Instagram DMs, Facebook Messenger,
 * Email, Website Chat, Contact Form), analyzes with Claude AI, and delivers
 * actionable insights to Slack + Email.
 *
 * Trigger: Manual via GitHub Actions workflow_dispatch
 * Data Source: Re:amaze API (centralizes all messaging channels)
 * AI Analysis: Claude (Anthropic API)
 * Delivery: Slack + Email (Resend)
 */

const { collectReamazeData } = require('./connectors/reamaze');
const { analyzeWithClaude } = require('./utils/analyzer');
const { sendToSlack } = require('./utils/slack-delivery');
const { sendEmail } = require('./utils/email-delivery');
const config = require('./config');

async function run() {
  const startTime = Date.now();
  console.log('🔍 Noody Customer Insights Engine');
  console.log('==================================');
  console.log(`Started: ${new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}`);

  // Parse date range from environment or default to last 7 days
  const daysBack = parseInt(process.env.DAYS_BACK || '7', 10);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  console.log(`\n📅 Analyzing messages from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${daysBack} days)\n`);

  try {
    // ─── Step 1: Collect all customer messages from Re:amaze ───
    console.log('[Step 1] Collecting Re:amaze data...');
    const reamazeData = await collectReamazeData(startDate, endDate);

    if (!reamazeData || reamazeData.totalMessages === 0) {
      console.log('⚠️  No customer messages found in the date range.');
      const noDataMsg = `📭 *Noody Customer Insights* — No customer messages found for the last ${daysBack} days.`;
      await sendToSlack(noDataMsg);
      return;
    }

    console.log(`✅ Collected ${reamazeData.totalMessages} messages across ${reamazeData.totalConversations} conversations`);
    console.log(`   Channels: ${Object.entries(reamazeData.byChannel).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

    // ─── Step 2: AI Analysis with Claude ───
    console.log('\n[Step 2] Analyzing with Claude AI...');
    const analysis = await analyzeWithClaude(reamazeData, daysBack);
    console.log('✅ AI analysis complete');

    // ─── Step 3: Deliver to Slack ───
    console.log('\n[Step 3] Delivering to Slack...');
    await sendToSlack(analysis.slackMessage);
    console.log('✅ Slack delivery complete');

    // ─── Step 4: Deliver via Email ───
    console.log('\n[Step 4] Delivering via Email...');
    await sendEmail(analysis.emailHtml, daysBack);
    console.log('✅ Email delivery complete');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ Customer Insights Engine complete in ${elapsed}s`);

  } catch (error) {
    console.error('❌ Error:', error.message);

    // Try to notify Slack about the error
    try {
      await sendToSlack(`❌ *Customer Insights Engine Error*\n\`\`\`${error.message}\`\`\``);
    } catch (slackErr) {
      console.error('Failed to send error to Slack:', slackErr.message);
    }

    process.exit(1);
  }
}

run();
