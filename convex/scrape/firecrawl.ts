// convex/scrape/firecrawl.ts

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action, internalAction, internalMutation } from "../_generated/server";

// Firecrawl API configuration
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY as string;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1";

// Reddit URLs to scrape
const REDDIT_BASE_URL = "https://www.reddit.com";
const SUBREDDITS = [
	"travel",
	"solotravel",
	"scams",
	"digitalnomad",
	"traveladvice",
	"portugal",
	"italy",
	"spain",
	"france",
	"germany",
	"thailand",
	"vietnam",
	"japan",
	"india",
	"mexico",
	"indonesia",
];

const KEYWORDS = [
	"scam",
	"scammed",
	"ripped off",
	"fraud",
	"fake police",
	"fake ticket",
	"taxi scam",
	"tour scam",
	"pickpocket",
	"atm scam",
	"overcharged",
	"tourist trap",
	"visa scam",
	"airport scam",
	"accommodation scam",
	"booking scam",
	"timeshare",
	"currency exchange scam",
];

interface FirecrawlScrapeResponse {
	success: boolean;
	data?: {
		markdown?: string;
		content?: string;
		metadata?: {
			title?: string;
			description?: string;
			language?: string;
			sourceURL?: string;
		};
		links?: string[];
	};
	error?: string;
}

interface FirecrawlCrawlResponse {
	success: boolean;
	id?: string;
	status?: string;
	total?: number;
	completed?: number;
	data?: Array<{
		markdown?: string;
		content?: string;
		metadata?: {
			title?: string;
			sourceURL?: string;
		};
	}>;
	error?: string;
}

interface RedditPost {
	id: string;
	title: string;
	selftext: string;
	author: string;
	subreddit: string;
	created_utc: number;
	score: number;
	num_comments: number;
	permalink: string;
	url: string;
}

interface RedditComment {
	id: string;
	body: string;
	author: string;
	score: number;
	created_utc: number;
	parent_id: string;
}

// Scrape a single Reddit URL using Firecrawl
export const scrapeRedditUrl = internalAction({
	args: {
		url: v.string(),
		extractComments: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		if (!FIRECRAWL_API_KEY) {
			throw new Error("FIRECRAWL_API_KEY not configured");
		}

		try {
			console.log(`Scraping URL with Firecrawl: ${args.url}`);

			const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
				},
				body: JSON.stringify({
					url: args.url,
					formats: ["markdown", "links"],
					includeTags: ["main", "article", "div[data-testid='post-container']"],
					waitFor: 2000, // Wait for dynamic content
					timeout: 30000,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
			}

			const data: FirecrawlScrapeResponse = await response.json();

			if (!data.success || !data.data) {
				throw new Error(`Firecrawl scraping failed: ${data.error || "Unknown error"}`);
			}

			// Parse the scraped content
			const content = data.data.markdown || data.data.content || "";
			const links = data.data.links || [];

			// Extract post data from the content
			const postData = parseRedditPost(content, args.url);

			if (postData) {
				// Store the post
				await ctx.runMutation(internal.scrape.firecrawl.storeScrapedPost, {
					postData,
				});

				// Extract comment links if requested
				if (args.extractComments && links.length > 0) {
					const commentLinks = links.filter((link) => link.includes("/comments/"));
					console.log(`Found ${commentLinks.length} comment links`);

					// Scrape comments (limit to avoid rate limits)
					for (const commentLink of commentLinks.slice(0, 5)) {
						await new Promise((resolve) => setTimeout(resolve, 2000)); // Rate limiting
						await scrapeRedditComments(ctx, commentLink, postData.id);
					}
				}
			}

			return {
				success: true,
				postId: postData?.id,
				commentsFound: links.filter((l) => l.includes("/comments/")).length,
			};
		} catch (error) {
			console.error("Firecrawl scraping error:", error);
			throw error;
		}
	},
});

// Internal crawl function
export const crawlSubredditInternal = internalAction({
	args: {
		subreddit: v.string(),
		keyword: v.string(),
		maxPages: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		if (!FIRECRAWL_API_KEY) {
			throw new Error("FIRECRAWL_API_KEY not configured");
		}

		const maxPages = args.maxPages || 10;
		const searchUrl = `${REDDIT_BASE_URL}/r/${args.subreddit}/search?q=${encodeURIComponent(args.keyword)}&restrict_sr=1&sort=new`;

		try {
			console.log(`Starting crawl of r/${args.subreddit} for keyword: ${args.keyword}`);

			// Start a crawl job
			const crawlResponse = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
				},
				body: JSON.stringify({
					url: searchUrl,
					limit: maxPages,
					maxDepth: 2,
					includePaths: [`/r/${args.subreddit}/comments/*`],
					excludePaths: ["/user/*", "/message/*", "/submit"],
					formats: ["markdown"],
					waitFor: 2000,
				}),
			});

			if (!crawlResponse.ok) {
				const errorText = await crawlResponse.text();
				throw new Error(`Firecrawl crawl error: ${crawlResponse.status} - ${errorText}`);
			}

			const crawlData: FirecrawlCrawlResponse = await crawlResponse.json();

			if (!crawlData.success || !crawlData.id) {
				throw new Error(`Failed to start crawl: ${crawlData.error || "Unknown error"}`);
			}

			const crawlId = crawlData.id;
			console.log(`Crawl started with ID: ${crawlId}`);

			// Poll for crawl completion
			let completed = false;
			let attempts = 0;
			const maxAttempts = 60; // 5 minutes max

			while (!completed && attempts < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

				const statusResponse = await fetch(`${FIRECRAWL_API_URL}/crawl/${crawlId}`, {
					headers: {
						Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
					},
				});

				if (statusResponse.ok) {
					const statusData: FirecrawlCrawlResponse = await statusResponse.json();

					if (statusData.status === "completed") {
						completed = true;
						console.log(`Crawl completed: ${statusData.completed}/${statusData.total} pages`);

						// Process the crawled data
						if (statusData.data && statusData.data.length > 0) {
							let processedCount = 0;

							for (const page of statusData.data) {
								if (page.metadata?.sourceURL?.includes("/comments/")) {
									const postData = parseRedditPost(page.markdown || page.content || "", page.metadata.sourceURL);

									if (postData) {
										await ctx.runMutation(internal.scrape.firecrawl.storeScrapedPost, {
											postData,
										});
										processedCount++;
									}
								}
							}

							return {
								success: true,
								crawlId,
								pagesProcessed: statusData.completed || 0,
								postsStored: processedCount,
							};
						}
					} else if (statusData.status === "failed") {
						throw new Error(`Crawl failed: ${statusData.error || "Unknown error"}`);
					}
				}

				attempts++;
			}

			if (!completed) {
				throw new Error("Crawl timed out after 5 minutes");
			}

			return {
				success: false,
				error: "Crawl did not complete",
			};
		} catch (error) {
			console.error(`Crawl error for r/${args.subreddit}:`, error);
			throw error;
		}
	},
});

// Public action wrapper for crawlSubreddit
export const crawlSubreddit = action({
	args: {
		subreddit: v.string(),
		keyword: v.string(),
		maxPages: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<any> => {
		return await ctx.runAction(internal.scrape.firecrawl.crawlSubredditInternal, args);
	},
});

// Batch crawl multiple subreddits
export const batchCrawlSubreddits = action({
	args: {
		subreddits: v.optional(v.array(v.string())),
		keywords: v.optional(v.array(v.string())),
		maxPagesPerCrawl: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<any> => {
		const subredditsToScrape = args.subreddits || SUBREDDITS.slice(0, 5); // Default to first 5
		const keywordsToSearch = args.keywords || KEYWORDS.slice(0, 3); // Default to first 3 keywords
		const maxPages = args.maxPagesPerCrawl || 5;

		const results = [];
		let totalPosts = 0;

		for (const subreddit of subredditsToScrape) {
			for (const keyword of keywordsToSearch) {
				try {
					console.log(`Crawling r/${subreddit} for "${keyword}"...`);

					const result: any = await ctx.runAction(internal.scrape.firecrawl.crawlSubredditInternal, {
						subreddit,
						keyword,
						maxPages,
					});

					results.push({
						subreddit,
						keyword,
						...result,
					});

					if (result.success && result.postsStored) {
						totalPosts += result.postsStored;
					}

					// Rate limiting between crawls
					await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 second delay
				} catch (error) {
					console.error(`Failed to crawl r/${subreddit} for "${keyword}":`, error);
					results.push({
						subreddit,
						keyword,
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}
		}

		return {
			success: true,
			totalCrawls: results.length,
			successfulCrawls: results.filter((r) => r.success).length,
			totalPostsStored: totalPosts,
			results,
		};
	},
});

// Helper function to parse Reddit post from scraped content
function parseRedditPost(content: string, url: string): RedditPost | null {
	try {
		// Extract post ID from URL
		const postIdMatch = url.match(/comments\/([a-z0-9]+)/);
		if (!postIdMatch) return null;

		const postId = postIdMatch[1];

		// Parse the markdown content for post details
		// This is a simplified parser - you may need to adjust based on actual Firecrawl output
		const lines = content.split("\n");

		// Look for title (usually in h1 or first major heading)
		const titleLine = lines.find((line) => line.startsWith("# ") || line.includes(postId));
		const title = titleLine ? titleLine.replace(/^#\s*/, "").trim() : "Unknown Title";

		// Extract author (look for u/ pattern)
		const authorMatch = content.match(/u\/([a-zA-Z0-9_-]+)/);
		const author = authorMatch ? authorMatch[1] : "deleted";

		// Extract subreddit (look for r/ pattern)
		const subredditMatch = url.match(/r\/([a-zA-Z0-9_]+)/);
		const subreddit = subredditMatch ? subredditMatch[1] : "unknown";

		// Extract post content (everything after title, before comments section)
		const contentStart = content.indexOf(title) + title.length;
		const contentEnd = content.indexOf("## Comments") !== -1 ? content.indexOf("## Comments") : content.length;
		const selftext = content.substring(contentStart, contentEnd).trim();

		// Extract score (look for points pattern)
		const scoreMatch = content.match(/(\d+)\s*points?/);
		const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

		// Extract comment count
		const commentMatch = content.match(/(\d+)\s*comments?/);
		const num_comments = commentMatch ? parseInt(commentMatch[1], 10) : 0;

		// Generate permalink
		const permalink = `/r/${subreddit}/comments/${postId}/`;

		return {
			id: postId,
			title,
			selftext,
			author,
			subreddit,
			created_utc: Date.now() / 1000, // Use current time as fallback
			score,
			num_comments,
			permalink,
			url,
		};
	} catch (error) {
		console.error("Error parsing Reddit post:", error);
		return null;
	}
}

// Helper function to scrape comments from a post
async function scrapeRedditComments(ctx: any, url: string, postId: string) {
	try {
		const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
			},
			body: JSON.stringify({
				url,
				formats: ["markdown"],
				includeTags: ["div[data-testid='comment']", ".comment"],
				waitFor: 3000,
			}),
		});

		if (!response.ok) return;

		const data: FirecrawlScrapeResponse = await response.json();
		if (!data.success || !data.data) return;

		const comments = parseRedditComments(data.data.markdown || "", postId);

		for (const comment of comments) {
			await ctx.runMutation(internal.scrape.firecrawl.storeScrapedComment, {
				commentData: comment,
				postId,
			});
		}
	} catch (error) {
		console.error(`Failed to scrape comments from ${url}:`, error);
	}
}

// Parse comments from scraped content
function parseRedditComments(content: string, postId: string): RedditComment[] {
	const comments: RedditComment[] = [];

	try {
		// Split content into comment blocks
		const commentBlocks = content.split(/(?=u\/[a-zA-Z0-9_-]+\s*·\s*\d+\s*points?)/);

		for (const block of commentBlocks) {
			// Extract author
			const authorMatch = block.match(/u\/([a-zA-Z0-9_-]+)/);
			if (!authorMatch) continue;

			const author = authorMatch[1];

			// Extract score
			const scoreMatch = block.match(/(\d+)\s*points?/);
			const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

			// Extract comment body (everything after the metadata line)
			const bodyStart = block.indexOf("\n");
			if (bodyStart === -1) continue;

			const body = block.substring(bodyStart).trim();

			if (body.length > 10) {
				// Filter out very short comments
				comments.push({
					id: `${postId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
					body,
					author,
					score,
					created_utc: Date.now() / 1000,
					parent_id: postId,
				});
			}
		}
	} catch (error) {
		console.error("Error parsing comments:", error);
	}

	return comments;
}

// Store scraped post in database
export const storeScrapedPost = internalMutation({
	args: {
		postData: v.object({
			id: v.string(),
			title: v.string(),
			selftext: v.string(),
			author: v.string(),
			subreddit: v.string(),
			created_utc: v.number(),
			score: v.number(),
			num_comments: v.number(),
			permalink: v.string(),
			url: v.string(),
		}),
	},
	handler: async (ctx, args) => {
		// Check if post already exists
		const existing = await ctx.db
			.query("scamStories")
			.withIndex("by_subreddit")
			.filter((q) => q.eq(q.field("postId"), args.postData.id))
			.first();

		if (!existing) {
			console.log(`Storing new post from Firecrawl: ${args.postData.id}`);

			await ctx.db.insert("scamStories", {
				redditUrl: args.postData.url,
				subreddit: args.postData.subreddit,
				postId: args.postData.id,
				authorUsername: args.postData.author,
				postDate: args.postData.created_utc * 1000,
				upvotes: args.postData.score,
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
				isProcessed: false,
				verificationStatus: "unverified",
				helpfulCount: 0,
				viewCount: 0,
				reportCount: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		} else {
			console.log(`Post ${args.postData.id} already exists, skipping`);
		}
	},
});

// Store scraped comment in database
export const storeScrapedComment = internalMutation({
	args: {
		commentData: v.object({
			id: v.string(),
			body: v.string(),
			author: v.string(),
			score: v.number(),
			created_utc: v.number(),
			parent_id: v.string(),
		}),
		postId: v.string(),
	},
	handler: async (ctx, args) => {
		// Find the story this comment belongs to
		const story = await ctx.db
			.query("scamStories")
			.withIndex("by_subreddit")
			.filter((q) => q.eq(q.field("postId"), args.postId))
			.first();

		if (story) {
			// Check if comment already exists
			const existing = await ctx.db
				.query("scamComments")
				.withIndex("by_story")
				.filter((q) => q.and(q.eq(q.field("storyId"), story._id), q.eq(q.field("redditCommentId"), args.commentData.id)))
				.first();

			if (!existing) {
				await ctx.db.insert("scamComments", {
					storyId: story._id,
					redditCommentId: args.commentData.id,
					authorUsername: args.commentData.author,
					content: args.commentData.body,
					upvotes: args.commentData.score,
					isHelpful: false,
					containsAdvice: false,
					isAnalyzedForScam: false,
					postedAt: args.commentData.created_utc * 1000,
				});
			}
		}
	},
});
