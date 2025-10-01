// convex/scams.ts

import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

// Get total scam count (stories + scams from comments)
export const getTotalScamCount = query({
	args: {},
	handler: async (ctx) => {
		// Count processed stories (these are the main scam posts)
		const stories = await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), true))
			.collect();

		// Get location stats
		const locationStats = await ctx.db.query("locationStats").collect();

		// The problem: locationStats might not include all stories
		// Solution: Count stories as the base, then ADD extra scams from comments

		// Group stories by location to get expected counts
		const storyCountsByLocation = new Map<string, number>();
		for (const story of stories) {
			const key = `${story.city || "Unknown"}:::${story.country}`;
			storyCountsByLocation.set(key, (storyCountsByLocation.get(key) || 0) + 1);
		}

		// Calculate additional scams from comments
		let additionalScamsFromComments = 0;
		for (const stat of locationStats) {
			const key = `${stat.city || "Unknown"}:::${stat.country}`;
			const expectedFromStories = storyCountsByLocation.get(key) || 0;

			// If locationStats has MORE than expected, those are comment scams
			if (stat.totalScams > expectedFromStories) {
				additionalScamsFromComments += stat.totalScams - expectedFromStories;
			}
		}

		// Total = all processed stories + additional scams found in comments
		return stories.length + additionalScamsFromComments;
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

		const query = ctx.db.query("scamStories");

		// Get all stories first, then filter
		const allStories = await query.take(1000);

		let filteredStories = allStories.filter((s) => s.isProcessed);

		if (country) {
			filteredStories = filteredStories.filter((s) => s.country === country);
		}

		if (scamType) {
			filteredStories = filteredStories.filter((s) => s.scamType === scamType);
		}

		if (verificationStatus) {
			filteredStories = filteredStories.filter((s) => s.verificationStatus === verificationStatus);
		}

		// Apply sorting
		if (sortBy === "date") {
			filteredStories.sort((a, b) => b.postDate - a.postDate);
		} else if (sortBy === "upvotes") {
			filteredStories.sort((a, b) => b.upvotes - a.upvotes);
		} else if (sortBy === "views") {
			filteredStories.sort((a, b) => b.viewCount - a.viewCount);
		}

		const stories = filteredStories.slice(0, limit);

		return stories;
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

// Get location statistics
export const getLocationStats = query({
	args: {
		country: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { country } = args;

		const allStats = await ctx.db.query("locationStats").take(100);

		let stats = allStats;
		if (country) {
			stats = stats.filter((s) => s.country === country);
		}

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
		const scamTypes = [
			"taxi",
			"accommodation",
			"tour",
			"police",
			"atm",
			"restaurant",
			"shopping",
			"visa",
			"airport",
			"pickpocket",
			"romance",
			"timeshare",
			"fake_ticket",
			"currency_exchange",
			"other",
		] as const;

		const stats = await Promise.all(
			scamTypes.map(async (type) => {
				const count = await ctx.db
					.query("scamStories")
					.withIndex("by_type")
					.filter((q) => q.and(q.eq(q.field("scamType"), type), q.eq(q.field("isProcessed"), true)))
					.collect()
					.then((stories) => stories.length);

				return {
					type,
					count,
					percentage: 0, // Will calculate after
				};
			}),
		);

		const total = stats.reduce((sum, stat) => sum + stat.count, 0);

		// Calculate percentages
		stats.forEach((stat) => {
			stat.percentage = total > 0 ? (stat.count / total) * 100 : 0;
		});

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
