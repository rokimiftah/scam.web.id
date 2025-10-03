// convex/scrape/singleUrl.ts

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY as string;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1";

// Internal scrape function
export const scrapeRedditPostInternal = internalAction({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY not configured. Please set it in your environment variables.");
    }

    // Validate URL is a Reddit post
    if (!args.url.includes("reddit.com") || !args.url.includes("/comments/")) {
      throw new Error("Invalid Reddit URL. Please provide a Reddit post URL.");
    }

    try {
      console.log(`Scraping Reddit post: ${args.url}`);

      // Scrape the main post
      const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          url: args.url,
          formats: ["markdown", "html", "links"],
          onlyMainContent: false,
          includeTags: [
            "div[data-testid='post-container']",
            "div[data-test-id='post-content']",
            "div[data-testid='comment']",
            "div.Comment",
            "shreddit-post",
            "shreddit-comment",
          ],
          waitFor: 3000, // Wait for dynamic content to load
          timeout: 30000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Firecrawl API error:", errorText);
        throw new Error(`Firecrawl API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.data) {
        throw new Error("Failed to scrape Reddit post");
      }

      // Parse the scraped content
      const content = data.data.markdown || data.data.content || "";
      const html = data.data.html || "";

      // Extract post data
      const postData = extractPostData(content, html, args.url);

      if (!postData) {
        throw new Error("Could not extract post data from scraped content");
      }

      // Store the post
      const storyId = await ctx.runMutation(internal.scrape.firecrawl.storeScrapedPost, {
        postData,
      });

      // Extract and store comments
      const comments = extractComments(content, html, postData.id);
      console.log(`Found ${comments.length} comments`);

      for (const comment of comments) {
        await ctx.runMutation(internal.scrape.firecrawl.storeScrapedComment, {
          commentData: comment,
          postId: postData.id,
        });
      }

      // Trigger AI analysis for the post
      if (storyId) {
        console.log("Triggering AI analysis for the scraped post...");
        await ctx.runAction(internal.aiAnalyzer.analyzeScamStory, {
          storyId,
        });
      }

      return {
        success: true,
        postId: postData.id,
        title: postData.title,
        commentsScraped: comments.length,
        storyId,
        message: `Successfully scraped post "${postData.title}" with ${comments.length} comments`,
      };
    } catch (error) {
      console.error("Error scraping Reddit post:", error);
      throw error;
    }
  },
});

// Extract post data from scraped content
function extractPostData(markdown: string, html: string, url: string): any {
  try {
    // Extract post ID from URL
    const postIdMatch = url.match(/comments\/([a-z0-9]+)/i);
    if (!postIdMatch) return null;
    const postId = postIdMatch[1];

    // Extract subreddit from URL
    const subredditMatch = url.match(/r\/([a-zA-Z0-9_]+)/);
    const subreddit = subredditMatch ? subredditMatch[1] : "unknown";

    // Try to extract from markdown first
    let title = "";
    let selftext = "";
    let author = "";
    let score = 0;

    // Extract title (usually the first # heading or the first line)
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else {
      // Try to find title in first few lines
      const lines = markdown.split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        title = lines[0].replace(/^[#\s]+/, "").trim();
      }
    }

    // Extract author (look for Posted by u/username or similar patterns)
    const authorMatch = markdown.match(/(?:Posted by |by |u\/)([a-zA-Z0-9_-]+)/i);
    if (authorMatch) {
      author = authorMatch[1];
    } else {
      // Try HTML
      const htmlAuthorMatch = html.match(/u\/([a-zA-Z0-9_-]+)/);
      if (htmlAuthorMatch) {
        author = htmlAuthorMatch[1];
      }
    }

    // Extract post content
    // Look for the main text after the title and metadata
    const contentLines = markdown.split("\n");
    let startIndex = -1;
    let endIndex = contentLines.length;

    // Find where the actual post content starts
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i].trim();
      // Skip title, metadata, and empty lines
      if (
        line &&
        !line.startsWith("#") &&
        !line.includes("Posted by") &&
        !line.includes("points") &&
        !line.includes("comments") &&
        line.length > 20
      ) {
        startIndex = i;
        break;
      }
    }

    // Find where comments section starts
    for (let i = startIndex + 1; i < contentLines.length; i++) {
      const line = contentLines[i].trim();
      if (line.includes("Comment") || line.includes("sorted by") || line.includes("View all comments")) {
        endIndex = i;
        break;
      }
    }

    if (startIndex >= 0) {
      selftext = contentLines.slice(startIndex, endIndex).join("\n").trim();
    }

    // Clean up the selftext
    selftext = selftext
      .replace(/\[deleted\]/g, "")
      .replace(/\[removed\]/g, "")
      .replace(/^[-*]\s+/gm, "") // Remove bullet points
      .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
      .trim();

    // Extract score
    const scoreMatch = markdown.match(/(\d+)\s*(?:points?|upvotes?)/i);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1], 10);
    }

    // Extract comment count
    const commentMatch = markdown.match(/(\d+)\s*comments?/i);
    const num_comments = commentMatch ? parseInt(commentMatch[1], 10) : 0;

    return {
      id: postId,
      title: title || "Untitled Post",
      selftext: selftext || "",
      author: author || "deleted",
      subreddit,
      created_utc: Date.now() / 1000,
      score,
      num_comments,
      permalink: `/r/${subreddit}/comments/${postId}/`,
      url,
    };
  } catch (error) {
    console.error("Error extracting post data:", error);
    return null;
  }
}

// Extract comments from scraped content
function extractComments(markdown: string, html: string, postId: string): any[] {
  const comments: any[] = [];

  try {
    // Split by comment indicators
    const sections = markdown.split(/(?:^|\n)(?:level \d+|↳|│|\*\s*u\/)/m);

    for (const section of sections) {
      // Look for username pattern
      const authorMatch = section.match(/u\/([a-zA-Z0-9_-]+)/);
      if (!authorMatch) continue;

      const author = authorMatch[1];

      // Extract score
      const scoreMatch = section.match(/(\d+)\s*(?:points?|upvotes?)/);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

      // Extract comment body
      // Remove metadata and get the actual comment text
      const body = section
        .replace(/u\/[a-zA-Z0-9_-]+/, "") // Remove username
        .replace(/\d+\s*(?:points?|upvotes?)/, "") // Remove score
        .replace(/\d+\s*(?:hours?|days?|months?|years?)\s*ago/, "") // Remove time
        .replace(/^[·•\s-]+/gm, "") // Remove bullet points and separators
        .trim();

      // Skip if body is too short or is just metadata
      if (body.length < 10) continue;
      if (body.includes("View all comments") || body.includes("sorted by")) continue;

      comments.push({
        id: `${postId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        body,
        author,
        score,
        created_utc: Date.now() / 1000,
        parent_id: postId,
      });
    }

    // If no comments found with the above method, try a different approach
    if (comments.length === 0) {
      // Look for comment-like structures in HTML
      const commentMatches = html.matchAll(/<div[^>]*(?:comment|Comment)[^>]*>[\s\S]*?<\/div>/gi);

      for (const match of commentMatches) {
        const commentHtml = match[0];

        // Extract text content (simple HTML stripping)
        const textContent = commentHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Extract author
        const authorMatch = textContent.match(/u\/([a-zA-Z0-9_-]+)/);
        if (!authorMatch) continue;

        const author = authorMatch[1];

        // Extract the actual comment text (skip metadata)
        const body = textContent
          .replace(/u\/[a-zA-Z0-9_-]+/, "")
          .replace(/\d+\s*(?:points?|upvotes?)/, "")
          .replace(/\d+\s*(?:hours?|days?|months?|years?)\s*ago/, "")
          .trim();

        if (body.length > 10) {
          comments.push({
            id: `${postId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            body,
            author,
            score: 0,
            created_utc: Date.now() / 1000,
            parent_id: postId,
          });
        }
      }
    }

    // Remove duplicate comments
    const uniqueComments = comments.filter(
      (comment, index, self) => index === self.findIndex((c) => c.body === comment.body && c.author === comment.author),
    );

    return uniqueComments;
  } catch (error) {
    console.error("Error extracting comments:", error);
    return [];
  }
}

// Public action wrapper for scrapeRedditPost
export const scrapeRedditPost = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runAction(internal.scrape.singleUrl.scrapeRedditPostInternal, args);
  },
});

// Batch scrape multiple Reddit URLs
export const batchScrapeUrls = action({
  args: {
    urls: v.array(v.string()),
    analyzeWithAI: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const results = [];
    let successCount = 0;
    let totalComments = 0;

    for (const url of args.urls) {
      try {
        console.log(`Scraping: ${url}`);

        const result: any = await ctx.runAction(internal.scrape.singleUrl.scrapeRedditPostInternal, {
          url,
        });

        if (result.success) {
          successCount++;
          totalComments += result.commentsScraped;
        }

        results.push(result);

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay between scrapes
      } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        results.push({
          success: false,
          url,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      totalUrls: args.urls.length,
      successfulScrapes: successCount,
      totalComments,
      results,
    };
  },
});
