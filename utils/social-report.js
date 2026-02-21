// utils/social-report.js
// Dedicated social media report: Instagram + Facebook
// Updated for v21+ API changes (no impressions, uses views instead)

function buildSocialReport(socialData, businessName, date) {
  const instagram = socialData?.instagram || (socialData?.source === "instagram" ? socialData : null);
  const facebook = socialData?.facebook || (socialData?.source === "facebook" ? socialData : null);

  if ((!instagram || instagram.error) && (!facebook || facebook.error)) {
    return {
      blocks: [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📱 ${businessName} Social Media Report*\n⚠️ Social data unavailable: ${instagram?.error || facebook?.error || "No data"}`
        }
      }]
    };
  }

  const blocks = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `📱 ${businessName} Social Media Report` }
  });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*${date}* | 7-Day Performance Overview` }
  });
  blocks.push({ type: "divider" });

  // Instagram
  if (instagram && !instagram.error) {
    blocks.push(...buildInstagramSection(instagram));
  } else if (instagram?.error) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*📸 Instagram*\n⚠️ Error: ${instagram.error}` }
    });
  }

  // Facebook
  if (facebook && !facebook.error) {
    blocks.push({ type: "divider" });
    blocks.push(...buildFacebookSection(facebook));
  } else if (facebook?.error) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*👤 Facebook Page*\n⚠️ Error: ${facebook.error}` }
    });
  }

  // Recommendations
  blocks.push({ type: "divider" });
  blocks.push(...buildRecommendations(instagram, facebook));

  // Footer
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `📊 Social Media Report • ${new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })}`
    }]
  });

  return { blocks };
}


// ─────────────────────────────────────────────────────────────
// INSTAGRAM SECTION
// ─────────────────────────────────────────────────────────────
function buildInstagramSection(ig) {
  const blocks = [];
  const rate = ig.engagement?.rate || 0;
  const engagementEmoji = rate > 2 ? "🟢" : rate > 1 ? "🟡" : "🔴";

  // Profile Health
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*📸 Instagram — Profile Health*" }
  });

  const followerChange = ig.profile?.followerChange7d || 0;
  const followerGrowthRate = ig.profile?.followerGrowthRate7d || 0;
  const followerTrend = followerChange > 0 ? `📈 +${followerChange}` : followerChange < 0 ? `📉 ${followerChange}` : "➡️ No change";
  const growthStatus = followerGrowthRate > 1 ? "🟢 Growing" : followerGrowthRate > 0 ? "🟡 Slow Growth" : followerGrowthRate < 0 ? "🔴 Declining" : "⚪ Flat";

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Followers*\n${(ig.profile?.followers || 0).toLocaleString()}` },
      { type: "mrkdwn", text: `*7-Day Change*\n${followerTrend} (${followerGrowthRate > 0 ? '+' : ''}${followerGrowthRate}%)` },
      { type: "mrkdwn", text: `*Status*\n${growthStatus}` },
      { type: "mrkdwn", text: `*Total Posts*\n${(ig.profile?.totalPosts || 0).toLocaleString()}` },
    ]
  });

  // Engagement
  blocks.push({ type: "divider" });

  let engagementBenchmark = "";
  if (rate < 1) engagementBenchmark = "🔴 *Below Industry Standard* (<1% is poor)";
  else if (rate < 2) engagementBenchmark = "🟡 *Below Average* (2-3% is industry standard)";
  else if (rate < 4) engagementBenchmark = "🟢 *Good* (2-3% is industry standard)";
  else engagementBenchmark = "🟢 *Excellent* (>4% is outstanding)";

  const periodNote = ig.engagement?.periodLabel
    ? ` _(based on ${ig.engagement.periodLabel}, ${ig.engagement.postsAnalyzed} posts)_`
    : "";

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${engagementEmoji} Engagement Performance*\n*Engagement Rate:* ${rate}%${periodNote}\n${engagementBenchmark}`
    }
  });

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Avg Engagement/Post*\n${ig.engagement?.avgEngagementPerPost || 0} interactions` },
      { type: "mrkdwn", text: `*Avg Likes/Post*\n${ig.engagement?.avgLikesPerPost || 0} ❤️` },
      { type: "mrkdwn", text: `*Avg Comments/Post*\n${ig.engagement?.avgCommentsPerPost || 0} 💬` },
      { type: "mrkdwn", text: `*Avg Saves/Post*\n${ig.engagement?.avgSavesPerPost || 0} 🔖` },
    ]
  });

  // Reach & Visibility
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*👁️ Reach & Visibility*" }
  });

  const reachChange = ig.insights?.reachChange !== "N/A" ? `${ig.insights.reachChange}%` : "N/A";
  const reachTrend = parseFloat(ig.insights?.reachChange) > 0 ? "📈" : parseFloat(ig.insights?.reachChange) < 0 ? "📉" : "➡️";

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Reach (7d)*\n${(ig.last7Days?.reach || 0).toLocaleString()}\n${reachTrend} ${reachChange} vs prev 7d` },
      { type: "mrkdwn", text: `*Views (7d)*\n${(ig.last7Days?.views || 0).toLocaleString()}` },
    ]
  });

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Posts Published (7d)*\n${ig.last7Days?.postsPublished || 0}` },
      { type: "mrkdwn", text: `*Total Video Views*\n${(ig.last7Days?.totalVideoViews || 0).toLocaleString()}` },
    ]
  });

  // Content Mix
  if (ig.contentMix && Object.keys(ig.contentMix).length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🎬 Content Mix (Last 7 Days)*" }
    });

    const contentBreakdown = Object.entries(ig.contentMix)
      .map(([type, count]) => `• ${type}: ${count} posts`)
      .join("\n");

    // Content insight — check for REEL/VIDEO (how we now label them)
    const reelVideoCount = ig.contentMix?.["REEL/VIDEO"] || 0;
    const imageCount = ig.contentMix?.IMAGE || 0;
    const carouselCount = ig.contentMix?.CAROUSEL || 0;

    let contentInsight = "";
    if (reelVideoCount > imageCount && reelVideoCount > 0) {
      contentInsight = "\n✅ *Good:* Prioritizing video content (algorithm-favored format)";
    } else if (reelVideoCount === 0 && (imageCount > 0 || carouselCount > 0)) {
      contentInsight = "\n⚠️ *Missing:* No Reels/video this week. Video gets 2-3x more reach than static posts.";
    } else if (imageCount > reelVideoCount * 2 && reelVideoCount > 0) {
      contentInsight = "\n⚠️ *Consider:* Shift toward more video content — Reels get 2-3x more reach";
    }

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${contentBreakdown}${contentInsight}` }
    });
  }

  // Top Posts
  if (ig.topPosts?.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*⭐ Top Performing Content*" }
    });

    ig.topPosts.slice(0, 5).forEach((post, idx) => {
      const postDate = new Date(post.postedAt).toLocaleDateString("en-NZ", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      });

      const postType = post.type || "Post";

      let metricsText = `${post.likes || 0} ❤️  ${post.comments || 0} 💬  ${post.saves || 0} 🔖`;
      if (post.views > 0) {
        metricsText += `  ${post.views.toLocaleString()} 👁️`;
      }
      if (post.reach > 0) {
        metricsText += `\n📊 ${post.reach.toLocaleString()} reach`;
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*#${idx + 1}* - ${postType} (${postDate})\n${post.engagement || 0} total engagement (${post.engagementRate || 0}% rate)\n${metricsText}\n_"${post.captionPreview}..."_${post.url ? `\n<${post.url}|View Post →>` : ""}`
        }
      });
    });
  }

  return blocks;
}


// ─────────────────────────────────────────────────────────────
// FACEBOOK SECTION
// ─────────────────────────────────────────────────────────────
function buildFacebookSection(fb) {
  const blocks = [];

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*👤 Facebook Page*" }
  });

  const netChange = fb.profile?.followerChange7d || 0;
  const changeTrend = netChange > 0 ? `📈 +${netChange}` : netChange < 0 ? `📉 ${netChange}` : "➡️ 0";

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Followers*\n${(fb.profile?.followers || 0).toLocaleString()}` },
      { type: "mrkdwn", text: `*Page Likes*\n${(fb.profile?.pageLikes || 0).toLocaleString()}` },
      { type: "mrkdwn", text: `*7d Net Change*\n${changeTrend}` },
      { type: "mrkdwn", text: `*New / Lost (7d)*\n+${fb.profile?.newFans7d || 0} / -${fb.profile?.lostFans7d || 0}` },
    ]
  });

  const impressionsChange = fb.insights?.impressionsChange !== "N/A" ? `${fb.insights.impressionsChange}%` : "N/A";
  const impressionsTrend = parseFloat(fb.insights?.impressionsChange) > 0 ? "📈" : parseFloat(fb.insights?.impressionsChange) < 0 ? "📉" : "➡️";

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Impressions (7d)*\n${(fb.last7Days?.impressions || 0).toLocaleString()}\n${impressionsTrend} ${impressionsChange} vs prev 7d` },
      { type: "mrkdwn", text: `*Engaged Users (7d)*\n${(fb.last7Days?.engagedUsers || 0).toLocaleString()}` },
      { type: "mrkdwn", text: `*Page Views (7d)*\n${(fb.last7Days?.pageViews || 0).toLocaleString()}` },
      { type: "mrkdwn", text: `*Posts (7d)*\n${fb.last7Days?.postsPublished || 0}` },
    ]
  });

  if (fb.engagement?.rate) {
    const fbRate = fb.engagement.rate;
    const fbEmoji = fbRate > 1 ? "🟢" : fbRate > 0.5 ? "🟡" : "🔴";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${fbEmoji} *Engagement Rate:* ${fbRate}% (avg ${fb.engagement?.avgEngagementPerPost || 0} per post)` }
    });
  }

  // Top FB posts
  if (fb.topPosts?.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Top Facebook Posts*" }
    });

    fb.topPosts.slice(0, 3).forEach((post, idx) => {
      const postDate = new Date(post.postedAt).toLocaleDateString("en-NZ", { month: "short", day: "numeric" });
      const metricsText = `${post.reactions || post.likes || 0} 👍  ${post.comments || 0} 💬  ${post.shares || 0} 🔄`;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*#${idx + 1}* (${postDate}) — ${post.engagement || 0} total\n${metricsText}\n_"${post.captionPreview}..."_${post.url ? `\n<${post.url}|View →>` : ""}`
        }
      });
    });
  }

  return blocks;
}


// ─────────────────────────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────
function buildRecommendations(ig, fb) {
  const blocks = [];

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "*💡 Strategic Recommendations*" }
  });

  const recommendations = [];

  if (ig && !ig.error) {
    const igRate = ig.engagement?.rate || 0;

    if (igRate < 1) {
      recommendations.push("🔴 *IG Critical:* Engagement rate is below 1% — content isn't resonating. Test more authentic, behind-the-scenes content and user-generated content.");
    } else if (igRate < 2) {
      recommendations.push("🟡 *IG Improve:* Engagement below industry average (2-3%). Add polls, questions, and CTAs in captions to boost interaction.");
    }

    const followerGrowth = ig.profile?.followerGrowthRate7d || 0;
    if (followerGrowth < 0) {
      recommendations.push("🔴 *IG Urgent:* Losing followers. Review recent content for anything off-brand. May need content strategy refresh.");
    } else if (followerGrowth < 0.5 && followerGrowth >= 0) {
      recommendations.push("🟡 *IG Growth:* Follower growth is slow. Consider: collaborations, giveaways, or cross-promotion strategies.");
    }

    // Check for video/reel content — uses REEL/VIDEO key from contentMix
    const reelVideoCount = ig.contentMix?.["REEL/VIDEO"] || 0;
    const imageCount = ig.contentMix?.IMAGE || 0;
    const carouselCount = ig.contentMix?.CAROUSEL || 0;
    const totalPosts = ig.last7Days?.postsPublished || 0;

    if (reelVideoCount === 0 && totalPosts > 0) {
      recommendations.push("💡 *Missing Opportunity:* No Reels/video posted this week. Reels get 2-3x the reach of static posts on Instagram's algorithm.");
    } else if (imageCount > reelVideoCount * 2 && reelVideoCount > 0) {
      recommendations.push("💡 *Content Strategy:* Shift toward more Reels — they consistently outperform static posts for reach.");
    }

    const avgSaves = ig.engagement?.avgSavesPerPost || 0;
    if (avgSaves > 15) {
      recommendations.push("🟢 *IG Strength:* High save rate — your content is being bookmarked. Double down on educational/how-to posts.");
    }
  }

  // Facebook recommendations
  if (fb && !fb.error) {
    const fbRate = fb.engagement?.rate || 0;
    if (fbRate < 0.5) {
      recommendations.push("🟡 *FB Engagement:* Facebook engagement is low. Consider: video content, live sessions, or community-focused posts.");
    }

    if (fb.last7Days?.postsPublished === 0) {
      recommendations.push("⚠️ *FB Inactive:* No Facebook posts this week. Even 2-3 cross-posts from Instagram can maintain page health.");
    }

    const netChange = fb.profile?.followerChange7d || 0;
    if (netChange < 0) {
      recommendations.push("🔴 *FB Followers:* Losing Facebook followers. Check for any controversial content or review audience targeting.");
    }
  }

  // Cross-platform
  if (ig && !ig.error && fb && !fb.error) {
    const igPosts = ig.last7Days?.postsPublished || 0;
    const fbPosts = fb.last7Days?.postsPublished || 0;
    if (igPosts > 0 && fbPosts === 0) {
      recommendations.push("💡 *Cross-Post:* You're active on Instagram but silent on Facebook. Cross-post key content to maintain both audiences.");
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("🟢 *Well Done:* Social performance is solid. Keep current strategy and continue testing new content formats.");
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: recommendations.join("\n\n")
    }
  });

  return blocks;
}


// ─────────────────────────────────────────────────────────────
// CONDENSED SUMMARY (for main daily report)
// ─────────────────────────────────────────────────────────────
function buildSocialSummary(socialData) {
  const instagram = socialData?.instagram || (socialData?.source === "instagram" ? socialData : null);
  const facebook = socialData?.facebook || (socialData?.source === "facebook" ? socialData : null);

  if ((!instagram || instagram.error) && (!facebook || facebook.error)) {
    return null;
  }

  const fields = [];

  if (instagram && !instagram.error) {
    const engagementStatus = instagram.engagement?.rate > 2 ? "🟢" : instagram.engagement?.rate > 1 ? "🟡" : "🔴";
    const followerChange = instagram.profile?.followerChange7d || 0;
    const followerTrend = followerChange > 0 ? `📈 +${followerChange}` : followerChange < 0 ? `📉 ${followerChange}` : "➡️ 0";

    fields.push(
      { type: "mrkdwn", text: `${engagementStatus} *IG Engagement*\n${instagram.engagement?.rate || 0}%` },
      { type: "mrkdwn", text: `*IG Followers*\n${(instagram.profile?.followers || 0).toLocaleString()} ${followerTrend}` }
    );
  }

  if (facebook && !facebook.error) {
    const fbChange = facebook.profile?.followerChange7d || 0;
    const fbTrend = fbChange > 0 ? `📈 +${fbChange}` : fbChange < 0 ? `📉 ${fbChange}` : "➡️ 0";

    fields.push(
      { type: "mrkdwn", text: `*FB Followers*\n${(facebook.profile?.followers || 0).toLocaleString()} ${fbTrend}` },
      { type: "mrkdwn", text: `*FB Impressions (7d)*\n${(facebook.last7Days?.impressions || 0).toLocaleString()}` }
    );
  }

  if (instagram && !instagram.error) {
    fields.push(
      { type: "mrkdwn", text: `*IG Posts (7d)*\n${instagram.last7Days?.postsPublished || 0}` },
      { type: "mrkdwn", text: `*IG Reach (7d)*\n${(instagram.last7Days?.reach || 0).toLocaleString()}` }
    );
  }

  return {
    type: "section",
    text: { type: "mrkdwn", text: "*📱 Social*" },
    fields: fields.slice(0, 8),
  };
}


// ─────────────────────────────────────────────────────────────
// SEND TO SLACK
// ─────────────────────────────────────────────────────────────
async function sendSocialReport(botToken, channelId, socialData, businessName, date) {
  const axios = require("axios");

  try {
    const report = buildSocialReport(socialData, businessName, date);

    await axios.post("https://slack.com/api/chat.postMessage", {
      channel: channelId,
      blocks: report.blocks,
      text: `${businessName} Social Media Report - ${date}`,
    }, {
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json",
      }
    });

    console.log(`[Social Report] Sent to channel ${channelId}`);
  } catch (err) {
    console.error("[Social Report] Error:", err.response?.data || err.message);
    throw err;
  }
}

module.exports = { buildSocialReport, buildSocialSummary, sendSocialReport };
