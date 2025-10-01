// convex/reddit.ts

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";

const REDDIT_KEYWORDS = [
	"travel scam",
	"scam",
	"scammed",
	"rip off",
	"timeshare",
	"taxi",
	"tour",
	"fraud",
	"fake",
	"warning",
	"avoid",
	"pickpocket",
	"atm",
	"booking",
	"visa",
	"airport",
	"police",
	"ticket",
];

const SUBREDDITS = ["travel", "solotravel", "scams", "digitalnomad", "traveladvice"];

export const fetchRedditPosts = internalAction({
	args: {
		subreddit: v.string(),
		keyword: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { subreddit, keyword, limit = 100 } = args;

		try {
			// Add delay before request to respect rate limits
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Using Reddit's JSON API (no auth needed for public data)
			const searchUrl = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(
				keyword,
			)}&restrict_sr=on&sort=new&limit=${limit}`;

			const response = await fetch(searchUrl, {
				headers: {
					"User-Agent": "TravelScamTracker/1.0 (by /u/yourusername)",
					Accept: "application/json",
				},
			});

			if (response.status === 429) {
				// Rate limited - wait longer and retry
				console.log(`Rate limited on ${subreddit}/${keyword}, waiting 60 seconds...`);
				await new Promise((resolve) => setTimeout(resolve, 60000));

				// Retry once with smaller limit
				const retryResponse = await fetch(searchUrl.replace(`limit=${limit}`, `limit=10`), {
					headers: {
						"User-Agent": "TravelScamTracker/1.0 (by /u/yourusername)",
						Accept: "application/json",
					},
				});

				if (!retryResponse.ok) {
					console.error(`Failed after retry: ${retryResponse.status}`);
					return { success: false, postsProcessed: 0 };
				}

				const data = await retryResponse.json();
				const posts = data.data?.children?.map((child: any) => child.data) || [];

				// Process fewer posts to avoid further rate limiting
				for (const post of posts.slice(0, 5)) {
					await ctx.runMutation(internal.reddit.storeRawPost, {
						postData: {
							id: post.id,
							title: post.title,
							selftext: post.selftext || "",
							author: post.author,
							subreddit: post.subreddit,
							created_utc: post.created_utc,
							ups: post.ups,
							num_comments: post.num_comments,
							url: `https://reddit.com${post.permalink}`,
							permalink: post.permalink,
						},
						keyword,
					});
				}

				return { success: true, postsProcessed: posts.length };
			}

			if (!response.ok) {
				throw new Error(`Reddit API error: ${response.status}`);
			}

			const data = await response.json();
			const posts = data.data.children.map((child: any) => child.data);

			// Store posts for processing
			let postCount = 0;
			for (const post of posts) {
				postCount++;
				console.log(`[${postCount}/${posts.length}] Processing: ${post.title.substring(0, 50)}...`);

				try {
					await ctx.runMutation(internal.reddit.storeRawPost, {
						postData: {
							id: post.id,
							title: post.title,
							selftext: post.selftext || "",
							author: post.author,
							subreddit: post.subreddit,
							created_utc: post.created_utc,
							ups: post.ups,
							num_comments: post.num_comments,
							url: `https://reddit.com${post.permalink}`,
							permalink: post.permalink,
						},
						keyword,
					});

					// Fetch ALL comments for every post
					if (post.num_comments > 0) {
						console.log(`  → Fetching ${post.num_comments} comments for post ID: ${post.id}`);
						try {
							await fetchPostComments(ctx, post.id, subreddit);
							// Small delay between comment fetches to avoid rate limit
							await new Promise((resolve) => setTimeout(resolve, 500));
						} catch (commentError) {
							console.error(`  ✗ Failed to fetch comments for post ${post.id}:`, commentError);
							// Continue with next post even if comments fail
						}
					}
				} catch (postError) {
					console.error(`✗ Failed to store post ${post.id}:`, postError);
					// Continue with next post
				}
			}

			// Update job status
			await ctx.runMutation(internal.reddit.updateFetchJobStatus, {
				subreddit,
				keyword,
				status: "completed",
				postsProcessed: posts.length,
			});

			return { success: true, postsProcessed: posts.length };
		} catch (error) {
			await ctx.runMutation(internal.reddit.updateFetchJobStatus, {
				subreddit,
				keyword,
				status: "failed",
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				postsProcessed: 0,
			});
			throw error;
		}
	},
});

async function fetchPostComments(ctx: any, postId: string, subreddit: string) {
	try {
		// Fetch ALL comments (limit=500 for maximum)
		const commentsUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=500&depth=10`;

		const response = await fetch(commentsUrl, {
			headers: {
				"User-Agent": "TravelScamTracker/1.0",
			},
		});

		if (!response.ok) return;

		const data = await response.json();
		if (data.length < 2) return;

		const comments = data[1].data.children;

		for (const comment of comments) {
			if (comment.kind === "t1" && comment.data.body) {
				await ctx.runMutation(internal.reddit.storeRawComment, {
					commentData: {
						id: comment.data.id,
						postId: postId,
						body: comment.data.body,
						author: comment.data.author,
						created_utc: comment.data.created_utc,
						ups: comment.data.ups,
					},
				});
			}
		}
	} catch (error) {
		console.error(`Failed to fetch comments for post ${postId}:`, error);
	}
}

export const storeRawPost = internalMutation({
	args: {
		postData: v.object({
			id: v.string(),
			title: v.string(),
			selftext: v.string(),
			author: v.string(),
			subreddit: v.string(),
			created_utc: v.number(),
			ups: v.number(),
			num_comments: v.number(),
			url: v.string(),
			permalink: v.string(),
		}),
		keyword: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if post already exists
		const existing = await ctx.db
			.query("scamStories")
			.withIndex("by_subreddit")
			.filter((q) => q.eq(q.field("postId"), args.postData.id))
			.first();

		if (!existing) {
			console.log(`  ✓ Storing new post: ${args.postData.id}`);
			// Store as unprocessed story for AI analysis
			await ctx.db.insert("scamStories", {
				redditUrl: args.postData.url,
				subreddit: args.postData.subreddit,
				postId: args.postData.id,
				authorUsername: args.postData.author,
				postDate: args.postData.created_utc * 1000,
				upvotes: args.postData.ups,
				title: args.postData.title,
				summary: "", // Will be filled by AI
				fullStory: args.postData.selftext,
				country: "Unknown", // Will be extracted by AI
				scamType: "other", // Will be categorized by AI
				scamMethods: [],
				targetDemographics: [],
				warningSignals: [],
				preventionTips: [],
				aiConfidenceScore: 0,
				verificationStatus: "unverified",
				helpfulCount: 0,
				viewCount: 0,
				reportCount: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				isProcessed: false,
			});
		} else {
			console.log(`  ⟲ Post already exists: ${args.postData.id} - skipping`);
		}
	},
});

export const storeRawComment = internalMutation({
	args: {
		commentData: v.object({
			id: v.string(),
			postId: v.string(),
			body: v.string(),
			author: v.string(),
			created_utc: v.number(),
			ups: v.number(),
		}),
	},
	handler: async (ctx, args) => {
		// Find the story by postId
		const story = await ctx.db
			.query("scamStories")
			.withIndex("by_subreddit")
			.filter((q) => q.eq(q.field("postId"), args.commentData.postId))
			.first();

		if (story) {
			// Check if comment already exists
			const existingComment = await ctx.db
				.query("scamComments")
				.withIndex("by_story")
				.filter((q) => q.and(q.eq(q.field("storyId"), story._id), q.eq(q.field("redditCommentId"), args.commentData.id)))
				.first();

			if (!existingComment) {
				await ctx.db.insert("scamComments", {
					storyId: story._id,
					redditCommentId: args.commentData.id,
					authorUsername: args.commentData.author,
					content: args.commentData.body,
					upvotes: args.commentData.ups,
					isHelpful: false, // Will be analyzed by AI
					containsAdvice: false, // Will be analyzed by AI
					postedAt: args.commentData.created_utc * 1000,
				});
			}
		}
	},
});

export const updateFetchJobStatus = internalMutation({
	args: {
		subreddit: v.string(),
		keyword: v.string(),
		status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
		errorMessage: v.optional(v.string()),
		postsProcessed: v.number(),
	},
	handler: async (ctx, args) => {
		const existingJob = await ctx.db
			.query("redditFetchJobs")
			.withIndex("by_status")
			.filter((q) => q.and(q.eq(q.field("subreddit"), args.subreddit), q.eq(q.field("keyword"), args.keyword)))
			.first();

		if (existingJob) {
			await ctx.db.patch(existingJob._id, {
				status: args.status,
				errorMessage: args.errorMessage,
				postsProcessed: args.postsProcessed,
				lastFetchedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("redditFetchJobs", {
				subreddit: args.subreddit,
				keyword: args.keyword,
				status: args.status,
				errorMessage: args.errorMessage,
				postsProcessed: args.postsProcessed,
				lastFetchedAt: Date.now(),
			});
		}
	},
});

// NOTE: This function will timeout after 10 minutes. Use fetchBatch instead for reliable processing
export const startRedditCrawl = action({
	args: {},
	handler: async (ctx): Promise<{ success: boolean; totalJobs: number }> => {
		console.warn("WARNING: This function may timeout. Use fetchBatch for reliable processing.");

		let processedJobs = 0;
		const totalJobs = SUBREDDITS.length * REDDIT_KEYWORDS.length;
		const maxRuntime = 9 * 60 * 1000; // 9 minutes (leaving buffer before 10 min timeout)
		const startTime = Date.now();

		// Process sequentially to avoid conflicts
		for (const subreddit of SUBREDDITS) {
			for (const keyword of REDDIT_KEYWORDS) {
				// Check if we're approaching timeout
				if (Date.now() - startTime > maxRuntime) {
					console.log(`Approaching timeout. Processed ${processedJobs}/${totalJobs} jobs.`);
					return { success: true, totalJobs: processedJobs };
				}

				try {
					await ctx.runAction(internal.reddit.fetchRedditPosts, {
						subreddit,
						keyword,
						limit: 10,
					});
					processedJobs++;
					console.log(`Processed ${processedJobs}/${totalJobs}: ${subreddit} - ${keyword}`);

					// Shorter delay to fit more in time limit
					await new Promise((resolve) => setTimeout(resolve, 2000));
				} catch (error) {
					console.error(`Failed to fetch ${subreddit} - ${keyword}:`, error);
					// Shorter error delay
					await new Promise((resolve) => setTimeout(resolve, 3000));
				}
			}
		}

		return { success: true, totalJobs: processedJobs };
	},
});

// ============= TESTING FUNCTIONS =============

// Test fetch minimal - just 1-3 posts
export const testFetch = action({
	args: {},
	handler: async (ctx): Promise<{ success: boolean; postsProcessed: number; title?: string }> => {
		console.log("Testing fetch with minimal data...");

		try {
			const result = await ctx.runAction(internal.reddit.fetchRedditPosts, {
				subreddit: "travel",
				keyword: "scam",
				limit: 3,
			});

			console.log("Test completed:", result);
			return result;
		} catch (error) {
			console.error("Test failed:", error);
			return { success: false, postsProcessed: 0 };
		}
	},
});

// ============= JOB MANAGEMENT =============

// Stop all running jobs
export const stopAllJobs = mutation({
	args: {},
	handler: async (ctx) => {
		const jobs = await ctx.db.query("redditFetchJobs").collect();
		let stopped = 0;

		for (const job of jobs) {
			if (job.status === "processing" || job.status === "pending") {
				await ctx.db.patch(job._id, {
					status: "failed",
					errorMessage: "Manually stopped",
					lastFetchedAt: Date.now(),
				});
				stopped++;
			}
		}

		return { success: true, stoppedJobs: stopped, totalJobs: jobs.length };
	},
});

// Get job statistics
export const getJobStats = query({
	args: {},
	handler: async (ctx) => {
		const jobs = await ctx.db.query("redditFetchJobs").collect();

		const stats = {
			total: jobs.length,
			pending: 0,
			processing: 0,
			completed: 0,
			failed: 0,
		};

		for (const job of jobs) {
			if (job.status in stats) {
				stats[job.status as keyof typeof stats]++;
			}
		}

		return stats;
	},
});

// Clear all job records
export const clearJobHistory = mutation({
	args: {},
	handler: async (ctx) => {
		const jobs = await ctx.db.query("redditFetchJobs").collect();

		for (const job of jobs) {
			await ctx.db.delete(job._id);
		}

		return { success: true, deletedJobs: jobs.length };
	},
});

// ============= DATA CHECK =============

// Check all stories in database
export const getAllStories = query({
	args: {},
	handler: async (ctx) => {
		const stories = await ctx.db.query("scamStories").take(100);
		return {
			total: stories.length,
			processed: stories.filter((s) => s.isProcessed).length,
			unprocessed: stories.filter((s) => !s.isProcessed).length,
			stories: stories.slice(0, 5).map((s) => ({
				title: s.title,
				subreddit: s.subreddit,
				isProcessed: s.isProcessed,
				country: s.country,
			})),
		};
	},
});

// Get processed stories with AI results
export const getProcessedStories = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit || 10;
		const stories = await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), true))
			.take(limit);

		return {
			total: stories.length,
			stories: stories.map((s) => ({
				title: s.title.substring(0, 80),
				subreddit: s.subreddit,
				// AI Analysis Results:
				country: s.country,
				city: s.city,
				scamType: s.scamType,
				moneyLost: s.moneyLost,
				currency: s.currency,
				summary: s.summary,
				warningSignals: s.warningSignals,
				preventionTips: s.preventionTips,
				aiConfidence: s.aiConfidenceScore,
			})),
		};
	},
});

// ============= BATCH PROCESSING =============

// Process in small batches to avoid timeout
export const fetchBatch = action({
	args: {
		batchNumber: v.optional(v.number()),
		batchSize: v.optional(v.number()),
		postsPerKeyword: v.optional(v.number()), // Add customizable limit
	},
	handler: async (ctx, args): Promise<{ success: boolean; processed: number; nextBatch: number; totalPosts: number }> => {
		const batch = args.batchNumber || 0;
		const size = args.batchSize || 5;
		const limit = args.postsPerKeyword || 100; // Default 100 posts per keyword (Reddit max)

		const totalCombinations = SUBREDDITS.length * REDDIT_KEYWORDS.length;
		const startIdx = batch * size;
		const endIdx = Math.min(startIdx + size, totalCombinations);

		if (startIdx >= totalCombinations) {
			return { success: true, processed: 0, nextBatch: 0, totalPosts: 0 };
		}

		let processed = 0;
		let totalPosts = 0;

		for (let i = startIdx; i < endIdx; i++) {
			const subIdx = Math.floor(i / REDDIT_KEYWORDS.length);
			const keyIdx = i % REDDIT_KEYWORDS.length;
			const subreddit = SUBREDDITS[subIdx];
			const keyword = REDDIT_KEYWORDS[keyIdx];

			console.log(`Batch ${batch}: Fetching up to ${limit} posts for "${keyword}" from r/${subreddit}...`);

			try {
				const result = await ctx.runAction(internal.reddit.fetchRedditPosts, {
					subreddit,
					keyword,
					limit, // Use the configurable limit
				});

				const postsCount = result.postsProcessed || 0;
				totalPosts += postsCount;
				console.log(`Got ${postsCount} posts for ${subreddit}/${keyword}`);
				processed++;

				// Longer delay for larger fetches
				const delay = limit > 50 ? 5000 : 3000;
				await new Promise((resolve) => setTimeout(resolve, delay));
			} catch (error) {
				console.error(`Batch ${batch} error for ${subreddit}/${keyword}:`, error);
			}
		}

		return {
			success: true,
			processed,
			nextBatch: endIdx >= totalCombinations ? 0 : batch + 1,
			totalPosts,
		};
	},
});

// Fetch ALL posts for a specific keyword (comprehensive)
export const fetchAllForKeyword = action({
	args: {
		subreddit: v.string(),
		keyword: v.string(),
	},
	handler: async (ctx, args): Promise<{ success: boolean; postsProcessed: number }> => {
		console.log(`Fetching ALL posts for "${args.keyword}" from r/${args.subreddit}...`);

		try {
			// Fetch maximum posts (100 is Reddit's limit per request)
			const result = await ctx.runAction(internal.reddit.fetchRedditPosts, {
				subreddit: args.subreddit,
				keyword: args.keyword,
				limit: 100, // Maximum allowed by Reddit
			});

			console.log(`Successfully fetched ${result.postsProcessed} posts with all comments`);
			return result;
		} catch (error) {
			console.error(`Error fetching ${args.subreddit}/${args.keyword}:`, error);
			return { success: false, postsProcessed: 0 };
		}
	},
});
