// convex/scams.ts

import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";

// Get total scam count (all processed scam stories)
export const getTotalScamCount = query({
  args: {},
  handler: async (ctx) => {
    // Check authentication first
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return 0; // Return 0 for unauthenticated users
    }

    // Optimized: Use collect() which handles pagination internally
    const stories = await ctx.db
      .query("scamStories")
      .withIndex("by_processed", (q) => q.eq("isProcessed", true))
      .collect();

    return stories.length;
  },
});

// Get lightweight data for globe visualization - only essential fields
export const getScamStoriesForGlobe = query({
  args: {},
  handler: async (ctx) => {
    // Check authentication first
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return []; // Return empty array for unauthenticated users
    }

    // Optimized: Use collect() to get all stories with single paginated query
    const allStories = await ctx.db
      .query("scamStories")
      .withIndex("by_processed", (q) => q.eq("isProcessed", true))
      .collect();

    // Only extract essential fields for visualization (reduce payload size)
    return allStories
      .filter((story) => story.coordinates?.lat && story.coordinates?.lng) // Only stories with coordinates
      .map((story) => ({
        _id: story._id,
        country: story.country,
        city: story.city,
        coordinates: story.coordinates,
        scamType: story.scamType,
        scamMethods: story.scamMethods,
        title: story.title,
        summary: story.summary,
        postDate: story.postDate,
        upvotes: story.upvotes,
        moneyLost: story.moneyLost,
        currency: story.currency,
        redditUrl: story.redditUrl,
        warningSignals: story.warningSignals,
        preventionTips: story.preventionTips,
        authorUsername: story.authorUsername,
      }));
  },
});

// Get all scam stories with filters
export const getScamStories = query({
  args: {
    country: v.optional(v.string()),
    scamType: v.optional(
      v.union(
        v.literal("taxi"),
        v.literal("accommodation"),
        v.literal("tour"),
        v.literal("police"),
        v.literal("atm"),
        v.literal("restaurant"),
        v.literal("shopping"),
        v.literal("visa"),
        v.literal("airport"),
        v.literal("pickpocket"),
        v.literal("romance"),
        v.literal("timeshare"),
        v.literal("fake_ticket"),
        v.literal("currency_exchange"),
        v.literal("other"),
      ),
    ),
    verificationStatus: v.optional(
      v.union(v.literal("unverified"), v.literal("community_verified"), v.literal("mod_verified"), v.literal("ai_flagged")),
    ),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("date"), v.literal("upvotes"), v.literal("views"))),
  },
  handler: async (ctx, args) => {
    const { country, scamType, verificationStatus, limit = 50, sortBy = "date" } = args;

    let query = ctx.db.query("scamStories").withIndex("by_processed", (q) => q.eq("isProcessed", true));

    // Apply filters using indexes where possible
    if (country) {
      query = ctx.db
        .query("scamStories")
        .withIndex("by_country", (q) => q.eq("country", country))
        .filter((q) => q.eq(q.field("isProcessed"), true));
    } else if (scamType) {
      query = ctx.db
        .query("scamStories")
        .withIndex("by_type", (q) => q.eq("scamType", scamType))
        .filter((q) => q.eq(q.field("isProcessed"), true));
    }

    // Take more than needed for sorting, but not all
    const fetchLimit = Math.min(limit * 10, 500);
    let stories = await query.order("desc").take(fetchLimit);

    // Apply additional filters in memory
    if (verificationStatus) {
      stories = stories.filter((s) => s.verificationStatus === verificationStatus);
    }

    // Apply sorting
    if (sortBy === "date") {
      stories.sort((a, b) => b.postDate - a.postDate);
    } else if (sortBy === "upvotes") {
      stories.sort((a, b) => b.upvotes - a.upvotes);
    } else if (sortBy === "views") {
      stories.sort((a, b) => b.viewCount - a.viewCount);
    }

    return stories.slice(0, limit);
  },
});

// Get single scam story with comments
export const getScamStory = query({
  args: {
    storyId: v.id("scamStories"),
  },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);

    if (!story) {
      return null;
    }

    // Get comments
    const comments = await ctx.db
      .query("scamComments")
      .withIndex("by_story")
      .filter((q) => q.eq(q.field("storyId"), args.storyId))
      .order("desc")
      .take(50);

    // Note: View count increment removed as query doesn't have write access

    return {
      ...story,
      comments,
    };
  },
});

// Search scam stories
export const searchScamStories = query({
  args: {
    query: v.string(),
    filters: v.optional(
      v.object({
        country: v.optional(v.string()),
        scamType: v.optional(v.string()),
        verificationStatus: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("scamStories")
      .withSearchIndex("search_stories", (q) => {
        let searchQuery = q.search("fullStory", args.query);

        if (args.filters?.country) {
          searchQuery = searchQuery.eq("country", args.filters.country);
        }
        if (args.filters?.scamType) {
          searchQuery = searchQuery.eq("scamType", args.filters.scamType as any);
        }
        if (args.filters?.verificationStatus) {
          searchQuery = searchQuery.eq("verificationStatus", args.filters.verificationStatus as any);
        }

        return searchQuery;
      })
      .take(50);

    return results;
  },
});

// Get ALL location statistics for globe visualization
export const getAllLocationStats = query({
  args: {},
  handler: async (ctx) => {
    // Check authentication first
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return []; // Return empty array for unauthenticated users
    }

    // Optimized: Use collect() for single paginated query
    const allStats = await ctx.db.query("locationStats").collect();

    // Filter only stats with coordinates (for globe visualization)
    const statsWithCoords = allStats.filter((stat) => stat.coordinates?.lat && stat.coordinates?.lng);

    // Sort by total scams (descending)
    statsWithCoords.sort((a, b) => b.totalScams - a.totalScams);

    return statsWithCoords;
  },
});

// Get location statistics
export const getLocationStats = query({
  args: {
    country: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { country, limit = 100 } = args;

    const stats = country
      ? await ctx.db
          .query("locationStats")
          .withIndex("by_country", (q) => q.eq("country", country))
          .take(limit)
      : await ctx.db.query("locationStats").order("desc").take(limit);

    // Sort by total scams
    stats.sort((a, b) => b.totalScams - a.totalScams);

    return stats;
  },
});

// Get trending scams (most viewed/recent)
export const getTrendingScams = query({
  args: {
    timeframe: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { timeframe = "week", limit = 10 } = args;

    const now = Date.now();
    let cutoffTime = now;

    switch (timeframe) {
      case "day":
        cutoffTime = now - 24 * 60 * 60 * 1000;
        break;
      case "week":
        cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    const stories = await ctx.db
      .query("scamStories")
      .filter((q) => q.and(q.eq(q.field("isProcessed"), true), q.gte(q.field("postDate"), cutoffTime)))
      .order("desc")
      .take(limit);

    // Sort by combination of views and upvotes
    stories.sort((a, b) => {
      const scoreA = a.viewCount * 0.3 + a.upvotes * 0.7;
      const scoreB = b.viewCount * 0.3 + b.upvotes * 0.7;
      return scoreB - scoreA;
    });

    return stories;
  },
});

// Get scam types with counts
export const getScamTypeStats = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all processed stories once (single paginated query)
    const allStories = await ctx.db
      .query("scamStories")
      .withIndex("by_processed", (q) => q.eq("isProcessed", true))
      .collect();

    // Count in memory
    const typeCounts = new Map<string, number>();

    allStories.forEach((story) => {
      const count = typeCounts.get(story.scamType) || 0;
      typeCounts.set(story.scamType, count + 1);
    });

    const total = allStories.length;
    const stats = Array.from(typeCounts.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));

    // Sort by count
    stats.sort((a, b) => b.count - a.count);

    return stats;
  },
});

// Mark story as helpful
export const markAsHelpful = mutation({
  args: {
    storyId: v.id("scamStories"),
  },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);

    if (!story) {
      throw new Error("Story not found");
    }

    await ctx.db.patch(args.storyId, {
      helpfulCount: story.helpfulCount + 1,
    });

    return { success: true };
  },
});

// Report a story
export const reportStory = mutation({
  args: {
    storyId: v.id("scamStories"),
    reportType: v.union(v.literal("fake"), v.literal("inappropriate"), v.literal("duplicate"), v.literal("other")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Must be logged in to report");
    }

    // Get user
    const user = await ctx.db
      .query("users")
      .withIndex("email")
      .filter((q) => q.eq(q.field("email"), identity.email))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if already reported
    const existingReport = await ctx.db
      .query("userReports")
      .withIndex("by_story")
      .filter((q) => q.and(q.eq(q.field("storyId"), args.storyId), q.eq(q.field("userId"), user._id)))
      .first();

    if (existingReport) {
      throw new Error("Already reported this story");
    }

    // Create report
    await ctx.db.insert("userReports", {
      userId: user._id,
      storyId: args.storyId,
      reportType: args.reportType,
      reason: args.reason,
      createdAt: Date.now(),
    });

    // Update story report count
    const story = await ctx.db.get(args.storyId);
    if (story) {
      await ctx.db.patch(args.storyId, {
        reportCount: story.reportCount + 1,
      });
    }

    return { success: true };
  },
});

// Get countries with most scams
export const getTopScamCountries = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 10 } = args;

    const stats = await ctx.db.query("locationStats").take(100);

    // Group by country
    const countryMap = new Map<string, { country: string; totalScams: number; cities: number }>();

    stats.forEach((stat) => {
      const existing = countryMap.get(stat.country);
      if (existing) {
        existing.totalScams += stat.totalScams;
        if (stat.city) existing.cities++;
      } else {
        countryMap.set(stat.country, {
          country: stat.country,
          totalScams: stat.totalScams,
          cities: stat.city ? 1 : 0,
        });
      }
    });

    const countries = Array.from(countryMap.values());
    countries.sort((a, b) => b.totalScams - a.totalScams);

    return countries.slice(0, limit);
  },
});

// Get recent comments with advice
export const getHelpfulComments = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 20 } = args;

    const comments = await ctx.db
      .query("scamComments")
      .filter((q) => q.eq(q.field("containsAdvice"), true))
      .order("desc")
      .take(limit);

    // Get associated stories
    const commentsWithStories = await Promise.all(
      comments.map(async (comment) => {
        const story = await ctx.db.get(comment.storyId);
        return {
          ...comment,
          storyTitle: story?.title || "Unknown",
          storyCountry: story?.country || "Unknown",
        };
      }),
    );

    return commentsWithStories;
  },
});

export const getScamStoriesForCountry = internalQuery({
  args: { country: v.string() },
  handler: async (ctx, { country }) => {
    return ctx.db
      .query("scamStories")
      .withIndex("by_country", (q) => q.eq("country", country))
      .filter((q) => q.eq(q.field("isProcessed"), true))
      .take(100); // Limit to avoid memory issues
  },
});
