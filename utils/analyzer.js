// utils/analyzer.js - ROBUST JSON PARSING
const Anthropic = require("@anthropic-ai/sdk");

async function analyzeBusinessData(allData, config, businessName, reportDate) {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const dataDate = reportDate || new Date().toLocaleDateString("en-NZ", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Pacific/Auckland" });

  const systemPrompt = `You are a senior business analyst for ${businessName}, a DTC skincare brand in NZ (~$83K/month, 30% margins). All currency is NZD. Compare revenue against YTD daily average. Be direct with numbers. Respond ONLY with valid JSON, no markdown fences or text before/after.`;

  const userPrompt = `Analyze yesterday's data (${dataDate}):
${JSON.stringify(allData, null, 2)}

Respond with ONLY this JSON:
{"headline":"one sentence","overallScore":"green|yellow|red","summary":"2-3 sentences with numbers","wins":[{"metric":"name","value":"num","context":"why"}],"concerns":[{"metric":"name","value":"num","context":"why","urgency":"high|medium|low"}],"actionItems":[{"priority":1,"action":"specific","owner":"Scott|Ashleigh|Marketing","timeframe":"today|this week|monitor"}],"departmentScores":{"revenue":{"score":"green|yellow|red","note":"brief"},"marketing":{"score":"green|yellow|red","note":"brief"},"email":{"score":"green|yellow|red","note":"brief"},"social":{"score":"green|yellow|red","note":"brief"},"inventory":{"score":"green|yellow|red","note":"brief"},"customerService":{"score":"green|yellow|red","note":"brief"},"cashflow":{"score":"green|yellow|red","note":"brief"}},"trendAlert":"trend or null"}`;

  try {
    const response = await client.messages.create({ model: config.anthropic.model, max_tokens: 2000, messages: [{ role: "user", content: userPrompt }], system: systemPrompt });
    const rawText = response.content[0]?.text || "{}";

    // Try direct parse
    try { return JSON.parse(rawText); } catch (e) { /* continue */ }

    // Try extracting from code fences
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch (e) { /* continue */ } }

    // Find outermost braces
    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < rawText.length; i++) {
      if (rawText[i] === "{") { if (depth === 0) start = i; depth++; }
      else if (rawText[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start >= 0 && end > start) {
      let candidate = rawText.substring(start, end + 1).replace(/[\x00-\x1F\x7F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      try { return JSON.parse(candidate); } catch (e) {
        console.error("[Analyzer] JSON parse failed, raw (first 500):", rawText.substring(0, 500));
        return { error: "JSON parse failed", raw: rawText.substring(0, 500) };
      }
    }
    return { error: "No JSON found in AI response" };
  } catch (err) {
    console.error("[Analyzer] Error:", err.message);
    return { error: err.message };
  }
}

module.exports = { analyzeBusinessData };
