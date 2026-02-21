# 🧠 Noody Customer Insights Engine

Pulls all customer messages from Re:amaze (across every channel), sends them to Claude AI for deep analysis, and delivers actionable insights to Slack + Email.

## What It Analyzes

All customer messages from:
- 📸 **Instagram DMs**
- 👤 **Facebook Messenger**
- 📧 **Email**
- 💬 **Website Chat**
- 📝 **Contact Form**

## What You Get

Each report includes:
- **Volume overview** — message counts by channel
- **Executive summary** — AI-generated overview of customer sentiment
- **Key themes** — what customers are talking about most
- **Product feedback** — specific feedback on Noody products
- **Shipping & delivery** — delivery issues and praise
- **Urgent issues** — conversations needing immediate attention
- **Opportunities** — product requests, testimonial candidates, expansion ideas
- **Action items** — prioritized next steps with suggested owners
- **Sentiment score** — overall customer happiness rating

## Setup

### 1. Add to your existing BI repo

Copy the `customer-insights/` folder into your `noody-business-intelligence` repo alongside the existing daily report files.

### 2. Add GitHub Secrets

You already have `ANTHROPIC_API_KEY` and `SLACK_BOT_TOKEN` from the daily BI setup. Add these new ones:

| Secret | Where to find it |
|---|---|
| `REAMAZE_BRAND` | Your subdomain, e.g. `noody` from `noody.reamaze.io` |
| `REAMAZE_EMAIL` | Your Re:amaze login email |
| `REAMAZE_API_TOKEN` | Settings → Developer → API Token in Re:amaze |
| `SLACK_INSIGHTS_CHANNEL` | Create a `#noody-customer-insights` channel (or use existing) |
| `RESEND_API_KEY` | Sign up free at [resend.com](https://resend.com) |
| `EMAIL_FROM` | Verified sender (e.g. `insights@noody.co.nz`) |
| `EMAIL_TO` | Comma-separated emails (e.g. `scott@noody.co.nz,ashleigh@noody.co.nz`) |

### 3. Create Slack channel

Create `#noody-customer-insights` in Slack and invite your bot.

### 4. Run it

Go to **Actions** tab → **Customer Insights Report** → **Run workflow** → Choose days (1, 3, 7, 14, or 30).

## How It Works

```
Re:amaze API ──→ Conversations + Messages + Ratings
                         │
                         ▼
                  Claude AI Analysis
                         │
                    ┌─────┴─────┐
                    ▼           ▼
              Slack Report  Email Report
```

1. **Collects** all customer messages from Re:amaze for the selected period
2. **Categorizes** by channel, status, tags, and satisfaction
3. **Analyzes** with Claude AI to extract themes, sentiment, and actionable insights
4. **Delivers** formatted reports to both Slack and email

## File Structure

```
customer-insights/
├── index.js                    # Main orchestrator
├── config.js                   # Configuration
├── connectors/
│   └── reamaze.js              # Re:amaze API connector
├── utils/
│   ├── analyzer.js             # Claude AI analysis
│   ├── slack-delivery.js       # Slack formatting & delivery
│   └── email-delivery.js       # Email formatting & delivery
├── .github/
│   └── workflows/
│       └── customer-insights.yml  # GitHub Actions workflow
├── .env.example                # Environment template
└── README.md                   # This file
```

## Troubleshooting

**Re:amaze API errors?**
- Check your API token is correct in Settings → Developer → API Token
- Ensure the login email matches the account with the token
- Re:amaze has rate limits — the connector handles 429s automatically

**No messages returned?**
- Check the date range covers a period with actual messages
- The `filter: customer` param means only customer messages are fetched (not staff)
- Try running with `DAYS_BACK=30` to cast a wider net

**Slack not receiving?**
- Create the channel first, then invite the bot
- Check the channel name matches `SLACK_INSIGHTS_CHANNEL`

**Email not sending?**
- Resend requires domain verification — check their docs
- Make sure `EMAIL_TO` is comma-separated with no spaces
