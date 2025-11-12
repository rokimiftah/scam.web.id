// convex/schema.ts

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const scamTypes = v.union(
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
);

const verificationStatus = v.union(
  v.literal("unverified"),
  v.literal("community_verified"),
  v.literal("mod_verified"),
  v.literal("ai_flagged"),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    linkedProviders: v.optional(v.array(v.string())),
    storageId: v.optional(v.string()),
  }).index("email", ["email"]),

  scamStories: defineTable({
    // Reddit metadata
    redditUrl: v.string(),
    subreddit: v.string(),
    postId: v.string(),
    authorUsername: v.string(),
    postDate: v.number(),
    upvotes: v.number(),
    num_comments: v.optional(v.number()), // Number of comments on Reddit

    // Story content
    title: v.string(),
    summary: v.string(),
    fullStory: v.string(),

    // Location data
    country: v.string(),
    city: v.optional(v.string()),
    specificLocation: v.optional(v.string()),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),

    // Scam categorization
    scamType: scamTypes,
    scamMethods: v.array(v.string()),
    targetDemographics: v.array(v.string()),

    // Financial impact
    moneyLost: v.optional(v.number()),
    currency: v.optional(v.string()),

    // AI Analysis
    warningSignals: v.array(v.string()),
    preventionTips: v.array(v.string()),
    resolution: v.optional(v.string()),
    aiConfidenceScore: v.number(),

    // Verification
    verificationStatus: verificationStatus,
    evidenceUrls: v.optional(v.array(v.string())),

    // Engagement
    helpfulCount: v.number(),
    viewCount: v.number(),
    reportCount: v.number(),

    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
    isProcessed: v.boolean(),
    processingErrors: v.optional(v.array(v.string())),
    processingAttempts: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),

    // Source tracking (for stories created from comments)
    sourceCommentId: v.optional(v.id("scamComments")),
    sourceStoryId: v.optional(v.id("scamStories")),
  })
    .index("by_country", ["country"])
    .index("by_type", ["scamType"])
    .index("by_subreddit", ["subreddit"])
    .index("by_post_id", ["postId"]) // Unique index for duplicate detection
    .index("by_date", ["postDate"])
    .index("by_verification", ["verificationStatus"])
    .index("by_processed", ["isProcessed"])
    // Composite index to efficiently query processed stories by recent postDate ranges
    .index("by_processed_postDate", ["isProcessed", "postDate"])
    .searchIndex("search_stories", {
      searchField: "fullStory",
      filterFields: ["country", "scamType", "verificationStatus"],
    }),

  scamComments: defineTable({
    storyId: v.id("scamStories"),
    redditCommentId: v.string(),
    authorUsername: v.string(),
    content: v.string(),
    upvotes: v.number(),
    isHelpful: v.boolean(),
    containsAdvice: v.boolean(),
    postedAt: v.number(),
    isAnalyzedForScam: v.optional(v.boolean()),
    analyzedAt: v.optional(v.number()),
  })
    .index("by_story", ["storyId"])
    .index("by_analyzed", ["isAnalyzedForScam", "analyzedAt"]),

  redditFetchJobs: defineTable({
    subreddit: v.string(),
    keyword: v.string(),
    lastFetchedAt: v.optional(v.number()),
    lastPostId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
    postsProcessed: v.number(),
  }).index("by_status", ["status"]),

  locationStats: defineTable({
    country: v.string(),
    city: v.optional(v.string()),
    totalScams: v.number(),
    topScamTypes: v.array(
      v.object({
        type: scamTypes,
        count: v.number(),
      }),
    ),
    averageLoss: v.optional(v.number()),
    lastUpdated: v.number(),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
  })
    .index("by_country", ["country"])
    .index("by_city", ["city"]),

  userReports: defineTable({
    userId: v.id("users"),
    storyId: v.id("scamStories"),
    reportType: v.union(v.literal("fake"), v.literal("inappropriate"), v.literal("duplicate"), v.literal("other")),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_story", ["storyId"]),
});
