# 🧠 Daily Business Intelligence System
### Automated reporting for Noody Skincare & The Facialist

Pulls data from all your business tools every morning, runs AI analysis via Claude, 
and delivers a rich report to Slack + email before you start your day.

---

## 📊 What It Reports

### Noody Skincare
| Department | Source | Metrics |
|---|---|---|
| Revenue & Orders | Shopify | Daily revenue, orders, AOV, MTD, new customers, top products |
| Paid Advertising | Meta Ads | Spend, ROAS, CTR, CPC, purchases, campaign breakdown |
| Paid Search | Google Ads | Spend, ROAS, CTR, conversions by campaign |
| Website | GA4 | Sessions, users, conversion rate, cart rate, channels |
| Email Marketing | Klaviyo | Campaigns sent, list sizes, subscriber count |
| Financials | Xero | MTD P&L, profit margin, overdue invoices |
| Inventory | Unleashed | Stock levels, low stock alerts, pending orders |
| Customer Service | Gorgias | New tickets, response time, satisfaction, top issues |
| Social Media | Instagram | Reach, impressions, profile views, recent posts |

### The Facialist
| Department | Source | Metrics |
|---|---|---|
| Bookings/Revenue | Shopify | Daily revenue, appointments, AOV |
| Financials | Xero | MTD P&L, cashflow |
| Paid Ads | Meta + Google | Spend, ROAS, bookings |
| Website | GA4 | Traffic, conversion rate |

---

## 🚀 Quick Setup (3 Options)

### Option A: GitHub Actions (Recommended — Free, Reliable)
1. Push this code to a private GitHub repo
2. Go to Settings → Secrets → Add each variable from `.env.example`
3. The workflow runs automatically at 7am NZST daily
4. You can also trigger it manually from the Actions tab

### Option B: Railway.app ($5/month — Easy)
1. Create account at railway.app
2. Deploy from GitHub repo
3. Add environment variables in Railway dashboard
4. Railway handles the cron schedule

### Option C: Run Locally
```bash
# Install dependencies
npm install

# Copy and fill in your credentials
cp .env.example .env
nano .env

# Test run (runs once immediately)
npm start

# Run on schedule (stays running, fires at 7am daily)
npm run schedule

# Test just one business
npm run noody
npm run facialist
```

---

## 🔑 API Keys — Where to Get Them

### Shopify
1. Shopify Admin → Settings → Apps → Develop apps
2. Create app → Configure Admin API → Select scopes:
   - `read_orders`, `read_products`, `read_customers`, `read_analytics`
3. Install app → copy Access Token

### Meta Ads
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create App → Add "Marketing API" product
3. Generate User Access Token with `ads_read` permission
4. Get Ad Account ID from Ads Manager URL (`act_XXXXXXXXX`)
5. **Important**: Convert to long-lived token (60-day expiry) using the Token Debugger

### Google Ads
1. Google Cloud Console → Enable Google Ads API
2. Create OAuth2 credentials (Desktop app type)
3. Run OAuth flow to get refresh token
4. Apply for Developer Token in Google Ads Manager Account
5. Get Customer IDs from your Ads account (Settings → Account)

### Google Analytics (GA4)
1. Google Cloud Console → Create Service Account
2. Download JSON credentials file
3. In GA4 → Admin → Property → Property Access Management
4. Add service account email with Viewer permission
5. Get Property ID from GA4 Admin → Property Settings

### Klaviyo
1. Account → Settings → API Keys
2. Create Private API Key
3. Scopes needed: `Campaigns:Read`, `Lists:Read`, `Metrics:Read`

### Xero
1. [developer.xero.com](https://developer.xero.com) → New App
2. Redirect URI: `https://localhost:3000/callback` (for initial setup)
3. Run OAuth2 flow to get refresh token (use xero-node or Postman)
4. Tenant IDs visible after OAuth connection

### Unleashed
1. Settings → Integrations → API Access
2. Generate API ID and API Key

### Gorgias (Customer Service)
1. Settings → Integrations → API
2. Create API token with `tickets:read` scope

### Instagram (via Meta Graph API)
1. Same Meta App as above
2. Add Instagram Graph API product
3. Connect Instagram Business Account
4. Get Instagram Account ID (use Graph Explorer: `me/accounts?fields=instagram_business_account`)

### Slack
1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From Scratch
2. OAuth & Permissions → Bot Token Scopes: `chat:write`, `chat:write.public`
3. Install to workspace → copy Bot User OAuth Token
4. Invite bot to channels: `/invite @YourBotName`

### SendGrid (Email)
1. [sendgrid.com](https://sendgrid.com) → Settings → API Keys
2. Create API Key with "Mail Send" permission
3. Verify sender identity (domain or single email)

---

## 📱 Sample Slack Report

```
🟢 Noody Skincare Daily Report — Wednesday, 19 March 2025

*Strong revenue day driven by Meta ads efficiency improvement*
Yesterday exceeded AOV targets with 24 orders at $87 average. 
Meta ROAS improved to 4.2x — above the 3x benchmark. 
Two inventory items approaching minimum stock level.

📊 Department Scorecard
🟢 Revenue     On Track — $2,087 vs $2,700 daily target (77%)
🟡 Marketing   Attention — CTR improving but still below 1% benchmark  
🟢 Inventory   On Track — Stock healthy, 2 items to watch
🟢 CS          On Track — All tickets responded within 3 hours
🟡 Cashflow    Attention — $4,200 overdue from wholesale accounts

🏆 Today's Wins
✅ Meta ROAS: 4.2x — Highest in 2 weeks
✅ New Customers: 8 — Above 5/day target

🎯 Today's Action Items
1. Chase Farmers invoice #1042 — $2,100 overdue 14 days
   › Owner: Ashleigh | Timeframe: today
2. Reorder Sun Balm SPF 50 — 23 units remaining (minimum: 50)
   › Owner: Scott | Timeframe: today
3. Test new ad creative for Sensitive Skin Bundle
   › Owner: Marketing | Timeframe: this week
```

---

## 🔧 Customisation

### Change Report Time
Edit `.github/workflows/daily-report.yml`:
```yaml
- cron: '0 19 * * *'   # 7am NZST (winter)
- cron: '0 18 * * *'   # 7am NZDT (summer)
```

### Add New Metrics
1. Create a new connector in `/connectors/`
2. Import and add to the `collectors` array in `index.js`
3. The AI analyzer will automatically include it

### Change the AI Analysis Prompt
Edit `utils/analyzer.js` → modify the `systemPrompt` or `userPrompt` variables

### Add More Businesses
Add a new entry in `config.js` under `businesses`, then add corresponding API keys

---

## 🐛 Troubleshooting

**Report not sending?**
- Check GitHub Actions logs for error details
- Test locally with `npm start` — errors will show in console

**API Authentication errors?**
- Meta tokens expire after 60 days — refresh via Token Debugger
- Xero tokens need re-authorisation periodically
- Check the specific API's error message in the logs

**Slack messages not appearing?**
- Confirm bot is invited to the channel
- Check bot token has `chat:write` scope
- Verify channel ID format (#channel-name vs channel_id)

---

## 📈 Roadmap Ideas
- [ ] Weekly trend analysis (vs prior week)
- [ ] Monthly business review automation  
- [ ] Anomaly detection & instant alerts
- [ ] Custom benchmarks per product/campaign
- [ ] WhatsApp delivery option
- [ ] Forecast vs actual tracking
