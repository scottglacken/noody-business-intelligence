// utils/analyzer.js
// Sends all collected data to Claude for intelligent analysis and action items

const Anthropic = require("@anthropic-ai/sdk");

async function analyzeBusinessData(allData, config, businessName, reportDate) {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  // reportDate is the date the data is FOR (yesterday)
  // This is passed in to avoid confusion with "today"
  const dataDate = reportDate || new Date().toLocaleDateString("en-NZ", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: config.businesses.noody?.timezone || "Pacific/Auckland"
  });

  const benchmarks = config.benchmarks;

  const systemPrompt = `You are a senior business analyst and performance advisor for ${businessName}. 
Your job is to analyze daily business data and provide:
1. A clear, concise performance summary
2. Key wins and concerns (with specific numbers)
3. 3-5 prioritized action items for today
4. Notable trends or anomalies

**CRITICAL: Pay special attention to social media performance** - follower growth, engagement rates, and content performance are key growth indicators.

Be direct, specific, and action-oriented. Use actual numbers from the data. 
Flag anything that needs urgent attention. 
Benchmark against industry standards where relevant.
Keep the tone professional but energetic — this is a team daily briefing.

IMPORTANT: The data you're analyzing is for YESTERDAY (${dataDate}). When writing the summary, refer to it as "yesterday" or state the specific date, NOT as "today" or "Tuesday" if that's incorrect.`;

  const userPrompt = `Analyze yesterday's business data for ${businessName} (${dataDate}):

${JSON.stringify(allData, null, 2)}

Industry benchmarks for context:
- Meta CTR: poor <0.5%, average 1%, good >2%
- Meta ROAS: poor <1.5x, average 3x, good >5x
- Email open rate: poor <15%, average 25%, good >40%
- Customer response time: poor >24h, good <2h
- Instagram engagement rate: poor <1%, average 2-3%, good >4%
- Instagram follower growth: poor <1%/month, good >5%/month

Please provide your analysis in this exact JSON structure:
{
  "headline": "One sentence performance headline for today",
  "overallScore": "green|yellow|red",
  "summary": "2-3 sentence executive summary",
  "wins": [
    { "metric": "metric name", "value": "value", "context": "why this is good" }
  ],
  "concerns": [
    { "metric": "metric name", "value": "value", "context": "why this needs attention", "urgency": "high|medium|low" }
  ],
  "actionItems": [
    { "priority": 1, "action": "specific action", "owner": "who should do this", "timeframe": "today|this week|monitor" }
  ],
  "departmentScores": {
    "revenue": { "score": "green|yellow|red", "note": "brief note" },
    "marketing": { "score": "green|yellow|red", "note": "brief note" },
    "email": { "score": "green|yellow|red", "note": "brief note on Klaviyo/email performance" },
    "social": { "score": "green|yellow|red", "note": "brief note on Instagram/social performance" },
    "inventory": { "score": "green|yellow|red", "note": "brief note" },
    "customerService": { "score": "green|yellow|red", "note": "brief note" },
    "cashflow": { "score": "green|yellow|red", "note": "brief note" }
  },
  "trendAlert": "Any significant trend or anomaly worth flagging (null if none)"
}`;

  try {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const text = response.content[0]?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { error: "Could not parse AI analysis", raw: text };

  } catch (err) {
    console.error("[Analyzer] Error:", err.message);
    return { error: err.message };
  }
}

module.exports = { analyzeBusinessData };
