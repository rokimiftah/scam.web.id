// convex/aiAnalyzer.ts

import { v } from "convex/values";

import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";

// OpenAI-compatible LLM configuration
const LLM_API_URL = process.env.LLM_API_URL as string;
const LLM_API_KEY = process.env.LLM_API_KEY as string;
const LLM_API_MODEL = process.env.LLM_API_MODEL as string;

interface ScamAnalysis {
	isScamStory: boolean;
	confidence: number;
	country: string;
	city?: string;
	specificLocation?: string;
	scamType: string;
	scamMethods: string[];
	targetDemographics: string[];
	moneyLost?: number;
	currency?: string;
	warningSignals: string[];
	preventionTips: string[];
	resolution?: string;
	summary: string;
}

export const analyzeScamStory = internalAction({
	args: {
		storyId: v.id("scamStories"),
	},
	handler: async (ctx, args) => {
		const story = await ctx.runQuery(internal.aiAnalyzer.getStoryById, {
			storyId: args.storyId,
		});

		if (!story || story.isProcessed) {
			return { success: false, message: "Story not found or already processed" };
		}

		try {
			// Get comments for additional context
			const comments = await ctx.runQuery(internal.aiAnalyzer.getStoryComments, {
				storyId: args.storyId,
			});

			const commentsText = comments.map((c: any) => `Comment by ${c.authorUsername}: ${c.content}`).join("\n");

			// Prepare content for AI analysis
			const contentToAnalyze = `
				Title: ${story.title}
				Subreddit: r/${story.subreddit}
				Author: ${story.authorUsername}
				Upvotes: ${story.upvotes}

				Story:
				${story.fullStory}

				Top Comments:
				${commentsText}
				`;

			// Call OpenAI API for analysis
			const analysis = await analyzeWithOpenAI(contentToAnalyze);

			if (analysis.isScamStory) {
				// Geocode the location using Mapbox ONLY - no normalization
				let coordinates: { lat: number; lng: number } | undefined;

				if (analysis.country && analysis.country !== "Unknown") {
					const locationParts = [] as string[];
					if (analysis.specificLocation) locationParts.push(analysis.specificLocation);
					if (analysis.city) locationParts.push(analysis.city);
					locationParts.push(analysis.country);

					const locationQuery = locationParts.join(", ");
					console.log(`Geocoding location with Mapbox: ${locationQuery}`);

					// Use enhanced geocoder that returns canonical country/city FROM MAPBOX
					const geo = await ctx.runAction(internal.geocoding.geocodeAndNormalize, {
						location: locationQuery,
						country: analysis.country,
					});

					if (geo.success && geo.coordinates) {
						coordinates = geo.coordinates;
						// Use Mapbox's canonical names
						if (geo.country) analysis.country = geo.country;
						if (geo.city) analysis.city = geo.city;
						console.log(
							`Mapbox result: ${locationQuery} -> ${coordinates?.lat}, ${coordinates?.lng} -> ${analysis.city || "Unknown city"}, ${analysis.country}`,
						);
					}
				}

				// Update the story with AI analysis AND coordinates
				await ctx.runMutation(internal.aiAnalyzer.updateStoryWithAnalysis, {
					storyId: args.storyId,
					analysis,
					coordinates,
				});

				// Simple comment analysis - don't analyze every comment with AI to avoid timeout
				// Only mark comments as helpful based on keywords
				for (const comment of comments) {
					const commentAnalysis = await analyzeComment(comment.content);
					await ctx.runMutation(internal.aiAnalyzer.updateCommentAnalysis, {
						commentId: comment._id,
						isHelpful: commentAnalysis.isHelpful,
						containsAdvice: commentAnalysis.containsAdvice,
					});
				}

				// Update location statistics
				await ctx.runAction(internal.aiAnalyzer.updateLocationStats, {
					country: analysis.country,
					city: analysis.city,
					scamType: analysis.scamType as any,
					moneyLost: analysis.moneyLost,
				});
			} else {
				// Mark as processed but not a scam story
				await ctx.runMutation(internal.aiAnalyzer.markAsNotScam, {
					storyId: args.storyId,
				});
			}

			return { success: true, isScamStory: analysis.isScamStory };
		} catch (error) {
			await ctx.runMutation(internal.aiAnalyzer.markProcessingError, {
				storyId: args.storyId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
			throw error;
		}
	},
});

async function analyzeWithOpenAI(content: string): Promise<ScamAnalysis> {
	if (!LLM_API_KEY) {
		console.error("LLM_API_KEY not set. Please set LLM_API_KEY in your environment variables.");
		throw new Error("LLM API key not configured (set LLM_API_KEY or OPENAI_API_KEY)");
	}

	if (!LLM_API_URL) {
		console.error("LLM_API_URL not set. Please set LLM_API_URL in your environment variables.");
		throw new Error("LLM API URL not configured (set LLM_API_URL)");
	}

	if (!LLM_API_MODEL) {
		console.error("LLM_API_MODEL not set. Please set LLM_API_MODEL in your environment variables.");
		throw new Error("LLM API model not configured (set LLM_API_MODEL)");
	}

	// Debug: Log configuration (without exposing the key)
	console.log("LLM Configuration:");
	console.log("- API URL:", LLM_API_URL);
	console.log("- Model:", LLM_API_MODEL);
	console.log("- Key set:", !!LLM_API_KEY);

	const systemPrompt = `
			You are an expert travel scam analyst. Analyze the following Reddit post and comments to determine if it describes a real travel scam experience.

			IMPORTANT: Extract the location from the story content, title, subreddit name, or comments. Look for any country, city, or region mentions. Common patterns include subreddit names like r/portugal, r/unitedkingdom, or mentions of cities/countries in the title or story.

			Location standards:
			- Country must be the official English name (e.g., "United States", "United Kingdom", "United Arab Emirates", "Vietnam", "Czechia"). Avoid ambiguous abbreviations like "US", "UK", "UAE".
			- City should be the commonly used English name with proper capitalization (e.g., "Ho Chi Minh City", "São Paulo" if present; otherwise plain ASCII is fine).

			Return a JSON object with the following structure:
			{
				"isScamStory": boolean (true if this is a genuine scam experience),
				"confidence": number (0-1, your confidence in this assessment),
				"country": string (country where scam occurred, or "Unknown"),
				"city": string (city if mentioned),
				"specificLocation": string (specific location like airport name, street, etc.),
				"scamType": string (one of: taxi, accommodation, tour, police, atm, restaurant, shopping, visa, airport, pickpocket, romance, timeshare, fake_ticket, currency_exchange, other),
				"scamMethods": string[] (specific methods used, e.g., ["fake meter", "overcharge", "bait and switch"]),
				"targetDemographics": string[] (e.g., ["solo traveler", "elderly", "tourist"]),
				"moneyLost": number (amount in original currency if mentioned),
				"currency": string (3-letter currency code if amount mentioned),
				"warningSignals": string[] (red flags to watch for),
				"preventionTips": string[] (how to avoid this scam),
				"resolution": string (how the situation was resolved if mentioned),
				"summary": string (2-3 sentence summary of the scam)
			}

			Focus on extracting actionable information that could help other travelers avoid similar scams.`;

	try {
		// Add timeout controller
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

		const response = await fetch(LLM_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${LLM_API_KEY}`,
			},
			body: JSON.stringify({
				model: LLM_API_MODEL,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: content },
				],
				temperature: 0.7,
				max_tokens: 1000,
			}),
			signal: controller.signal,
		}).finally(() => clearTimeout(timeoutId));

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`LLM API Error ${response.status}:`, errorText);
			throw new Error(`LLM API error: ${response.status} - ${errorText.substring(0, 200)}`);
		}

		const data = await response.json();
		const result = JSON.parse(data.choices[0].message.content);

		// Validate result has required fields
		if (!result.isScamStory === undefined || !result.country) {
			throw new Error("Invalid response format from LLM");
		}

		return result;
	} catch (error: any) {
		if (error.name === "AbortError") {
			console.error("LLM API timeout after 30 seconds");
		} else if (error.message?.includes("fetch failed")) {
			console.error("Network error - check LLM API URL:", LLM_API_URL);
			console.error("Is the API service running and accessible?");
		} else {
			console.error("LLM API error:", error.message || error);
		}

		// Return default analysis on error - mark as not processed
		return {
			isScamStory: false,
			confidence: 0,
			country: "Unknown",
			scamType: "other",
			scamMethods: [],
			targetDemographics: [],
			warningSignals: [],
			preventionTips: [],
			summary: "API error - could not analyze",
		};
	}
}

async function analyzeComment(content: string): Promise<{ isHelpful: boolean; containsAdvice: boolean }> {
	// Simple heuristic analysis for comments
	const adviceKeywords = [
		"should",
		"always",
		"never",
		"tip",
		"advice",
		"recommend",
		"avoid",
		"careful",
		"watch out",
		"be aware",
		"pro tip",
		"learned",
		"experience",
	];

	const containsAdvice = adviceKeywords.some((keyword) => content.toLowerCase().includes(keyword));

	const isHelpful = containsAdvice && content.length > 50;

	return { isHelpful, containsAdvice };
}

export const getStoryById = internalQuery({
	args: { storyId: v.id("scamStories") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.storyId);
	},
});

export const getStoryComments = internalQuery({
	args: {
		storyId: v.id("scamStories"),
		onlyUnanalyzed: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		let query = ctx.db
			.query("scamComments")
			.withIndex("by_story")
			.filter((q) => q.eq(q.field("storyId"), args.storyId));

		// Filter for unanalyzed comments if requested
		if (args.onlyUnanalyzed) {
			query = query.filter((q) => q.or(q.eq(q.field("isAnalyzedForScam"), false), q.eq(q.field("isAnalyzedForScam"), undefined)));
		}

		// Apply limit if specified, otherwise get all
		const limit = args.limit || 1000; // Default to 1000 if not specified
		return await query.take(limit);
	},
});

export const updateStoryWithAnalysis = internalMutation({
	args: {
		storyId: v.id("scamStories"),
		analysis: v.object({
			isScamStory: v.boolean(),
			confidence: v.number(),
			country: v.string(),
			city: v.optional(v.string()),
			specificLocation: v.optional(v.string()),
			scamType: v.string(),
			scamMethods: v.array(v.string()),
			targetDemographics: v.array(v.string()),
			moneyLost: v.optional(v.number()),
			currency: v.optional(v.string()),
			warningSignals: v.array(v.string()),
			preventionTips: v.array(v.string()),
			resolution: v.optional(v.string()),
			summary: v.string(),
		}),
		coordinates: v.optional(
			v.object({
				lat: v.number(),
				lng: v.number(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const scamTypeMap: Record<string, any> = {
			taxi: "taxi",
			accommodation: "accommodation",
			tour: "tour",
			police: "police",
			atm: "atm",
			restaurant: "restaurant",
			shopping: "shopping",
			visa: "visa",
			airport: "airport",
			pickpocket: "pickpocket",
			romance: "romance",
			timeshare: "timeshare",
			fake_ticket: "fake_ticket",
			currency_exchange: "currency_exchange",
			other: "other",
		};

		const updateData: any = {
			summary: args.analysis.summary,
			country: args.analysis.country,
			city: args.analysis.city,
			specificLocation: args.analysis.specificLocation,
			scamType: scamTypeMap[args.analysis.scamType] || "other",
			scamMethods: args.analysis.scamMethods,
			targetDemographics: args.analysis.targetDemographics,
			moneyLost: args.analysis.moneyLost,
			currency: args.analysis.currency,
			warningSignals: args.analysis.warningSignals,
			preventionTips: args.analysis.preventionTips,
			resolution: args.analysis.resolution,
			aiConfidenceScore: args.analysis.confidence,
			isProcessed: true,
			updatedAt: Date.now(),
		};

		// Add coordinates if provided
		if (args.coordinates) {
			updateData.coordinates = args.coordinates;
		}

		await ctx.db.patch(args.storyId, updateData);
	},
});

export const updateCommentAnalysis = internalMutation({
	args: {
		commentId: v.id("scamComments"),
		isHelpful: v.boolean(),
		containsAdvice: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.commentId, {
			isHelpful: args.isHelpful,
			containsAdvice: args.containsAdvice,
			isAnalyzedForScam: true,
			analyzedAt: Date.now(),
		});
	},
});

export const markAsNotScam = internalMutation({
	args: { storyId: v.id("scamStories") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.storyId, {
			isProcessed: true,
			aiConfidenceScore: 0,
			verificationStatus: "ai_flagged",
			updatedAt: Date.now(),
		});
	},
});

export const markProcessingError = internalMutation({
	args: {
		storyId: v.id("scamStories"),
		error: v.string(),
	},
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (story) {
			await ctx.db.patch(args.storyId, {
				processingErrors: [...(story.processingErrors || []), args.error],
				updatedAt: Date.now(),
			});
		}
	},
});

export const updateLocationStats = internalAction({
	args: {
		country: v.string(),
		city: v.optional(v.string()),
		scamType: v.union(
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
		moneyLost: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await ctx.runMutation(internal.aiAnalyzer.updateLocationStatsMutation, args);
	},
});

// Update location stats WITH coordinates for map display
export const updateLocationStatsWithCoordinates = internalAction({
	args: {
		country: v.string(),
		city: v.optional(v.string()),
		scamType: v.union(
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
		moneyLost: v.optional(v.number()),
		coordinates: v.optional(
			v.object({
				lat: v.number(),
				lng: v.number(),
			}),
		),
	},
	handler: async (ctx, args) => {
		await ctx.runMutation(internal.aiAnalyzer.updateLocationStatsMutationWithCoordinates, {
			country: args.country,
			city: args.city,
			scamType: args.scamType,
			moneyLost: args.moneyLost,
			coordinates: args.coordinates,
		});
	},
});

export const updateLocationStatsMutation = internalMutation({
	args: {
		country: v.string(),
		city: v.optional(v.string()),
		scamType: v.union(
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
		moneyLost: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const existingStats = await ctx.db
			.query("locationStats")
			.withIndex("by_country")
			.filter((q) => q.and(q.eq(q.field("country"), args.country), q.eq(q.field("city"), args.city)))
			.first();

		if (existingStats) {
			const topScamTypes = existingStats.topScamTypes;
			const typeIndex = topScamTypes.findIndex((t) => t.type === args.scamType);

			if (typeIndex >= 0) {
				topScamTypes[typeIndex].count++;
			} else {
				topScamTypes.push({ type: args.scamType, count: 1 });
			}

			// Sort by count
			topScamTypes.sort((a, b) => b.count - a.count);

			await ctx.db.patch(existingStats._id, {
				totalScams: existingStats.totalScams + 1,
				topScamTypes: topScamTypes.slice(0, 5), // Keep top 5
				averageLoss: args.moneyLost ? (existingStats.averageLoss || 0) + args.moneyLost / 2 : existingStats.averageLoss,
				lastUpdated: Date.now(),
			});
		} else {
			await ctx.db.insert("locationStats", {
				country: args.country,
				city: args.city,
				totalScams: 1,
				topScamTypes: [{ type: args.scamType, count: 1 }],
				averageLoss: args.moneyLost,
				lastUpdated: Date.now(),
			});
		}
	},
});

// Mutation that also updates coordinates for map display
export const updateLocationStatsMutationWithCoordinates = internalMutation({
	args: {
		country: v.string(),
		city: v.optional(v.string()),
		scamType: v.union(
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
		moneyLost: v.optional(v.number()),
		coordinates: v.optional(
			v.object({
				lat: v.number(),
				lng: v.number(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const existingStats = await ctx.db
			.query("locationStats")
			.withIndex("by_country")
			.filter((q) => q.and(q.eq(q.field("country"), args.country), q.eq(q.field("city"), args.city)))
			.first();

		if (existingStats) {
			const topScamTypes = existingStats.topScamTypes;
			const typeIndex = topScamTypes.findIndex((t) => t.type === args.scamType);

			if (typeIndex >= 0) {
				topScamTypes[typeIndex].count++;
			} else {
				topScamTypes.push({ type: args.scamType, count: 1 });
			}

			// Sort by count
			topScamTypes.sort((a, b) => b.count - a.count);

			const updateData: any = {
				totalScams: existingStats.totalScams + 1,
				topScamTypes: topScamTypes.slice(0, 5), // Keep top 5
				averageLoss: args.moneyLost ? (existingStats.averageLoss || 0) + args.moneyLost / 2 : existingStats.averageLoss,
				lastUpdated: Date.now(),
			};

			// Add coordinates if provided and not already set
			if (args.coordinates && !existingStats.coordinates) {
				updateData.coordinates = args.coordinates;
			}

			await ctx.db.patch(existingStats._id, updateData);
		} else {
			const insertData: any = {
				country: args.country,
				city: args.city,
				totalScams: 1,
				topScamTypes: [{ type: args.scamType, count: 1 }],
				averageLoss: args.moneyLost,
				lastUpdated: Date.now(),
			};

			// Add coordinates if provided
			if (args.coordinates) {
				insertData.coordinates = args.coordinates;
			}

			await ctx.db.insert("locationStats", insertData);
		}
	},
});

export const processUnanalyzedStories = action({
	args: {},
	handler: async (ctx): Promise<{ success: boolean; processed: number; scamStories: number }> => {
		const unprocessedStories: any[] = await ctx.runQuery(internal.aiAnalyzer.getUnprocessedStories, {});

		const results = [];
		for (const story of unprocessedStories as any[]) {
			try {
				const result: any = await ctx.runAction(internal.aiAnalyzer.analyzeScamStory, {
					storyId: story._id,
				});
				results.push(result);
				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (error) {
				console.error(`Failed to process story ${story._id}:`, error);
			}
		}

		return {
			success: true,
			processed: results.length,
			scamStories: results.filter((r) => r.isScamStory).length,
		};
	},
});

// Simple batch processing - process X stories at a time
export const processUnanalyzedStoriesBatch = action({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args): Promise<{ success: boolean; processed: number; errors: number }> => {
		const limit = args.limit || 10; // Process 10 stories by default

		// Get unprocessed stories
		const stories = await ctx.runQuery(internal.aiAnalyzer.getUnprocessedStoriesBatch, { limit });

		if (stories.length === 0) {
			console.log("No unprocessed stories found");
			return { success: true, processed: 0, errors: 0 };
		}

		console.log(`Processing ${stories.length} stories...`);

		let processed = 0;
		let errors = 0;

		for (const story of stories) {
			try {
				console.log(`Analyzing: ${story.title.substring(0, 50)}...`);

				await ctx.runAction(internal.aiAnalyzer.analyzeScamStory, {
					storyId: story._id,
				});

				processed++;

				// Rate limiting - 1 second between each story
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (error) {
				console.error(`Failed to process story ${story._id}:`, error);
				errors++;
			}
		}

		console.log(`Batch complete: ${processed} processed, ${errors} errors`);
		return { success: true, processed, errors };
	},
});

export const getUnprocessedStories = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), false))
			.take(10); // Process in batches
	},
});

export const getAllUnprocessedStories = internalQuery({
	args: {},
	handler: async (ctx) => {
		// Get ALL unprocessed stories without any limit
		return await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), false))
			.collect(); // Use collect() instead of take() to get all
	},
});

export const getUnprocessedStoriesBatch = internalQuery({
	args: { limit: v.number() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), false))
			.take(args.limit);
	},
});

export const getUnprocessedStoriesCount = internalQuery({
	args: {},
	handler: async (ctx) => {
		const stories = await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), false))
			.collect();
		return stories.length;
	},
});

// Analyze comments that might contain scam stories
export const analyzeCommentsForScams = action({
	args: {
		storyId: v.optional(v.id("scamStories")),
		limit: v.optional(v.number()),
		continueFromLast: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ success: boolean; analyzed: number; scamsFound: number; errors: number; totalUnanalyzed: number }> => {
		const commentsToAnalyze = args.limit || 10; // Total comments to analyze in this run
		let processed = 0; // Comments we've checked (marked as analyzed in DB)
		let analyzedWithAI = 0; // Comments actually sent to AI
		let scamsFound = 0;
		let errors = 0;
		let totalUnanalyzed = 0;

		// Get stories to analyze comments from
		let stories: any[];
		if (args.storyId) {
			// Analyze comments from specific story
			const story = await ctx.runQuery(internal.aiAnalyzer.getStoryById, { storyId: args.storyId });
			stories = story ? [story] : [];
		} else {
			// Get a large batch of stories - we'll check each for unanalyzed comments
			// Get more stories than we need since many won't have unanalyzed comments
			const storiesLimit = Math.min(200, commentsToAnalyze * 20); // Get MANY more stories
			console.log(`Fetching up to ${storiesLimit} stories to find unanalyzed comments...`);
			stories = await ctx.runQuery(internal.aiAnalyzer.getProcessedStoriesForCommentAnalysis, { limit: storiesLimit });
		}

		console.log(`Checking comments from ${stories.length} stories for unanalyzed content...`);

		// Quick count of unanalyzed comments (just for reporting)
		const stats = await ctx.runAction(internal.aiAnalyzer.getCommentAnalysisStatsInternal, {});
		totalUnanalyzed = stats.unanalyzedComments;

		console.log(`Total unanalyzed comments in database: ${totalUnanalyzed}`);
		console.log(`Will analyze up to ${commentsToAnalyze} comments in this run`);

		// Process stories and their comments
		let storiesChecked = 0;
		let storiesWithComments = 0;

		for (const story of stories) {
			storiesChecked++;

			if (processed >= commentsToAnalyze) {
				console.log(`Reached limit of ${commentsToAnalyze} comments after checking ${storiesChecked} stories`);
				break; // Stop if we've processed enough comments
			}

			// Get ONLY unanalyzed comments for this story
			const remainingToAnalyze = commentsToAnalyze - processed;
			const comments = await ctx.runQuery(internal.aiAnalyzer.getStoryComments, {
				storyId: story._id,
				onlyUnanalyzed: true,
				limit: remainingToAnalyze, // Only get what we need
			});

			if (comments.length === 0) {
				continue; // Skip stories with no unanalyzed comments
			}

			storiesWithComments++;
			console.log(
				`Story ${storiesChecked}: Found ${comments.length} unanalyzed comments in ${story.city || story.country} (need ${remainingToAnalyze} more)`,
			);

			for (const comment of comments) {
				// Track that we're processing this comment
				processed++;

				// More lenient heuristic - analyze more comments to find hidden scams
				const contentLower = comment.content.toLowerCase();
				const mightBeScamStory =
					comment.content.length > 200 && // Lowered minimum length
					// Direct scam mentions
					(contentLower.includes("scam") ||
						contentLower.includes("scammed") ||
						contentLower.includes("ripped off") ||
						// Personal experience indicators
						contentLower.includes("happened to me") ||
						contentLower.includes("i was") ||
						contentLower.includes("i got") ||
						contentLower.includes("my experience") ||
						contentLower.includes("we were") ||
						contentLower.includes("they tried") ||
						// Money-related terms (often indicate scams)
						contentLower.includes("charged") ||
						contentLower.includes("paid") ||
						contentLower.includes("cost") ||
						contentLower.includes("price") ||
						contentLower.includes("fee") ||
						// Common scam locations/situations
						contentLower.includes("taxi") ||
						contentLower.includes("airport") ||
						contentLower.includes("hotel") ||
						contentLower.includes("tour") ||
						contentLower.includes("restaurant") ||
						contentLower.includes("police") ||
						contentLower.includes("atm"));

				if (mightBeScamStory) {
					try {
						analyzedWithAI++;
						console.log(`Analyzing comment from ${comment.authorUsername} with AI...`);

						// Use the MAIN AI analyzer with comment content
						const analysis = await analyzeWithOpenAI(`
							Comment by ${comment.authorUsername} on a scam story from ${story.country}:

							${comment.content}

							Context: This is a comment on a Reddit post about travel scams in ${story.country}.
							If the comment describes a personal scam experience, extract the details.
							If no specific location is mentioned, assume it happened in ${story.country}.
						`);

						if (analysis.isScamStory && analysis.confidence > 0.6) {
							// Just update location statistics, DON'T CREATE NEW STORY!
							const country = analysis.country || story.country;
							const city = analysis.city || story.city;

							// Geocode location for the comment scam
							let coordinates = story.coordinates; // Default to parent story coordinates
							if (analysis.country && analysis.country !== "Unknown") {
								const locationParts = [] as string[];
								if (analysis.specificLocation) locationParts.push(analysis.specificLocation);
								if (analysis.city) locationParts.push(analysis.city);
								locationParts.push(analysis.country);

								const locationQuery = locationParts.join(", ");
								console.log(`Geocoding comment scam location: ${locationQuery}`);

								const geo = await ctx.runAction(internal.geocoding.geocodeAndNormalize, {
									location: locationQuery,
									country: analysis.country,
								});

								if (geo.success && geo.coordinates) {
									coordinates = geo.coordinates;
								}
							}

							// Update location stats for this scam WITH coordinates
							await ctx.runAction(internal.aiAnalyzer.updateLocationStatsWithCoordinates, {
								country: country,
								city: city,
								scamType: analysis.scamType as any,
								moneyLost: analysis.moneyLost,
								coordinates: coordinates,
							});

							// Mark comment as containing scam story
							await ctx.runMutation(internal.aiAnalyzer.updateCommentAnalysis, {
								commentId: comment._id,
								isHelpful: true,
								containsAdvice: true,
							});

							scamsFound++;
							console.log(`Found scam story in comment by ${comment.authorUsername} - added to ${city || country} statistics`);
						} else {
							// Mark comment as analyzed even if not a scam story
							await ctx.runMutation(internal.aiAnalyzer.updateCommentAnalysis, {
								commentId: comment._id,
								isHelpful: false,
								containsAdvice: false,
							});
							console.log(`Comment by ${comment.authorUsername} analyzed - not a scam story`);
						}

						// Rate limiting
						await new Promise((resolve) => setTimeout(resolve, 1500));
					} catch (error) {
						console.error(`Failed to analyze comment:`, error);
						errors++;
					}
				} else {
					// Mark short/non-scam comments as analyzed too, to avoid re-checking
					try {
						await ctx.runMutation(internal.aiAnalyzer.updateCommentAnalysis, {
							commentId: comment._id,
							isHelpful: false,
							containsAdvice: false,
						});
						// Log why we skipped this comment
						if (comment.content.length <= 200) {
							console.log(`Skipped comment by ${comment.authorUsername}: Too short (${comment.content.length} chars)`);
						} else {
							console.log(`Skipped comment by ${comment.authorUsername}: Doesn't match scam heuristic`);
						}
					} catch (error) {
						console.error(`Failed to mark comment as analyzed:`, error);
					}
				}
			}
		}

		// Get final stats
		const finalStats = await ctx.runAction(internal.aiAnalyzer.getCommentAnalysisStatsInternal, {});
		const remaining = finalStats.unanalyzedComments;

		console.log(
			`Comment analysis complete: ${processed} processed (${analyzedWithAI} with AI), ${scamsFound} scam stories found, ${errors} errors, ${remaining} remaining`,
		);
		console.log(`Checked ${storiesChecked} stories, found comments in ${storiesWithComments} of them`);

		return {
			success: true,
			analyzed: processed, // Return processed count as "analyzed" for backward compatibility
			scamsFound,
			errors,
			totalUnanalyzed: remaining,
		};
	},
});

export const getProcessedStoriesForCommentAnalysis = internalQuery({
	args: { limit: v.number() },
	handler: async (ctx, args) => {
		// Get ALL processed stories - use collect() to get all then slice
		const allStories = await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), true))
			.collect();

		// Return requested limit
		const stories = allStories.slice(0, args.limit);

		console.log(`getProcessedStoriesForCommentAnalysis: Returning ${stories.length} of ${allStories.length} total stories`);
		return stories;
	},
});

// Get stories that have unanalyzed comments
export const getStoriesWithUnanalyzedComments = internalQuery({
	args: { limit: v.number() },
	handler: async (ctx, args) => {
		// Get a reasonable batch of processed stories to check
		// We'll check more stories than requested to find ones with unanalyzed comments
		const storiesToCheck = Math.min(args.limit * 3, 100); // Check up to 3x requested or 100 max

		const stories = await ctx.db
			.query("scamStories")
			.filter((q) => q.and(q.eq(q.field("isProcessed"), true), q.neq(q.field("country"), "Unknown")))
			.order("desc") // Most recent first
			.take(storiesToCheck);

		// Filter to only stories with unanalyzed comments
		const storiesWithUnanalyzed = [];
		for (const story of stories) {
			const unanalyzedComment = await ctx.db
				.query("scamComments")
				.withIndex("by_story")
				.filter((q) =>
					q.and(
						q.eq(q.field("storyId"), story._id),
						q.or(q.eq(q.field("isAnalyzedForScam"), false), q.eq(q.field("isAnalyzedForScam"), undefined)),
					),
				)
				.first(); // Just check if at least one exists

			if (unanalyzedComment) {
				storiesWithUnanalyzed.push(story);
				if (storiesWithUnanalyzed.length >= args.limit) {
					break;
				}
			}
		}

		return storiesWithUnanalyzed;
	},
});

export const getAllProcessedStories = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("scamStories")
			.filter((q) => q.eq(q.field("isProcessed"), true))
			// Removed filter for Unknown country
			.collect(); // Get all, not limited
	},
});

// Reprocess stories with Unknown location
export const reprocessUnknownLocations = action({
	args: {},
	handler: async (ctx): Promise<{ success: boolean; processed: number; fixed: number }> => {
		// Get stories with Unknown location
		const unknownStories = await ctx.runQuery(internal.aiAnalyzer.getStoriesWithUnknownLocation);

		let processed = 0;
		let fixed = 0;

		for (const story of unknownStories) {
			try {
				// Reset to unprocessed so it gets reanalyzed
				await ctx.runMutation(internal.aiAnalyzer.resetStoryForReprocessing, {
					storyId: story._id,
				});

				// Reanalyze with improved location detection
				const result = await ctx.runAction(internal.aiAnalyzer.analyzeScamStory, {
					storyId: story._id,
				});

				processed++;
				if (result.isScamStory) {
					// Check if location is no longer Unknown
					const updated = await ctx.runQuery(internal.aiAnalyzer.getStoryById, {
						storyId: story._id,
					});
					if (updated && updated.country !== "Unknown") {
						fixed++;
					}
				}

				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (error) {
				console.error(`Failed to reprocess story ${story._id}:`, error);
			}
		}

		return {
			success: true,
			processed,
			fixed,
		};
	},
});

export const getStoriesWithUnknownLocation = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("scamStories")
			.filter((q) => q.and(q.eq(q.field("isProcessed"), true), q.eq(q.field("country"), "Unknown")))
			.take(10);
	},
});

export const resetStoryForReprocessing = internalMutation({
	args: { storyId: v.id("scamStories") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.storyId, {
			isProcessed: false,
			updatedAt: Date.now(),
		});
	},
});

// Get comment analysis statistics (internal version for use by other actions)
export const getCommentAnalysisStatsInternal = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		totalComments: number;
		analyzedComments: number;
		unanalyzedComments: number;
		scamComments: number;
		storiesWithComments: number;
	}> => {
		// Get all comments
		const allComments = await ctx.runQuery(internal.aiAnalyzer.getAllComments, {});

		const totalComments = allComments.length;
		const analyzedComments = allComments.filter((c: any) => c.isAnalyzedForScam === true).length;
		const unanalyzedComments = totalComments - analyzedComments;
		const scamComments = allComments.filter((c: any) => c.isHelpful === true && c.containsAdvice === true).length;

		// Count unique stories
		const uniqueStoryIds = new Set(allComments.map((c: any) => c.storyId));
		const storiesWithComments = uniqueStoryIds.size;

		console.log(`Comment Analysis Stats:`);
		console.log(`- Total comments: ${totalComments}`);
		console.log(`- Analyzed: ${analyzedComments}`);
		console.log(`- Unanalyzed: ${unanalyzedComments}`);
		console.log(`- Contains scam stories: ${scamComments}`);
		console.log(`- Stories with comments: ${storiesWithComments}`);

		return {
			totalComments,
			analyzedComments,
			unanalyzedComments,
			scamComments,
			storiesWithComments,
		};
	},
});

// Get comment analysis statistics (public version)
export const getCommentAnalysisStats = action({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		totalComments: number;
		analyzedComments: number;
		unanalyzedComments: number;
		scamComments: number;
		storiesWithComments: number;
	}> => {
		return await ctx.runAction(internal.aiAnalyzer.getCommentAnalysisStatsInternal, {});
	},
});

export const getAllComments = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("scamComments").collect();
	},
});

async function sendEmail(to: string, subject: string, html: string) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
        console.error("RESEND_API_KEY is not set. Cannot send email.");
        return;
    }

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: "Travel Scam Alert <noreply@scam.web.id>",
                to: [to],
                subject,
                html,
            }),
        });

        const text = await res.text();
        if (!res.ok) {
            let message = text;
            try {
                const data = JSON.parse(text);
                message = data?.error?.message || data?.message || text;
            } catch {}
            console.error("Resend API error", res.status, text);
            throw new Error(`Could not send email: ${message}`);
        }
    } catch (err: any) {
        console.error("Failed to send email via Resend fetch:", err);
        throw new Error(`Could not send email: ${err?.message || "Unknown error"}`);
    }
}

export const sendPreventionTips = action({
	args: { country: v.string() },
	handler: async (ctx, { country }) => {
		const RESEND_API_KEY = process.env.RESEND_API_KEY;
		if (!RESEND_API_KEY) {
			throw new Error("RESEND_API_KEY is not set in environment variables.");
		}
    const userId = await getAuthUserId(ctx);
    if (!userId) {
        console.warn("Not authenticated. Cannot send email.");
        return;
    }
    const user = await ctx.runQuery(api.users.getUserById, { userId });
    if (!user || !user.email) {
        console.warn(`User ${userId} not found or missing email. Cannot send email.`);
        return;
    }

		const stories = await ctx.runQuery(internal.scams.getScamStoriesForCountry, { country });

		const preventionTips = [...new Set(stories.flatMap((story) => story.preventionTips || []))];

		if (preventionTips.length === 0) {
			console.log(`No prevention tips found for ${country}. Sending generic email.`);
			const subject = `Travel Scam Prevention Tips for ${country}`;
			const htmlBody = `
                <h1>Travel Scam Prevention Tips for ${country}</h1>
                <p>Hi ${user.name || "there"},</p>
                <p>We currently don't have specific prevention tips for ${country}, but here are some general tips to help you stay safe during your travels:</p>
                <ul>
                    <li>Be wary of unsolicited offers or "too good to be true" deals.</li>
                    <li>Always confirm prices before accepting a service.</li>
                    <li>Keep your valuables secure and out of sight.</li>
                    <li>Use official transportation and booking services whenever possible.</li>
                    <li>Inform your bank of your travel plans to avoid card issues.</li>
                </ul>
                <p>Stay safe!</p>
                <p>The Travel Scam Alert Team</p>
            `;
			await sendEmail(user.email, subject, htmlBody);
			return;
		}

		const subject = `Travel Scam Prevention Tips for ${country}`;
		const htmlBody = `
            <h1>Travel Scam Prevention Tips for ${country}</h1>
            <p>Hi ${user.name || "there"},</p>
            <p>Here are some prevention tips to help you stay safe during your travels in ${country}:</p>
            <ul>
                ${preventionTips.map((tip) => `<li>${tip}</li>`).join("")}
            </ul>
            <p>Stay safe!</p>
            <p>The Travel Scam Alert Team</p>
        `;

		await sendEmail(user.email, subject, htmlBody);
		console.log(`Prevention tips email sent to ${user.email} for ${country}.`);
	},
});
