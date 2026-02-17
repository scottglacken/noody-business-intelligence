# 🚀 GitHub Setup Instructions

Two options: **Automated (recommended)** or **Manual**

---

## Option A: Automated Setup (5 minutes)

### Prerequisites
1. **Install GitHub CLI** (if you don't have it):
   - Mac: `brew install gh`
   - Windows: `choco install gh` or download from https://cli.github.com/
   - Linux: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

2. **Authenticate with GitHub**:
   ```bash
   gh auth login
   ```
   Follow the prompts to log in with your GitHub account.

### Run the Setup Script
Open Terminal/Command Prompt and navigate to the project folder, then:

```bash
./setup-github.sh
```

The script will:
- Create a private GitHub repository
- Initialize git
- Commit all files
- Push to GitHub
- Give you next steps

**That's it!** Skip to the "Add Secrets" section below.

---

## Option B: Manual Setup (10 minutes)

### Step 1: Create a GitHub Repository

1. Go to https://github.com/new
2. Fill in:
   - **Repository name**: `noody-business-intelligence` (or whatever you like)
   - **Description**: "Automated daily business reporting system"
   - **Private**: ✅ Make sure this is checked
   - **Initialize**: Leave all checkboxes UNCHECKED (no README, no .gitignore)
3. Click **Create repository**

### Step 2: Push Your Code

Open Terminal/Command Prompt and navigate to where you saved the daily-intelligence folder:

```bash
cd /path/to/daily-intelligence

# Initialize git (already done if you ran the automated setup)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Business Intelligence System"

# Connect to GitHub (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/noody-business-intelligence.git

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main
```

**Replace** `YOUR_USERNAME` with your actual GitHub username.

---

## Add Secrets to GitHub (Required for automation)

Once your code is on GitHub:

### Step 1: Navigate to Settings
1. Go to your repository on GitHub
2. Click **Settings** (top right)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

### Step 2: Add Each Secret

For each environment variable in `.env.example`, create a secret:

| Secret Name | Where to Get It | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Starts with `sk-ant-` |
| `SHOPIFY_NOODY_STORE` | Your Shopify store name | Just the name, not the full URL |
| `SHOPIFY_NOODY_TOKEN` | Shopify Admin → Settings → Apps | Starts with `shpat_` |
| `META_ACCESS_TOKEN` | Meta Business Suite → Settings | Long token starting with `EAA` |
| `META_NOODY_AD_ACCOUNT` | Facebook Ads Manager URL | Format: `act_123456789` |
| `SLACK_BOT_TOKEN` | api.slack.com/apps | Starts with `xoxb-` |
| `SLACK_NOODY_CHANNEL` | Your Slack channel | Format: `#channel-name` or `C01234567` |
| `SENDGRID_API_KEY` | sendgrid.com → Settings → API Keys | Starts with `SG.` |
| `EMAIL_FROM` | Your verified sender | e.g., `reports@noody.co.nz` |
| `EMAIL_RECIPIENTS` | Who gets the email | Comma-separated: `scott@noody.co.nz,ashleigh@noody.co.nz` |

**Keep adding secrets for all the other services you want to connect:**
- Google Ads: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, etc.
- Xero: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, etc.
- Klaviyo: `KLAVIYO_API_KEY`
- And so on...

### Step 3: Add Google Credentials (if using GA4)

If you're using Google Analytics:

1. In GitHub Secrets, create a secret named: `GOOGLE_APPLICATION_CREDENTIALS_JSON`
2. Paste the **entire contents** of your Google service account JSON file
3. The workflow will automatically create the file at runtime

---

## Test Your Setup

### Option 1: Manual Test Run
1. Go to your repository on GitHub
2. Click **Actions** tab
3. Click **Daily Business Intelligence Report** workflow
4. Click **Run workflow** dropdown (right side)
5. Click **Run workflow** button
6. Watch it run! Click on the workflow to see logs

### Option 2: Wait for the Scheduled Run
The workflow will automatically run every day at 7:00 AM NZST.

---

## Troubleshooting

**"Permission denied" when running setup-github.sh**
```bash
chmod +x setup-github.sh
```

**"gh: command not found"**
Install GitHub CLI: https://cli.github.com/

**Workflow fails with "secret not found"**
Double-check you've added all required secrets in GitHub Settings → Secrets → Actions

**"fatal: remote origin already exists"**
```bash
git remote remove origin
# Then try the git remote add command again
```

---

## What Happens Next?

Once set up:
- ✅ Code is safely stored in your private GitHub repo
- ✅ GitHub Actions runs the report every morning at 7am
- ✅ Reports are delivered to Slack + Email automatically
- ✅ You can manually trigger reports anytime from the Actions tab
- ✅ Free (GitHub Actions gives 2,000 minutes/month free — you'll use ~10 minutes/month)

No server to maintain, no costs, completely automated.
