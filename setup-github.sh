#!/bin/bash
# setup-github.sh — Automated GitHub repo setup and push
# This script will create a private repo and push your code

set -e  # Exit on any error

echo "=============================================="
echo "🚀 Business Intelligence System - GitHub Setup"
echo "=============================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install git first:"
    echo "   https://git-scm.com/downloads"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo ""
    echo "Install it here: https://cli.github.com/"
    echo ""
    echo "Or via Homebrew: brew install gh"
    echo "Or via Chocolatey (Windows): choco install gh"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 You need to authenticate with GitHub first."
    echo "Running: gh auth login"
    echo ""
    gh auth login
fi

echo ""
echo "What would you like to name your repository?"
read -p "Repository name (default: noody-business-intelligence): " REPO_NAME
REPO_NAME=${REPO_NAME:-noody-business-intelligence}

echo ""
echo "Enter a description for this repository:"
read -p "Description (default: Automated daily business reporting): " REPO_DESC
REPO_DESC=${REPO_DESC:-"Automated daily business reporting system"}

echo ""
echo "Creating private GitHub repository: $REPO_NAME"
echo ""

# Create the private repo
gh repo create "$REPO_NAME" \
    --private \
    --description "$REPO_DESC" \
    --confirm

echo ""
echo "✅ Repository created successfully!"
echo ""

# Get the git remote URL
REPO_URL=$(gh repo view "$REPO_NAME" --json sshUrl -q .sshUrl)

echo "Adding remote origin: $REPO_URL"
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"

echo ""
echo "Committing files..."
git commit -m "Initial commit: Business Intelligence System

- Added all data connectors (Shopify, Meta, Google, Xero, etc.)
- Added Claude AI analysis engine
- Added Slack and email delivery
- Added GitHub Actions workflow for daily automation"

echo ""
echo "Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "=============================================="
echo "✅ SUCCESS! Repository is live on GitHub"
echo "=============================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Visit your repo: https://github.com/$(gh api user -q .login)/$REPO_NAME"
echo ""
echo "2. Add your secrets (Settings → Secrets → Actions → New repository secret):"
echo "   - ANTHROPIC_API_KEY"
echo "   - SHOPIFY_NOODY_STORE"
echo "   - SHOPIFY_NOODY_TOKEN"
echo "   - META_ACCESS_TOKEN"
echo "   - SLACK_BOT_TOKEN"
echo "   ... and all others from .env.example"
echo ""
echo "3. Test the workflow:"
echo "   Go to Actions tab → Daily Business Intelligence Report → Run workflow"
echo ""
echo "The system will automatically run every day at 7am NZST!"
echo ""
