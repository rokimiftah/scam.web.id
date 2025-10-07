// convex/vapiTools.ts

/** biome-ignore-all lint/style/useConst: <> */
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <> */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { httpAction, internalQuery } from "./_generated/server";

// VAPI webhook endpoint for tool calls
export const handleToolCall = httpAction(async (ctx, request) => {
  try {
    // Parse VAPI webhook payload
    const body = await request.json();
    console.log("🔧 VAPI Tool Call Webhook - Full Body:", JSON.stringify(body, null, 2));
    console.log("🔍 Body keys:", Object.keys(body));
    console.log("🔍 Body.message:", body.message ? JSON.stringify(body.message, null, 2) : "undefined");

    const { message } = body;

    // Try multiple possible formats
    const toolCall =
      message?.toolCalls?.[0] || message?.tool_calls?.[0] || body.toolCalls?.[0] || body.tool_calls?.[0] || body.call;

    console.log("🔍 Extracted toolCall:", toolCall ? JSON.stringify(toolCall, null, 2) : "null");

    if (!toolCall) {
      console.error("❌ No tool call found in any expected location");
      console.error("❌ Tried: message.toolCalls, message.tool_calls, body.toolCalls, body.tool_calls, body.call");
      return new Response(
        JSON.stringify({
          error: "No tool call found",
          bodyKeys: Object.keys(body),
          messageKeys: message ? Object.keys(message) : null,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const functionName = toolCall.function?.name || toolCall.name;
    const args = toolCall.function?.arguments || toolCall.arguments;

    console.log("📞 Function Name:", functionName);
    console.log("📞 Raw Args:", typeof args, args);
    console.log(
      "📞 ToolCall structure:",
      JSON.stringify({
        hasFunction: !!toolCall.function,
        hasFunctionName: !!toolCall.function?.name,
        hasName: !!toolCall.name,
        hasFunctionArguments: !!toolCall.function?.arguments,
        hasArguments: !!toolCall.arguments,
      }),
    );

    // Handle queryScamsByLocation
    if (functionName === "queryScamsByLocation" || functionName === "travel-scam-location-query") {
      let country = typeof args === "string" ? JSON.parse(args).country : args.country;

      if (!country) {
        return new Response(
          JSON.stringify({
            results: [
              {
                toolCallId: toolCall.id,
                result: "Error: Country parameter is required",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Country alias mapping (what user says → what database has)
      const countryAliasMap: Record<string, string> = {
        Turkey: "Türkiye",
        Turkiye: "Türkiye",
        China: "People's Republic of China",
        Korea: "South Korea",
        USA: "United States",
        US: "United States",
        America: "United States",
        UK: "United Kingdom",
        Britain: "United Kingdom",
        England: "United Kingdom",
        UAE: "United Arab Emirates",
        Emirates: "United Arab Emirates",
        Macedonia: "North Macedonia",
        Czechia: "Czech Republic",
        Burma: "Myanmar",
        Ceylon: "Sri Lanka",
        Holland: "Netherlands",
        Siam: "Thailand",
      };

      // Map alias to actual country name
      const mappedCountry = countryAliasMap[country] || country;
      console.log(`🗺️ Country mapping: "${country}" → "${mappedCountry}"`);

      // Query scam data from database
      const scamData = await ctx.runQuery(internal.vapiTools.getScamDataForCountry, { country: mappedCountry });

      console.log("✅ Scam data retrieved:", scamData);

      // Return formatted result to VAPI
      // VAPI expects result in "results" array format
      return new Response(
        JSON.stringify({
          results: [
            {
              toolCallId: toolCall.id,
              result: scamData.message,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        result: `Function ${functionName} not implemented`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    console.error("❌ Error in handleToolCall:", error);
    return new Response(
      JSON.stringify({
        error: String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});

// Internal query to get scam data for a country
export const getScamDataForCountry = internalQuery({
  args: { country: v.string() },
  handler: async (ctx, { country }) => {
    // Get all processed scam stories
    const allStories = await ctx.db
      .query("scamStories")
      .withIndex("by_processed", (q) => q.eq("isProcessed", true))
      .collect();

    const locationStats = await ctx.db.query("locationStats").collect();

    // Find stories and stats for this country
    const countryStories = allStories.filter((s) => s.country.toLowerCase() === country.toLowerCase());

    const countryStats = locationStats.filter((s) => s.country.toLowerCase() === country.toLowerCase());

    // Calculate total reports
    const storyCount = countryStories.length;
    const statsCount = countryStats.reduce((sum, stat) => sum + (stat.totalScams || 0), 0);
    const totalReports = storyCount + statsCount;

    if (totalReports === 0) {
      return {
        message: `${country}: No specific scam data available. Stay vigilant - common scams include fake tickets, bogus accommodations, overpriced taxis, and tourist traps. Use official platforms and payment protection.`,
      };
    }

    // Collect scam types
    const scamTypes = new Set<string>();
    countryStories.forEach((s) => {
      if (s.scamMethods && s.scamMethods.length > 0) {
        s.scamMethods.forEach((method) => scamTypes.add(method));
      } else if (s.scamType) {
        scamTypes.add(s.scamType);
      }
    });

    // Collect warning signals and tips
    const warnings = new Set<string>();
    const tips = new Set<string>();

    countryStories.forEach((s) => {
      if (s.warningSignals) {
        s.warningSignals.forEach((w) => warnings.add(w));
      }
      if (s.preventionTips) {
        s.preventionTips.forEach((t) => tips.add(t));
      }
    });

    // Calculate risk level
    let riskLevel = "LOW RISK";
    if (totalReports >= 10) riskLevel = "HIGH RISK";
    else if (totalReports >= 5) riskLevel = "MEDIUM RISK";

    // Format response
    const scamTypesText = Array.from(scamTypes).slice(0, 3).join(", ") || "various types";
    const warningsText = Array.from(warnings).slice(0, 2).join(". ");
    const tipsText = Array.from(tips).slice(0, 2).join(". ");

    const message = `${country}: ${riskLevel}, ${totalReports} scam reports. Types: ${scamTypesText}.${warningsText ? ` Warnings: ${warningsText}.` : ""}${tipsText ? ` Tips: ${tipsText}` : ""}`;

    return { message };
  },
});
