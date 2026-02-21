// connectors/social-cs.js
// Enhanced Instagram & Facebook Page metrics via Meta Graph API
// Updated for Graph API v21+ (Jan 2025 deprecations applied)
//
// DEPRECATED in v21+ (account-level):
//   profile_views, website_clicks, phone_call_clicks, text_message_clicks,
//   impressions (now "views"), email_contacts
//
// DEPRECATED in v21+ (media-level):
//   engagement, impressions (now "views"), plays (now "views")
//
// STILL WORKING (account-level): reach, follower_count
// STILL WORKING (media-level): reach, saved, views (replaces impressions+plays)

const axios = require("axios");

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// ═══════════════════════════════════════════════════════════════
// INSTAGRAM DATA COLLECTION
// ═══════════════════════════════════════════════════════════════
async function getInstagramData(accountId, accessToken, businessName) {
  const nowNZ = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" }));
  const todayNZ = new Date(nowNZ.getFullYear(), nowNZ.getMonth(), nowNZ.getDate());

  const last7Start = new Date(todayNZ);
  last7Start.setDate(last7Start.getDate() - 7);

  const last14Start = new Date(todayNZ);
  last14Start.setDate(last14Start.getDate() - 14);

  console.log(`[Instagram/${businessName}] Fetching enhanced social metrics...`);
  console.log(`[Instagram/${businessName}] Date range: ${last7Start.toISOString().split('T')[0]} to ${todayNZ.toISOString().split('T')[0]}`);

  try {
    // ─────────────────────────────────────────────────────────
    // 1. PROFILE INFO + RECENT MEDIA (parallel)
    // ─────────────────────────────────────────────────────────
    const [profileRes, mediaRes] = await Promise.all([
      axios.get(`${BASE_URL}/${accountId}`, {
        params: {
          fields: "followers_count,follows_count,media_count,name,username,profile_picture_url",
          access_token: accessToken,
        }
      }),
      axios.get(`${BASE_URL}/${accountId}/media`, {
        params: {
          fields: "id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink",
          limit: 25,
          access_token: accessToken,
        }
      }),
    ]);

    const profile = profileRes.data;
    const allMedia = mediaRes.data.data || [];

    console.log(`[Instagram/${businessName}] Profile: ${profile.followers_count} followers, ${profile.media_count} posts`);
    console.log(`[Instagram/${businessName}] Media returned: ${allMedia.length} posts`);

    // Log the media types we see so we can verify what the API returns
    const mediaTypes = allMedia.slice(0, 10).map(m => `${m.media_type} (${new Date(m.timestamp).toLocaleDateString()})`);
    console.log(`[Instagram/${businessName}] Recent media types: ${mediaTypes.join(", ")}`);

    // ─────────────────────────────────────────────────────────
    // 2. ACCOUNT-LEVEL INSIGHTS
    //    Only "reach" and "follower_count" still work in v21+
    // ─────────────────────────────────────────────────────────
    const sinceTs7 = Math.floor(last7Start.getTime() / 1000);
    const sinceTs14 = Math.floor(last14Start.getTime() / 1000);
    const untilTs = Math.floor(todayNZ.getTime() / 1000);
    const untilTs7 = Math.floor(last7Start.getTime() / 1000);

    const [reachLast7, reachPrev7, followerInsights] = await Promise.all([
      axios.get(`${BASE_URL}/${accountId}/insights`, {
        params: {
          metric: "reach",
          period: "day",
          since: sinceTs7,
          until: untilTs,
          access_token: accessToken,
        }
      }).catch(err => {
        console.log(`[Instagram/${businessName}] Insights (last 7d) error:`, err.response?.data?.error?.message || err.message);
        return { data: { data: [] } };
      }),
      axios.get(`${BASE_URL}/${accountId}/insights`, {
        params: {
          metric: "reach",
          period: "day",
          since: sinceTs14,
          until: untilTs7,
          access_token: accessToken,
        }
      }).catch(err => {
        console.log(`[Instagram/${businessName}] Insights (prev 7d) error:`, err.response?.data?.error?.message || err.message);
        return { data: { data: [] } };
      }),
      axios.get(`${BASE_URL}/${accountId}/insights`, {
        params: {
          metric: "follower_count",
          period: "day",
          since: sinceTs7,
          until: untilTs,
          access_token: accessToken,
        }
      }).catch(err => {
        console.log(`[Instagram/${businessName}] Follower count error:`, err.response?.data?.error?.message || err.message);
        return { data: { data: [] } };
      }),
    ]);

    const last7Data = reachLast7.data.data || [];
    const prev7Data = reachPrev7.data.data || [];
    const followerData = followerInsights.data.data || [];

    console.log(`[Instagram/${businessName}] Insights metrics returned (last7): [${last7Data.map(m => m.name).join(", ")}]`);
    console.log(`[Instagram/${businessName}] Follower data points: ${followerData[0]?.values?.length || 0}`);

    // Helpers
    const sumMetricValues = (dataArr, metricName) => {
      const metric = dataArr.find(m => m.name === metricName);
      if (!metric?.values?.length) return 0;
      return metric.values.reduce((sum, v) => sum + (v.value || 0), 0);
    };
    const getLastValue = (dataArr, metricName) => {
      const metric = dataArr.find(m => m.name === metricName);
      if (!metric?.values?.length) return 0;
      return metric.values[metric.values.length - 1]?.value || 0;
    };

    const last7Reach = sumMetricValues(last7Data, "reach");
    const prev7Reach = sumMetricValues(prev7Data, "reach");
    const yesterdayReach = getLastValue(last7Data, "reach");

    console.log(`[Instagram/${businessName}] Last 7d reach: ${last7Reach}, yesterday reach: ${yesterdayReach}`);

    // ── Follower change ──
    const followerMetric = followerData.find(m => m.name === "follower_count");
    let followerChange = 0;
    let followerGrowthRate = 0;
    if (followerMetric?.values?.length >= 2) {
      const firstVal = followerMetric.values[0]?.value || 0;
      const lastVal = followerMetric.values[followerMetric.values.length - 1]?.value || 0;
      const currentFollowers = profile.followers_count || 0;

      // Detect: if values are close to total followers, they're cumulative counts
      if (firstVal > currentFollowers * 0.5 && lastVal > currentFollowers * 0.5) {
        followerChange = lastVal - firstVal;
        followerGrowthRate = firstVal > 0 ? ((followerChange / firstVal) * 100).toFixed(2) : 0;
      } else {
        // Daily deltas — sum them
        followerChange = followerMetric.values.reduce((sum, v) => sum + (v.value || 0), 0);
        followerGrowthRate = currentFollowers > 0 ? ((followerChange / currentFollowers) * 100).toFixed(2) : 0;
      }
      console.log(`[Instagram/${businessName}] Follower tracking: first=${firstVal}, last=${lastVal}, change=${followerChange}, rate=${followerGrowthRate}%`);
    } else {
      console.log(`[Instagram/${businessName}] Insufficient follower data points (need ≥2, got ${followerMetric?.values?.length || 0})`);
    }

    // ─────────────────────────────────────────────────────────
    // 3. PER-POST INSIGHTS
    //    In v21+: "engagement" and "impressions" are DEPRECATED for media
    //    Use "reach", "saved", "views" (replaces both impressions and plays)
    //    likes + comments come from the media fields directly
    // ─────────────────────────────────────────────────────────
    const recentPosts = allMedia.slice(0, 15);

    const postsWithInsights = await Promise.all(
      recentPosts.map(async (post) => {
        try {
          // v21+ media metrics: reach, saved, views
          // "views" replaces both "impressions" and "plays"
          const insightsRes = await axios.get(`${BASE_URL}/${post.id}/insights`, {
            params: {
              metric: "reach,saved",
              access_token: accessToken,
            }
          });

          const postInsights = insightsRes.data.data || [];
          const getValue = (name) => {
            const m = postInsights.find(i => i.name === name);
            return m?.values?.[0]?.value || 0;
          };

          const likes = post.like_count || 0;
          const comments = post.comments_count || 0;

          return {
            ...post,
            insights: {
              engagement: likes + comments, // engagement = likes + comments (NOT saves)
              reach: getValue("reach"),
              saved: getValue("saved"),
              views: 0,
            }
          };
        } catch (err) {
          console.log(`[Instagram/${businessName}] Post insights error for ${post.id}: ${err.response?.data?.error?.message || err.message}`);
          return {
            ...post,
            insights: {
              engagement: (post.like_count || 0) + (post.comments_count || 0),
              reach: 0,
              saved: 0,
              views: 0,
            }
          };
        }
      })
    );

    // Now try to get "views" separately (it can fail on older posts or IMAGE posts)
    for (let i = 0; i < postsWithInsights.length; i++) {
      const post = postsWithInsights[i];
      try {
        const viewsRes = await axios.get(`${BASE_URL}/${post.id}/insights`, {
          params: {
            metric: "views",
            access_token: accessToken,
          }
        });
        const viewsData = viewsRes.data.data || [];
        const viewsMetric = viewsData.find(m => m.name === "views");
        postsWithInsights[i].insights.views = viewsMetric?.values?.[0]?.value || 0;
      } catch (err) {
        // "views" not available for this post type or older posts — fine
        postsWithInsights[i].insights.views = 0;
      }
    }

    // Log a sample of what we got
    const samplePost = postsWithInsights[0];
    if (samplePost) {
      console.log(`[Instagram/${businessName}] Sample post insights: reach=${samplePost.insights?.reach}, saved=${samplePost.insights?.saved}, views=${samplePost.insights?.views}, likes=${samplePost.like_count}, comments=${samplePost.comments_count}`);
    }

    // ─────────────────────────────────────────────────────────
    // 4. ENGAGEMENT METRICS (last 7 days)
    // ─────────────────────────────────────────────────────────
    const last7DaysPosts = postsWithInsights.filter(
      p => new Date(p.timestamp).getTime() >= last7Start.getTime()
    );

    console.log(`[Instagram/${businessName}] Posts in last 7 days: ${last7DaysPosts.length}`);

    const engagementPosts = last7DaysPosts.length > 0 ? last7DaysPosts : postsWithInsights.slice(0, 5);

    const totalEngagement = engagementPosts.reduce((sum, p) =>
      sum + (p.insights?.engagement || (p.like_count || 0) + (p.comments_count || 0)), 0
    );
    const avgEngagement = engagementPosts.length > 0
      ? Math.round(totalEngagement / engagementPosts.length)
      : 0;

    // Engagement rate: avg engagement per post / followers × 100
    const engagementRate = profile.followers_count > 0
      ? ((avgEngagement / profile.followers_count) * 100).toFixed(2)
      : "0.00";

    const totalLikes = engagementPosts.reduce((sum, p) => sum + (p.like_count || 0), 0);
    const totalComments = engagementPosts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    const totalSaves = engagementPosts.reduce((sum, p) => sum + (p.insights?.saved || 0), 0);

    // Video views from all recent posts (including reels)
    const totalVideoViews = postsWithInsights
      .filter(p => p.media_type === "VIDEO")
      .reduce((sum, p) => sum + (p.insights?.views || 0), 0);

    // Total views across all post types
    const totalViews = postsWithInsights.reduce((sum, p) => sum + (p.insights?.views || 0), 0);

    // ─────────────────────────────────────────────────────────
    // 5. CONTENT MIX
    //    IMPORTANT: Instagram API returns "VIDEO" for Reels too.
    //    There is no "REEL" media_type in the Graph API.
    //    Types are: IMAGE, VIDEO, CAROUSEL_ALBUM
    // ─────────────────────────────────────────────────────────
    const contentMixPosts = last7DaysPosts.length > 0 ? last7DaysPosts : postsWithInsights;
    const contentMix = {};
    contentMixPosts.forEach(post => {
      // Map to friendly names
      let type = post.media_type || "UNKNOWN";
      if (type === "VIDEO") type = "REEL/VIDEO";
      else if (type === "CAROUSEL_ALBUM") type = "CAROUSEL";
      contentMix[type] = (contentMix[type] || 0) + 1;
    });

    const contentMixAll = {};
    allMedia.forEach(post => {
      let type = post.media_type || "UNKNOWN";
      if (type === "VIDEO") type = "REEL/VIDEO";
      else if (type === "CAROUSEL_ALBUM") type = "CAROUSEL";
      contentMixAll[type] = (contentMixAll[type] || 0) + 1;
    });

    // ─────────────────────────────────────────────────────────
    // 6. TOP POSTS (sorted by engagement)
    // ─────────────────────────────────────────────────────────
    const topPosts = postsWithInsights
      .sort((a, b) => (b.insights?.engagement || 0) - (a.insights?.engagement || 0))
      .slice(0, 5)
      .map(p => {
        let type = p.media_type || "UNKNOWN";
        if (type === "VIDEO") type = "Reel/Video";
        else if (type === "CAROUSEL_ALBUM") type = "Carousel";
        else if (type === "IMAGE") type = "Image";

        return {
          type,
          likes: p.like_count || 0,
          comments: p.comments_count || 0,
          saves: p.insights?.saved || 0,
          engagement: p.insights?.engagement || (p.like_count || 0) + (p.comments_count || 0),
          reach: p.insights?.reach || 0,
          views: p.insights?.views || 0,
          engagementRate: profile.followers_count > 0
            ? (((p.insights?.engagement || (p.like_count || 0) + (p.comments_count || 0)) / profile.followers_count) * 100).toFixed(2)
            : "0.00",
          postedAt: p.timestamp,
          url: p.permalink,
          captionPreview: (p.caption || "No caption").substring(0, 80),
        };
      });

    // ─────────────────────────────────────────────────────────
    // 7. BUILD RESPONSE
    // ─────────────────────────────────────────────────────────
    console.log(`[Instagram/${businessName}] Final: ${profile.followers_count} followers, ${avgEngagement} avg engagement, ${engagementRate}% rate, ${totalViews} total views`);

    return {
      business: businessName,
      source: "instagram",
      platform: "instagram",

      profile: {
        username: profile.username,
        name: profile.name,
        followers: profile.followers_count,
        following: profile.follows_count,
        totalPosts: profile.media_count,
        followerChange7d: followerChange,
        followerGrowthRate7d: parseFloat(followerGrowthRate),
      },

      yesterday: {
        reach: yesterdayReach,
      },

      last7Days: {
        reach: last7Reach,
        views: totalViews,
        postsPublished: last7DaysPosts.length,
        totalVideoViews: totalVideoViews,
        totalSaves: totalSaves,
      },

      prev7Days: {
        reach: prev7Reach,
      },

      engagement: {
        rate: parseFloat(engagementRate),
        avgEngagementPerPost: avgEngagement,
        avgLikesPerPost: engagementPosts.length > 0 ? Math.round(totalLikes / engagementPosts.length) : 0,
        avgCommentsPerPost: engagementPosts.length > 0 ? Math.round(totalComments / engagementPosts.length) : 0,
        avgSavesPerPost: engagementPosts.length > 0 ? Math.round(totalSaves / engagementPosts.length) : 0,
        postsAnalyzed: engagementPosts.length,
        periodLabel: last7DaysPosts.length > 0 ? "last 7 days" : "recent posts",
      },

      contentMix: contentMix,
      contentMixAll: contentMixAll,
      topPosts: topPosts,

      insights: {
        reachChange: prev7Reach > 0
          ? (((last7Reach - prev7Reach) / prev7Reach) * 100).toFixed(1)
          : "N/A",
        note: "profile_views, website_clicks, impressions deprecated in Meta API v21+ (Jan 2025). Using 'views' and 'reach' per-post instead.",
      }
    };

  } catch (err) {
    console.error(`[Instagram/${businessName}] Error:`, err.response?.data?.error || err.message);
    return {
      business: businessName,
      source: "instagram",
      platform: "instagram",
      error: err.response?.data?.error?.message || err.message,
    };
  }
}


// ═══════════════════════════════════════════════════════════════
// FACEBOOK PAGE DATA COLLECTION
// ═══════════════════════════════════════════════════════════════
async function getFacebookPageData(pageId, accessToken, businessName) {
  const nowNZ = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" }));
  const todayNZ = new Date(nowNZ.getFullYear(), nowNZ.getMonth(), nowNZ.getDate());

  const last7Start = new Date(todayNZ);
  last7Start.setDate(last7Start.getDate() - 7);

  const last14Start = new Date(todayNZ);
  last14Start.setDate(last14Start.getDate() - 14);

  const sinceTs7 = Math.floor(last7Start.getTime() / 1000);
  const sinceTs14 = Math.floor(last14Start.getTime() / 1000);
  const untilTs = Math.floor(todayNZ.getTime() / 1000);
  const untilTs7 = Math.floor(last7Start.getTime() / 1000);

  console.log(`[Facebook/${businessName}] Fetching Facebook Page metrics...`);

  try {
    const [pageRes, postsRes] = await Promise.all([
      axios.get(`${BASE_URL}/${pageId}`, {
        params: {
          fields: "name,fan_count,followers_count,link",
          access_token: accessToken,
        }
      }),
      axios.get(`${BASE_URL}/${pageId}/posts`, {
        params: {
          fields: "id,message,created_time,type,permalink_url,shares,likes.summary(true),comments.summary(true),reactions.summary(true)",
          limit: 15,
          access_token: accessToken,
        }
      }),
    ]);

    const page = pageRes.data;
    const posts = postsRes.data.data || [];

    console.log(`[Facebook/${businessName}] Page: ${page.name}, ${page.fan_count || 0} likes, ${page.followers_count || 0} followers`);

    const [insightsLast7, insightsPrev7] = await Promise.all([
      axios.get(`${BASE_URL}/${pageId}/insights`, {
        params: {
          metric: "page_impressions,page_engaged_users,page_fan_adds,page_fan_removes,page_views_total,page_post_engagements",
          period: "day",
          since: sinceTs7,
          until: untilTs,
          access_token: accessToken,
        }
      }).catch(err => {
        console.log(`[Facebook/${businessName}] Page insights (last 7d) error:`, err.response?.data?.error?.message || err.message);
        return { data: { data: [] } };
      }),
      axios.get(`${BASE_URL}/${pageId}/insights`, {
        params: {
          metric: "page_impressions,page_engaged_users,page_fan_adds,page_fan_removes,page_views_total",
          period: "day",
          since: sinceTs14,
          until: untilTs7,
          access_token: accessToken,
        }
      }).catch(err => {
        console.log(`[Facebook/${businessName}] Page insights (prev 7d) error:`, err.response?.data?.error?.message || err.message);
        return { data: { data: [] } };
      }),
    ]);

    const last7Insights = insightsLast7.data.data || [];
    const prev7Insights = insightsPrev7.data.data || [];

    const sumMetric = (arr, name) => {
      const m = arr.find(i => i.name === name);
      if (!m?.values?.length) return 0;
      return m.values.reduce((sum, v) => sum + (v.value || 0), 0);
    };

    const last7Impressions = sumMetric(last7Insights, "page_impressions");
    const prev7Impressions = sumMetric(prev7Insights, "page_impressions");
    const last7Engaged = sumMetric(last7Insights, "page_engaged_users");
    const last7NewFans = sumMetric(last7Insights, "page_fan_adds");
    const last7LostFans = sumMetric(last7Insights, "page_fan_removes");
    const last7PageViews = sumMetric(last7Insights, "page_views_total");
    const prev7PageViews = sumMetric(prev7Insights, "page_views_total");
    const last7PostEngagements = sumMetric(last7Insights, "page_post_engagements");

    const last7Posts = posts.filter(p => new Date(p.created_time).getTime() >= last7Start.getTime());

    const topPosts = posts
      .map(p => {
        const likes = p.likes?.summary?.total_count || 0;
        const comments = p.comments?.summary?.total_count || 0;
        const shares = p.shares?.count || 0;
        const reactions = p.reactions?.summary?.total_count || 0;
        return {
          type: p.type || "status",
          likes, comments, shares, reactions,
          engagement: reactions + comments + shares,
          postedAt: p.created_time,
          url: p.permalink_url,
          captionPreview: (p.message || "No text").substring(0, 80),
        };
      })
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);

    const followers = page.followers_count || page.fan_count || 0;
    const avgPostEngagement = last7Posts.length > 0
      ? Math.round(last7PostEngagements / Math.max(last7Posts.length, 1))
      : 0;
    const engagementRate = followers > 0
      ? ((avgPostEngagement / followers) * 100).toFixed(2)
      : "0.00";

    const netFollowerChange = last7NewFans - last7LostFans;

    return {
      business: businessName,
      source: "facebook",
      platform: "facebook",
      profile: {
        name: page.name,
        followers,
        pageLikes: page.fan_count || 0,
        followerChange7d: netFollowerChange,
        newFans7d: last7NewFans,
        lostFans7d: last7LostFans,
      },
      last7Days: {
        impressions: last7Impressions,
        engagedUsers: last7Engaged,
        pageViews: last7PageViews,
        postEngagements: last7PostEngagements,
        postsPublished: last7Posts.length,
      },
      prev7Days: {
        impressions: prev7Impressions,
        pageViews: prev7PageViews,
      },
      engagement: {
        rate: parseFloat(engagementRate),
        avgEngagementPerPost: avgPostEngagement,
      },
      topPosts,
      insights: {
        impressionsChange: prev7Impressions > 0
          ? (((last7Impressions - prev7Impressions) / prev7Impressions) * 100).toFixed(1)
          : "N/A",
        pageViewsChange: prev7PageViews > 0
          ? (((last7PageViews - prev7PageViews) / prev7PageViews) * 100).toFixed(1)
          : "N/A",
      },
    };

  } catch (err) {
    console.error(`[Facebook/${businessName}] Error:`, err.response?.data?.error || err.message);
    return {
      business: businessName,
      source: "facebook",
      platform: "facebook",
      error: err.response?.data?.error?.message || err.message,
    };
  }
}


// ═══════════════════════════════════════════════════════════════
// COMBINED SOCIAL DATA
// ═══════════════════════════════════════════════════════════════
async function getSocialData(config, businessName) {
  const results = {};

  if (config.instagram?.accountId && config.instagram?.accessToken) {
    results.instagram = await getInstagramData(
      config.instagram.accountId,
      config.instagram.accessToken,
      businessName
    );
  }

  if (config.facebook?.pageId && config.facebook?.accessToken) {
    results.facebook = await getFacebookPageData(
      config.facebook.pageId,
      config.facebook.accessToken,
      businessName
    );
  }

  const hasAny = results.instagram || results.facebook;
  if (!hasAny) {
    return { business: businessName, source: "social", error: "No social accounts configured" };
  }

  return {
    business: businessName,
    source: "social",
    instagram: results.instagram || null,
    facebook: results.facebook || null,
  };
}

module.exports = { getSocialData, getInstagramData, getFacebookPageData };
