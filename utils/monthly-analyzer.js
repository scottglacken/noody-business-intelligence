// utils/monthly-analyzer.js — Claude AI Monthly Business Analysis
// Comprehensive monthly review with channel-by-channel performance vs YTD benchmarks

const Anthropic = require("@anthropic-ai/sdk");

async function analyzeMonthlyData(allData, config, businessName, dates) {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const shopifyData = allData.find(d => d.source === "shopify" && !d.error);
  const metaData = allData.find(d => d.source === "meta_ads" && !d.error);
  const xeroData = allData.find(d => d.source === "xero" && !d.error);
  const klaviyoData = allData.find(d => d.source === "klaviyo" && !d.error);
  const socialData = allData.find(d => d.source === "social" && !d.error);

  const systemPrompt = `You are the fractional CFO and Head of Growth for ${businessName}, a DTC e-commerce skincare brand in New Zealand.

BUSINESS CONTEXT:
- Revenue split: ~58.6% DTC (Shopify), ~41.4% Wholesale (Farmers stores)
- Target profit margin: 30%
- All figures in NZD
- Co-founders: Scott & Ashleigh
- Key framework: The Ecommerce Equation (Revenue - Marketing Costs - Variable Costs - Fixed Costs = Profit)
- Variable costs: ~20% product cost, $2.50 shipping, $1 packaging, $0.30 transaction fees, 2.5% merchant fees
- Monthly fixed costs (online): ~$8,450

REPORTING STYLE:
- Be direct, data-first, no fluff
- Always compare to YTD averages as the primary benchmark
- Call out both wins and problems clearly
- Provide specific, actionable recommendations
- Use the Ecommerce Equation framework where possible
- Think about DTC vs Wholesale channel economics separately

Respond ONLY with valid JSON, no markdown fences or text before/after.`;

  const userPrompt = `Analyze the monthly performance data for ${dates.monthName}:

${JSON.stringify(allData, null, 2)}

Generate a comprehensive monthly business review. Respond with ONLY this JSON structure:

{
  "reportTitle": "Noody Skincare — ${dates.monthName} Business Review",
  "executiveSummary": "3-4 sentence overview of the month — revenue, profitability, key trend. Include specific numbers.",
  "overallGrade": "A|B|C|D|F",
  "gradeRationale": "One sentence explaining the grade",

  "revenueAnalysis": {
    "headline": "One line revenue summary with numbers",
    "monthRevenue": 0,
    "vsYtdAvg": "+X% or -X%",
    "vsPrevMonth": "+X% or -X%",
    "dailyAvg": 0,
    "keyInsight": "What drove revenue this month — product mix, channel, promotions, etc.",
    "dtcEstimate": "Estimated DTC revenue and assessment",
    "wholesaleEstimate": "Estimated wholesale revenue and assessment"
  },

  "channelPerformance": [
    {
      "channel": "DTC (Shopify)",
      "grade": "A-F",
      "monthValue": "$X",
      "vsYtdAvg": "+X%",
      "keyMetrics": "orders, AOV, returning customer rate",
      "insight": "What's working or not"
    },
    {
      "channel": "Meta Ads",
      "grade": "A-F",
      "monthValue": "$X spend → $X revenue",
      "vsYtdAvg": "ROAS trend",
      "keyMetrics": "ROAS, CPA, CTR, spend",
      "insight": "Efficiency assessment"
    },
    {
      "channel": "Email (Klaviyo)",
      "grade": "A-F",
      "monthValue": "X campaigns sent",
      "vsYtdAvg": "activity level",
      "keyMetrics": "campaigns, flows",
      "insight": "Email contribution"
    },
    {
      "channel": "Instagram",
      "grade": "A-F",
      "monthValue": "X posts, X engagement",
      "vsYtdAvg": "engagement trend",
      "keyMetrics": "followers, engagement rate, content mix",
      "insight": "Social health"
    }
  ],

  "profitability": {
    "headline": "P&L summary sentence",
    "xeroRevenue": 0,
    "grossProfit": 0,
    "grossMargin": "X%",
    "netProfit": 0,
    "netMargin": "X%",
    "vsYtdAvgMargin": "comparison",
    "ecommerceEquation": {
      "revenue": 0,
      "marketingCosts": 0,
      "variableCosts": "estimated",
      "fixedCosts": 8450,
      "estimatedProfit": 0,
      "mer": "X%"
    },
    "topExpenses": "List top 3 expense categories and amounts",
    "cashflowNote": "Outstanding receivables or cash concerns"
  },

  "topProducts": [
    {"name": "Product Name", "units": 0, "revenue": 0, "trend": "up/down/stable"}
  ],

  "wins": [
    {"title": "Win headline", "detail": "Specific metric and why it matters", "impact": "high|medium"}
  ],

  "concerns": [
    {"title": "Concern headline", "detail": "Specific metric and why it's a problem", "urgency": "critical|high|medium|low", "suggestedFix": "Specific action"}
  ],

  "strategicRecommendations": [
    {
      "priority": 1,
      "recommendation": "Specific action to take",
      "expectedImpact": "What this could improve by",
      "owner": "Scott|Ashleigh|Marketing",
      "timeframe": "This week|This month|Next quarter"
    }
  ],

  "nextMonthOutlook": "2-3 sentence forecast/focus areas for the coming month based on trends",

  "ytdSummary": {
    "totalRevenue": 0,
    "monthlyAvg": 0,
    "trend": "growing|flat|declining",
    "bestMonth": "Month name",
    "worstMonth": "Month name or N/A if only 1-2 months",
    "annualizedProjection": 0
  }
}`;

  try {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 4000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const rawText = response.content[0]?.text || "{}";

    // Robust JSON parsing (same pattern as daily analyzer)
    try { return JSON.parse(rawText); } catch (e) { /* continue */ }
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch (e) { /* continue */ } }

    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < rawText.length; i++) {
      if (rawText[i] === "{") { if (depth === 0) start = i; depth++; }
      else if (rawText[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start >= 0 && end > start) {
      let candidate = rawText.substring(start, end + 1).replace(/[\x00-\x1F\x7F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      try { return JSON.parse(candidate); } catch (e) {
        console.error("[Monthly Analyzer] JSON parse failed, raw:", rawText.substring(0, 500));
        return { error: "JSON parse failed", raw: rawText.substring(0, 500) };
      }
    }
    return { error: "No JSON found in AI response" };
  } catch (err) {
    console.error("[Monthly Analyzer] Error:", err.message);
    return { error: err.message };
  }
}

module.exports = { analyzeMonthlyData };
