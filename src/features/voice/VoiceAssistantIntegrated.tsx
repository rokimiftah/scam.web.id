// src/features/voice/VoiceAssistantIntegrated.tsx

/** biome-ignore-all lint/style/useTemplate: <> */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <> */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import Vapi from "@vapi-ai/web";
import { useAction, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

interface VoiceAssistantProps {
  isAuthenticated: boolean;
  onLocationQuery?: (country: string) => void;
  onVoiceSessionEnd?: () => void;
  onSessionActiveChange?: (active: boolean) => void;
  pointsData?: any[]; // Points data from App component for accurate country data
}

export interface VoiceAssistantHandle {
  toggleVoice: () => void;
  stopVoice: () => void;
  isListening: boolean;
}

const PUBLIC_VAPI_PUBLIC_KEY = process.env.PUBLIC_VAPI_PUBLIC_KEY;
const PUBLIC_VAPI_ASSISTANT_ID = process.env.PUBLIC_VAPI_ASSISTANT_ID;

const parseFunctionArgs = (rawArgs: unknown): Record<string, any> => {
  if (!rawArgs) return {};
  if (typeof rawArgs === "string") {
    try {
      return JSON.parse(rawArgs);
    } catch (error) {
      console.warn("Failed to parse Vapi function arguments:", rawArgs, error);
      return {};
    }
  }
  if (typeof rawArgs === "object") {
    return rawArgs as Record<string, any>;
  }
  return {};
};

// Remove consecutive duplicate words/phrases from transcript
const removeDuplicateWords = (text: string): string => {
  if (!text || !text.trim()) return text;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const result: string[] = [];
  let i = 0;

  while (i < words.length) {
    result.push(words[i]);

    // Look ahead to find repeating patterns
    let maxSkip = 0;
    for (let patternLen = 1; patternLen <= Math.min(10, words.length - i); patternLen++) {
      const pattern = words.slice(i, i + patternLen);
      const next = words.slice(i + patternLen, i + patternLen + patternLen);

      if (pattern.length === next.length && pattern.every((w, idx) => w.toLowerCase() === next[idx].toLowerCase())) {
        maxSkip = Math.max(maxSkip, patternLen);
      }
    }

    i += maxSkip > 0 ? maxSkip + 1 : 1;
  }

  return result.join(" ");
};

// Find overlap between end of text1 and start of text2
const findOverlap = (text1: string, text2: string): number => {
  if (!text1 || !text2) return 0;

  const words1 = text1.trim().split(/\s+/);
  const words2 = text2.trim().split(/\s+/);

  // Try to find the longest overlap
  let maxOverlap = 0;
  const maxCheck = Math.min(words1.length, words2.length, 15);

  for (let overlap = maxCheck; overlap > 0; overlap--) {
    const ending = words1.slice(-overlap);
    const beginning = words2.slice(0, overlap);

    if (ending.every((w, idx) => w.toLowerCase() === beginning[idx].toLowerCase())) {
      maxOverlap = overlap;
      break;
    }
  }

  return maxOverlap;
};

// Merge two texts by removing overlap
const mergeTexts = (text1: string, text2: string): string => {
  const overlap = findOverlap(text1, text2);

  if (overlap > 0) {
    const words2 = text2.trim().split(/\s+/);
    const uniquePart = words2.slice(overlap).join(" ");
    return text1.trim() + (uniquePart ? ` ${uniquePart}` : "");
  }

  return `${text1.trim()} ${text2.trim()}`;
};

const VoiceAssistantIntegrated = forwardRef<VoiceAssistantHandle, VoiceAssistantProps>(
  ({ isAuthenticated, onLocationQuery, onVoiceSessionEnd, onSessionActiveChange, pointsData }, ref) => {
    const [isListening, setIsListening] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [conversationHistory, setConversationHistory] = useState<
      Array<{ role: "user" | "assistant"; message: string; timestamp: number }>
    >([]);
    const [isThinking, setIsThinking] = useState(false);
    const vapiRef = useRef<Vapi | null>(null);
    const processedToolCallsRef = useRef<Set<string>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastTranscriptRef = useRef<{ role: string; text: string } | null>(null);
    const cleaningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch data for the assistant to use - ONLY if authenticated
    const scamStories = useQuery(api.scams.getScamStories, isAuthenticated ? { limit: 100 } : "skip");
    const locationStats = useQuery(api.scams.getLocationStats, isAuthenticated ? {} : "skip");
    const trendingScams = useQuery(api.scams.getTrendingScams, isAuthenticated ? {} : "skip");
    const currentUser = useQuery(api.users.getCurrentUser);
    const sendPreventionTipsEmailAction = useAction(api.aiAnalyzer.sendPreventionTips);
    const cleanTranscriptAction = useAction(api.aiAnalyzer.cleanTranscript);

    const onLocationQueryRef = useRef(onLocationQuery);
    const trendingScamsRef = useRef(trendingScams);
    const getHighRiskLocationsRef = useRef<() => string[]>(() => []);
    const getLocationScamDataRef = useRef<() => Record<string, any>>(() => ({}));
    const pointsDataRef = useRef(pointsData);
    const onVoiceSessionEndRef = useRef(onVoiceSessionEnd);
    const onSessionActiveChangeRef = useRef(onSessionActiveChange);
    const sendPreventionTipsEmailActionRef = useRef(sendPreventionTipsEmailAction);

    useEffect(() => {
      pointsDataRef.current = pointsData;
    }, [pointsData]);

    useEffect(() => {
      onLocationQueryRef.current = onLocationQuery;
    }, [onLocationQuery]);

    useEffect(() => {
      trendingScamsRef.current = trendingScams;
    }, [trendingScams]);

    useEffect(() => {
      onVoiceSessionEndRef.current = onVoiceSessionEnd;
    }, [onVoiceSessionEnd]);

    useEffect(() => {
      onSessionActiveChangeRef.current = onSessionActiveChange;
    }, [onSessionActiveChange]);

    useEffect(() => {
      sendPreventionTipsEmailActionRef.current = sendPreventionTipsEmailAction;
    }, [sendPreventionTipsEmailAction]);

    const travelerName = useMemo(() => {
      if (!currentUser) return null;
      const record = currentUser as { name?: string | null; email?: string | null } | null;
      const rawName = record?.name?.trim();
      if (rawName) {
        return rawName.split(" ")[0];
      }
      const rawEmail = record?.email?.trim();
      if (rawEmail?.includes("@")) {
        return rawEmail.split("@")[0];
      }
      return null;
    }, [currentUser]);

    const travelerFallbackName = travelerName ?? "Traveler";
    const travelerGreetingName = travelerName ?? "there";

    // Auto-scroll to latest message
    useEffect(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, [conversationHistory, isThinking]);

    // Process scam data for the assistant
    const getLocationScamData = useCallback(() => {
      if (!scamStories || !locationStats) return {};

      const dataByCountry: Record<string, any> = {};

      // Process stories
      scamStories.forEach((story: any) => {
        if (story.country && story.country !== "Unknown") {
          if (!dataByCountry[story.country]) {
            dataByCountry[story.country] = {
              totalReports: 0,
              scamTypes: new Set(),
              cities: new Set(),
              riskLevel: "low",
              warningSignals: new Set(),
              preventionTips: new Set(),
              totalMoneyLost: 0,
            };
          }
          dataByCountry[story.country].totalReports++;
          if (story.scamType) dataByCountry[story.country].scamTypes.add(story.scamType);
          if (story.city) dataByCountry[story.country].cities.add(story.city);
          if (story.moneyLost) dataByCountry[story.country].totalMoneyLost += story.moneyLost;
          if (story.warningSignals) {
            story.warningSignals.forEach((signal: string) => {
              dataByCountry[story.country].warningSignals.add(signal);
            });
          }
          if (story.preventionTips) {
            story.preventionTips.forEach((tip: string) => {
              dataByCountry[story.country].preventionTips.add(tip);
            });
          }
        }
      });

      // Add location stats data
      if (locationStats) {
        locationStats.forEach((stat: any) => {
          if (stat.country && stat.country !== "Unknown") {
            if (!dataByCountry[stat.country]) {
              dataByCountry[stat.country] = {
                totalReports: 0,
                scamTypes: new Set(),
                cities: new Set(),
                riskLevel: "low",
                warningSignals: new Set(),
                preventionTips: new Set(),
                totalMoneyLost: 0,
              };
            }
            dataByCountry[stat.country].totalReports += stat.totalScams || 0;
            if (stat.city) dataByCountry[stat.country].cities.add(stat.city);
          }
        });
      }

      // Calculate risk levels and convert sets to arrays
      Object.keys(dataByCountry).forEach((country) => {
        const reports = dataByCountry[country].totalReports;
        if (reports >= 10) dataByCountry[country].riskLevel = "high";
        else if (reports >= 5) dataByCountry[country].riskLevel = "medium";
        else dataByCountry[country].riskLevel = "low";

        // Convert sets to arrays
        dataByCountry[country].scamTypes = Array.from(dataByCountry[country].scamTypes);
        dataByCountry[country].cities = Array.from(dataByCountry[country].cities);
        dataByCountry[country].warningSignals = Array.from(dataByCountry[country].warningSignals).slice(0, 3);
        dataByCountry[country].preventionTips = Array.from(dataByCountry[country].preventionTips).slice(0, 3);
      });

      return dataByCountry;
    }, [scamStories, locationStats]);

    const getHighRiskLocations = useCallback(() => {
      const locationData = getLocationScamData();
      return Object.entries(locationData)
        .filter(([_, data]: [string, any]) => data.riskLevel === "high")
        .map(([country, _]) => country);
    }, [getLocationScamData]);

    useEffect(() => {
      getHighRiskLocationsRef.current = getHighRiskLocations;
    }, [getHighRiskLocations]);

    useEffect(() => {
      getLocationScamDataRef.current = getLocationScamData;
    }, [getLocationScamData]);

    // Handle custom function calls from the assistant
    const sendToolResultToVapi = useCallback(
      (
        toolCallId: string,
        functionName: string,
        payload: {
          success: boolean;
          result?: string;
          error?: string;
          country?: string;
          metadata?: Record<string, any>;
        },
      ) => {
        if (!vapiRef.current || !toolCallId) {
          console.warn("🚨 Cannot send tool result: missing vapi instance or toolCallId", {
            hasVapi: !!vapiRef.current,
            toolCallId,
          });
          return;
        }

        const content = payload.result || payload.error || "Tool execution completed";
        console.log("✉️ Sending to VAPI:", {
          toolCallId,
          functionName,
          content: content.substring(0, 100) + "...",
        });

        try {
          vapiRef.current.send({
            type: "add-message",
            message: {
              role: "tool",
              name: functionName,
              tool_call_id: toolCallId,
              content: content,
            },
            triggerResponseEnabled: true,
          } as any);
          console.log("✅ Tool result sent successfully to VAPI");
        } catch (error) {
          console.error("❌ Failed to send tool result to Vapi:", error);
        }
      },
      [],
    );

    const handleFunctionCall = useCallback(async (functionName: string, rawArgs: any) => {
      const args = parseFunctionArgs(rawArgs);
      const countryArg = typeof args.country === "string" ? args.country.trim() : "";
      const latestOnLocationQuery = onLocationQueryRef.current;
      const latestHighRiskFn = getHighRiskLocationsRef.current;
      const latestPointsData = pointsDataRef.current;
      const latestTrendingScams = trendingScamsRef.current;
      const latestSendTipsAction = sendPreventionTipsEmailActionRef.current;

      switch (functionName) {
        case "queryScamsByLocation":
        case "travel-scam-location-query": // Dashboard tool name
          if (countryArg && latestOnLocationQuery) {
            try {
              console.log("🎯 VAPI Tool Call: queryScamsByLocation", { country: countryArg });

              // Focus the globe on the country
              latestOnLocationQuery(countryArg);

              // Use points data instead of locationData for accurate country info
              const points = latestPointsData || [];
              console.log(
                "📊 Available countries in points:",
                points.map((p) => p.country),
              );

              // Find matching country in points (handle aliases and case-insensitive)
              let countryPoint = points.find((p) => p.country === countryArg);
              let matchedCountryName = countryArg;

              if (!countryPoint) {
                // Try case-insensitive exact match
                const lowerCountryArg = countryArg.toLowerCase();
                countryPoint = points.find((p) => p.country.toLowerCase() === lowerCountryArg);
                if (countryPoint) {
                  matchedCountryName = countryPoint.country;
                  console.log("✓ Found via case-insensitive match:", matchedCountryName);
                } else {
                  // Try partial match (e.g., "America" matches "United States")
                  countryPoint = points.find(
                    (p) => p.country.toLowerCase().includes(lowerCountryArg) || lowerCountryArg.includes(p.country.toLowerCase()),
                  );
                  if (countryPoint) {
                    matchedCountryName = countryPoint.country;
                    console.log("✓ Found via partial match:", matchedCountryName);
                  }
                }
              }

              if (countryPoint && countryPoint.reports > 0) {
                // Country has scam data - send detailed information
                console.log("🔍 FOUND COUNTRY POINT:", {
                  country: matchedCountryName,
                  reports: countryPoint.reports,
                  risk: countryPoint.risk,
                  types: countryPoint.types,
                  warnings: countryPoint.warningSignals,
                  tips: countryPoint.preventionTips,
                });

                const scamTypesText =
                  countryPoint.types && countryPoint.types.length > 0
                    ? countryPoint.types.slice(0, 3).join(", ")
                    : "various types";

                const warningSignalsText =
                  countryPoint.warningSignals && countryPoint.warningSignals.length > 0
                    ? countryPoint.warningSignals.slice(0, 2).join(". ")
                    : "";

                const preventionTipsText =
                  countryPoint.preventionTips && countryPoint.preventionTips.length > 0
                    ? countryPoint.preventionTips.slice(0, 2).join(". ")
                    : "";

                const riskLevelText =
                  countryPoint.risk >= 0.6 ? "HIGH RISK" : countryPoint.risk >= 0.4 ? "MEDIUM RISK" : "LOW RISK";

                // Simple, direct format that AI can easily parse
                const resultText = `${matchedCountryName}: ${riskLevelText}, ${countryPoint.reports} scam reports. Types: ${scamTypesText}. ${warningSignalsText ? `Warnings: ${warningSignalsText}. ` : ""}${preventionTipsText ? `Tips: ${preventionTipsText}` : ""}`;

                console.log("✅ Sending scam data to VAPI:", resultText);
                console.log("✅ Result length:", resultText.length, "characters");

                return {
                  success: true,
                  result: resultText,
                  country: matchedCountryName,
                  action: "map_focused",
                  data: countryPoint,
                };
              } else {
                // No scam data for this country
                const resultText = `${countryArg}: No specific scam data available. Stay vigilant - common scams include fake tickets, bogus accommodations, overpriced taxis, and tourist traps. Use official platforms and payment protection.`;

                console.log("⚠️ No data found for country, sending generic advice:", resultText);

                return {
                  success: true,
                  result: resultText,
                  country: countryArg,
                  action: "map_focused",
                  data: null,
                };
              }
            } catch (error) {
              console.error("Error focusing globe on location:", error);
              return {
                success: false,
                result: `Unable to focus on ${countryArg || "requested location"}`,
                error: "Focus failed",
                country: countryArg,
              };
            }
          }
          console.warn("🎯 Voice Assistant: Location query called but missing country or onLocationQuery handler");
          return {
            success: false,
            result: "Invalid country parameter",
            error: "Missing country name",
            country: countryArg,
          };
        case "sendPreventionTipsEmail": {
          if (countryArg) {
            try {
              await latestSendTipsAction({ country: countryArg });
              return {
                success: true,
                result: `Okay, I've sent the prevention tips for ${countryArg} to your email.`,
              };
            } catch (error) {
              console.error("Error triggering send prevention tips email:", error);
              return {
                success: false,
                result: `Sorry, I was unable to send the email.`,
                error: "Email sending failed",
              };
            }
          }
          return {
            success: false,
            result: "Could not send email. Missing country.",
            error: "Missing parameters",
          };
        }
        case "getHighRiskLocations": {
          try {
            const highRisk = latestHighRiskFn ? latestHighRiskFn() : [];
            return {
              success: true,
              locations: highRisk,
              count: highRisk.length,
              message: `Found ${highRisk.length} high-risk locations.`,
            };
          } catch (error) {
            console.error("Error getting high risk locations:", error);
            return {
              success: false,
              message: "Could not retrieve high-risk locations data.",
              error: "Data retrieval failed",
            };
          }
        }
        case "getTrendingScams": {
          try {
            const scams = Array.isArray(latestTrendingScams) ? latestTrendingScams : [];
            return {
              success: true,
              scams: scams,
              count: scams.length,
              message: `Retrieved ${scams.length} trending scam reports.`,
            };
          } catch (error) {
            console.error("Error getting trending scams:", error);
            return {
              success: false,
              message: "Could not retrieve trending scam data.",
              error: "Data retrieval failed",
            };
          }
        }
        default:
          console.warn(`Unknown function called: ${functionName}`);
          return {
            success: false,
            message: `Function '${functionName}' is not recognized.`,
            error: "Unknown function",
          };
      }
    }, []);

    const attachVapiEventHandlers = useCallback(
      (vapiInstance: Vapi) => {
        vapiInstance.on("call-start", () => {
          console.log("🎬 VAPI call-start - clearing processed tool calls");
          processedToolCallsRef.current.clear();
          lastTranscriptRef.current = null;
          setIsListening(true);
          setIsConnecting(false);
          setConversationHistory([]);
          setIsThinking(false);
          onSessionActiveChangeRef.current?.(true);
        });

        vapiInstance.on("call-end", () => {
          if (cleaningTimeoutRef.current) {
            clearTimeout(cleaningTimeoutRef.current);
          }
          setIsListening(false);
          setIsConnecting(false);
          setIsThinking(false);
          onVoiceSessionEndRef.current?.();
          onSessionActiveChangeRef.current?.(false);
        });

        vapiInstance.on("speech-start", () => {
          setIsThinking(false);
        });

        vapiInstance.on("speech-end", () => {
          setIsThinking(false);

          // Clean assistant's last message with LLM after speech ends (debounced)
          if (cleaningTimeoutRef.current) {
            clearTimeout(cleaningTimeoutRef.current);
          }

          cleaningTimeoutRef.current = setTimeout(async () => {
            setConversationHistory((prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === "assistant" && lastMsg.message.trim()) {
                // Clean the transcript asynchronously
                cleanTranscriptAction({ transcript: lastMsg.message })
                  .then((result) => {
                    if (result.cleaned !== lastMsg.message) {
                      setConversationHistory((current) => {
                        const last = current[current.length - 1];
                        if (last && last.role === "assistant" && last.message === lastMsg.message) {
                          return [...current.slice(0, -1), { ...last, message: result.cleaned }];
                        }
                        return current;
                      });
                    }
                  })
                  .catch((err) => console.error("Failed to clean transcript:", err));
              }
              return prev;
            });
          }, 1000); // Wait 1 second after speech ends before cleaning
        });

        vapiInstance.on("message", async (message: any) => {
          // Log ALL messages to understand VAPI format
          console.log("📩 VAPI Message Event:", {
            type: message.type,
            keys: Object.keys(message),
            message: message,
          });

          // CRITICAL: Monitor for auto-end signals
          if (message.type === "call-end" || message.type === "end-call") {
            console.warn("🚨 UNEXPECTED CALL END DETECTED:", message);
          }

          // Handle "hang" event - indicates assistant is waiting/processing
          if (message.type === "hang") {
            console.log("⏳ VAPI Hang Event - Assistant is processing...");
            // Show thinking indicator while tool is executing on server
            setIsThinking(true);
            return;
          }

          if (message.type === "transcript") {
            const rawTranscript = message.transcript || "";
            // Clean consecutive duplicate words/phrases
            const newTranscript = removeDuplicateWords(rawTranscript);
            const newRole = message.role;

            // Deduplication: Skip if exact same transcript from same role
            if (
              lastTranscriptRef.current &&
              lastTranscriptRef.current.role === newRole &&
              lastTranscriptRef.current.text === newTranscript
            ) {
              return; // Skip duplicate
            }

            // Update last transcript tracker
            lastTranscriptRef.current = { role: newRole, text: newTranscript };

            setConversationHistory((prev) => {
              const lastMsg = prev[prev.length - 1];

              if (lastMsg && lastMsg.role === newRole) {
                // Same role - check if streaming update or new segment
                const lastText = lastMsg.message.toLowerCase().trim();
                const newText = newTranscript.toLowerCase().trim();

                // If new text contains old text (cumulative/streaming) - REPLACE
                if (newText.includes(lastText) && newText.length > lastText.length) {
                  return [...prev.slice(0, -1), { ...lastMsg, message: newTranscript }];
                }

                // If old text contains new text (correction/shorter version) - REPLACE
                if (lastText.includes(newText)) {
                  return [...prev.slice(0, -1), { ...lastMsg, message: newTranscript }];
                }

                // Otherwise merge with overlap detection
                const merged = mergeTexts(lastMsg.message, newTranscript);
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMsg,
                    message: merged,
                  },
                ];
              }

              // Different role or no previous message - CREATE new message
              return [
                ...prev,
                {
                  role: newRole,
                  message: newTranscript,
                  timestamp: Date.now(),
                },
              ];
            });

            // Update thinking state
            if (message.role === "user") {
              setIsThinking(true);
            } else if (message.role === "assistant") {
              setIsThinking(false);
            }
          }

          if (message.type === "function-call") {
            console.log("📞 VAPI function-call event:", message);
            const potentialToolCallId = message.toolCallId || message.tool_call_id || message.id || message.toolCall?.id;

            // Check if already processed to avoid duplicates
            if (potentialToolCallId && processedToolCallsRef.current.has(potentialToolCallId)) {
              console.log("⏭️ Skipping duplicate tool call:", potentialToolCallId);
              return;
            }

            const result = await handleFunctionCall(message.functionName, message.functionArgs);
            console.log("📤 Tool call result:", result);

            if (potentialToolCallId) {
              processedToolCallsRef.current.add(potentialToolCallId);
              console.log("📨 Sending tool result to VAPI:", {
                toolCallId: potentialToolCallId,
                functionName: message.functionName,
                resultText: result?.result,
              });
              sendToolResultToVapi(potentialToolCallId, message.functionName ?? "", {
                success: Boolean(result?.success),
                result: result?.result,
                country: result?.country,
              });
            } else {
              console.warn("🚨 No toolCallId found in function call message:", message);
            }
          }

          // Also check for tool-calls format (alternative format)
          if (message.type === "tool-calls" || message.toolCalls) {
            console.log("🔧 TOOL-CALLS Event Detected (Server-side):", {
              messageType: message.type,
              messageKeys: Object.keys(message),
            });

            // Parse tool call to trigger globe highlighting
            const toolCalls = message.toolCalls || message.toolCallList || [];
            for (const toolCall of toolCalls) {
              const toolCallId = toolCall.id;

              // Deduplicate: skip if already processed
              if (toolCallId && processedToolCallsRef.current.has(toolCallId)) {
                console.log("⏭️ Skipping duplicate tool-calls event:", toolCallId);
                continue;
              }

              const functionName = toolCall.function?.name || toolCall.name;
              const rawArgs = toolCall.function?.arguments || toolCall.arguments;

              if (functionName === "queryScamsByLocation" && rawArgs) {
                const args = parseFunctionArgs(rawArgs);
                const country = args.country;

                if (country && onLocationQuery) {
                  console.log("🌍 Triggering globe highlight for:", country);
                  onLocationQuery(country);

                  // Mark as processed after successful highlighting
                  if (toolCallId) {
                    processedToolCallsRef.current.add(toolCallId);
                  }
                }
              }
            }

            // Server handles tool execution, client just highlights globe
            return;

            /* Client-side handling disabled - using server-side endpoint
            const toolCalls = message.toolCalls || message.toolCallList || [];
            console.log("🔧 Tool calls array:", toolCalls);

            // Use for...of to properly await async functions
            for (const toolCall of toolCalls) {
              console.log("🔧 Processing individual tool call:", {
                toolCall,
                keys: Object.keys(toolCall),
              });

              // VAPI sends: { id, type: "function", function: { name, arguments } }
              const functionName = toolCall.function?.name || toolCall.name;
              const rawArgs = toolCall.function?.arguments || toolCall.arguments;
              const toolCallId = toolCall.id;

              console.log("🔧 Extracted tool call details:", {
                functionName,
                rawArgs,
                rawArgsType: typeof rawArgs,
                toolCallId,
              });

              // Check if already processed to avoid duplicates
              if (toolCallId && processedToolCallsRef.current.has(toolCallId)) {
                console.log("⏭️ Skipping duplicate tool call:", toolCallId);
                continue;
              }

              if (functionName && rawArgs && toolCallId) {
                console.log("✅ All data present, processing tool call...");
                processedToolCallsRef.current.add(toolCallId);
                
                console.log("📞 Calling handleFunctionCall:", { functionName, rawArgs });
                const result = await handleFunctionCall(functionName, rawArgs);
                console.log("📤 handleFunctionCall returned:", result);

                // Send tool result in standard format
                console.log("📨 Preparing to send tool result to VAPI...");
                sendToolResultToVapi(toolCallId, functionName, {
                  success: Boolean(result?.success),
                  result: (result as any)?.result,
                  country: (result as any)?.country,
                });

                // HACK: Also inject as assistant message to force AI to see it
                if (vapiRef.current && (result as any)?.result) {
                  console.log("💉 Injecting tool result as assistant message...");
                  try {
                    vapiRef.current.send({
                      type: "add-message",
                      message: {
                        role: "assistant",
                        content: `[SCAM DATA] ${(result as any).result}`,
                      },
                    } as any);
                    console.log("✅ Injected successfully");
                  } catch (err) {
                    console.error("❌ Failed to inject:", err);
                  }
                }
              } else {
                console.warn("🚨 Incomplete tool call data:", { 
                  functionName, 
                  rawArgs, 
                  toolCallId,
                  hasFunction: !!functionName,
                  hasArgs: !!rawArgs,
                  hasId: !!toolCallId,
                  toolCallObject: toolCall,
                });
              }
            }
            */
          }
        });

        vapiInstance.on("error", (error: any) => {
          console.error("❌ Vapi error:", error);

          // Handle specific errors
          if (error?.errorMsg?.includes("voice-not-found") || error?.errorMsg?.includes("eleven-labs")) {
            console.warn("🔊 Voice provider issue detected, attempting recovery...");
            // Don't stop on voice errors, let it continue
          } else if (error?.errorMsg?.includes("Meeting has ended")) {
          } else {
            // Only stop on critical errors
            setIsListening(false);
            setIsConnecting(false);
            setIsThinking(false);
            onSessionActiveChangeRef.current?.(false);
          }
        });
      },
      [handleFunctionCall, sendToolResultToVapi, cleanTranscriptAction],
    );

    const initializeVapiClient = useCallback(() => {
      const publicKey = PUBLIC_VAPI_PUBLIC_KEY;
      if (!publicKey) {
        console.warn("Vapi public key not configured. Voice assistant disabled.");
        return null;
      }

      // Reuse a singleton across mounts to avoid duplicate SDK initializations (e.g., Krisp)
      const globalAny = typeof window !== "undefined" ? (window as any) : ({} as any);
      const existingClient = vapiRef.current ?? (globalAny.__vapiClient as Vapi | undefined) ?? null;
      if (existingClient) {
        (existingClient as any).removeAllListeners?.();
        attachVapiEventHandlers(existingClient);
        vapiRef.current = existingClient;
        return existingClient;
      }

      const vapiInstance = new Vapi(publicKey);
      if (typeof window !== "undefined") {
        (globalAny.__vapiClient as any) = vapiInstance;
      }
      attachVapiEventHandlers(vapiInstance);
      vapiRef.current = vapiInstance;
      return vapiInstance;
    }, [attachVapiEventHandlers]);

    useEffect(() => {
      const client = initializeVapiClient();
      return () => {
        if (cleaningTimeoutRef.current) {
          clearTimeout(cleaningTimeoutRef.current);
        }
        if (!client) {
          return;
        }
        (client as any).removeAllListeners?.();
        client.stop();
        if (vapiRef.current === client) {
          vapiRef.current = null;
        }
      };
    }, [initializeVapiClient]);

    const handleToggleVoice = async () => {
      const vapi = vapiRef.current ?? initializeVapiClient();
      if (!vapi) {
        alert("Voice assistant not configured. Please add VAPI_PUBLIC_KEY to your environment variables.");
        return;
      }

      if (isListening) {
        vapi.stop();
      } else {
        setIsConnecting(true);
        try {
          const locationData = getLocationScamData();
          const highRiskLocations = getHighRiskLocations();
          // Use dashboard assistant if configured, otherwise inline config
          const assistantId = PUBLIC_VAPI_ASSISTANT_ID;

          if (assistantId) {
            await vapi.start(assistantId, {
              variableValues: {
                scamData: JSON.stringify(locationData),
                highRiskLocations: highRiskLocations.join(", "),
                travelerName: travelerFallbackName,
              },
              // Explicitly disable Krisp denoising to avoid duplicate SDK loads
              backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: false } },
              // Prevent auto-end call configurations
              maxDurationSeconds: 600, // 10 minutes max duration
            });
          } else {
            await vapi.start({
              firstMessage: `Hi ${travelerGreetingName}, welcome to Travel Scam Alert. I’m here to help you stay safe wherever you’re headed—what city or country should we look at first?`,
              // Prevent auto-end call configurations
              maxDurationSeconds: 600, // 10 minutes max duration
              model: {
                provider: "openai",
                model: "gpt-4-turbo-preview",
                temperature: 0.7,
                messages: [
                  {
                    role: "system",
                    content: `You are the friendly Travel Scam Alert assistant. You speak like a well-traveled safety expert and keep conversations natural.

Dynamic data you have right now:
- SCAM DATA (JSON):
${JSON.stringify(locationData, null, 2)}
- HIGH RISK LOCATIONS: ${highRiskLocations.join(", ") || "None currently flagged"}
- TRAVELER NAME TO ADDRESS: ${travelerFallbackName}

Style:
- Keep replies to 2-3 concise sentences with a warm, conversational tone.
- Use contractions and reassure even when warning about risks.
- Address the traveler by name whenever possible.

Conversation flow:
1. If you still don’t know the traveler’s destination, ask briefly.
2. When data exists for their destination, state the risk level, mention scam types, give one actionable prevention tip, and include a warning signal if available.
3. If data is missing, admit it and offer universal safety advice.
4. If the destination is high risk, say so plainly and encourage extra caution.
5. CRITICAL: Whenever the traveler mentions ANY location (country, city, or destination), you MUST immediately call the queryScamsByLocation tool with the country name. After the tool executes, DO NOT mention the tool execution - just seamlessly provide scam information about that location.
6. After using the queryScamsByLocation tool, immediately provide specific scam information about the location and ask if they want to know about another destination.

TOOL USAGE RULES:
- ALWAYS call queryScamsByLocation when user mentions any location
- Use specific country names (e.g., "United States" not "America", "United Kingdom" not "England")
- The tool returns scam information for the country in this format:
  * With data: "{Country}: {RISK LEVEL}, X scam reports. Types: {list}. Warnings: {list}. Tips: {list}"
  * No data: "{Country}: No specific scam data available. Stay vigilant - common scams include..."
- READ the tool result and share the information naturally in 2-3 sentences
- If you see a risk level (HIGH/MEDIUM/LOW) and scam types, SHARE them with the traveler
- If you see "No specific scam data", acknowledge it and share the generic safety tips provided
- DO NOT say "I pulled the view", "let me focus", "I tried", or "I checked" - just share the scam information directly
- NEVER mention technical details - talk like a knowledgeable travel expert
- ALWAYS end with a question to continue: "What other destination interests you?" or "Where else are you headed?"
- Examples:
  * Tool: "Singapore: HIGH RISK, 4 scam reports. Types: dynamic pricing, fake sold-out. Warnings: Price differences in incognito mode. Tips: Check prices in incognito mode."
    → You: "Singapore has high risk with 4 scam reports - watch for dynamic pricing and fake sold-out messages. Always check prices in incognito mode before booking. What other place would you like to know about?"
  * Tool: "Italy: No specific scam data available. Stay vigilant - common scams include fake tickets..."
    → You: "I don't have Italy-specific data yet, but stay alert for common scams like fake tickets and bogus rentals. Use official platforms. Where else are you going?"

CRITICAL CONVERSATION CONTINUITY RULES:
- THIS IS A CONTINUOUS CONVERSATION - NEVER END THE CALL AUTOMATICALLY
- NEVER end the call after using any tool
- NEVER say "goodbye", "that's all", "call ended", or any finality phrases after tool execution
- ALWAYS ask for more locations after providing scam information  
- Keep conversations active and engaging indefinitely
- Tool calls should ENHANCE conversation, not END it
- You must ALWAYS wait for user response after tool execution
- If user asks about multiple countries, handle each one and keep going
- Only end the conversation if the user explicitly says goodbye or wants to stop

CRITICAL - HOW TO USE TOOL RESULTS:
After calling queryScamsByLocation, the tool will return text like:
"Singapore: HIGH RISK, 4 scam reports. Types: dynamic pricing, fake sold-out. Warnings: Price differences. Tips: Check in incognito."

YOU MUST READ THIS TEXT AND SHARE THE INFORMATION.
Example: "Singapore has high risk with 4 scam reports. Watch for dynamic pricing and fake sold-out messages. Always check prices in incognito mode. What other place interests you?"

DO NOT say "I don't have data" if the tool gave you risk level and scam types - SHARE THEM!`,
                  },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "queryScamsByLocation",
                      description:
                        "Get travel scam information for a specific country. ALWAYS use this when user mentions a location.",
                      parameters: {
                        type: "object",
                        properties: {
                          country: {
                            type: "string",
                            description: "The country name (e.g., 'Singapore', 'United States', 'Thailand')",
                          },
                        },
                        required: ["country"],
                      },
                    },
                    server: {
                      url: "https://api.dev.rokimiftah.id/vapi/tool-call",
                      timeoutSeconds: 20,
                    },
                    messages: [
                      {
                        type: "request-start",
                        content: "Let me check the scam data for that location...",
                        conditions: [],
                      },
                    ],
                  },
                  {
                    type: "function",
                    function: {
                      name: "sendPreventionTipsEmail",
                      description:
                        "Sends an email to the user with scam prevention tips for a specific country. Only call this if the user agrees to receive the email.",
                      parameters: {
                        type: "object",
                        properties: {
                          country: { type: "string", description: "The country for which to send prevention tips." },
                        },
                        required: ["country"],
                      },
                    },
                  },
                ],
              },
              // Explicitly disable Krisp denoising to avoid duplicate SDK loads
              backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: false } },
              voice: {
                provider: "azure",
                voiceId: "en-US-JennyNeural",
                speed: 1.0,
              },
            });
          }
        } catch (error) {
          console.error("Failed to start voice assistant:", error);
          setIsConnecting(false);
        }
      }
    };

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      toggleVoice: handleToggleVoice,
      stopVoice: () => {
        if (vapiRef.current) {
          vapiRef.current.stop();
        }
      },
      isListening,
    }));

    if (!isAuthenticated) {
      return null;
    }

    // Voice Interface Panel (shows in left column when active)
    if (!isListening && !isConnecting) {
      return null;
    }

    return (
      <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: "#1a1a1f" }}>
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4" style={{ backgroundColor: "#16161b" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                {isListening && (
                  <div className="absolute inset-0 -m-1 rounded-full">
                    <div className="h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></div>
                  </div>
                )}
                <div className={`h-2 w-2 rounded-full ${isListening ? "bg-green-400" : "animate-pulse bg-yellow-400"}`}></div>
              </div>
              <span className="text-sm font-medium text-white/90">
                {isConnecting ? "Connecting to AI..." : "AI Assistant Active"}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "#1a1a1f" }}>
          {isConnecting ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 animate-spin text-white/40" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p className="mt-3 text-sm text-white/60">Initializing voice assistant...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {conversationHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6">
                  <p className="text-sm text-white/40">Start speaking to begin conversation...</p>
                </div>
              ) : (
                conversationHistory.map((msg, idx) => (
                  <div
                    key={`${msg.timestamp}-${idx}`}
                    className={`animate-fadeIn border-b border-white/5 px-6 py-4 ${
                      msg.role === "user" ? "bg-blue-500/5" : "bg-purple-500/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 rounded-full p-2 ${
                          msg.role === "user" ? "bg-blue-500/10" : "bg-purple-500/10"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`text-xs font-medium ${msg.role === "user" ? "text-blue-400" : "text-purple-400"}`}>
                            {msg.role === "user" ? "You" : "AI Assistant"}
                          </span>
                          <span className="text-xs text-white/30">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed break-words text-white/80">{msg.message}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Thinking Indicator */}
              {isThinking && (
                <div className="animate-fadeIn border-b border-white/5 bg-purple-500/5 px-6 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 rounded-full bg-purple-500/10 p-2">
                      <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <span className="mb-1 block text-xs font-medium text-purple-400">AI Assistant</span>
                      <div className="flex items-center gap-1">
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-purple-400/60"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-purple-400/60"
                          style={{ animationDelay: "150ms" }}
                        ></div>
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-purple-400/60"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 bg-black/20 px-6 py-3">
          <div className="flex items-center justify-between">
            <span></span>
            <button
              onClick={() => vapiRef.current?.stop()}
              className="cursor-pointer bg-red-500/20 px-4 py-2 text-xs font-medium text-red-400 transition-all hover:bg-red-500/30"
            >
              End Session
            </button>
          </div>
        </div>

        {/* Add keyframe animation */}
        <style>{`
					@keyframes fadeIn {
						from {
							opacity: 0;
							transform: translateY(10px);
						}
						to {
							opacity: 1;
							transform: translateY(0);
						}
					}
					.animate-fadeIn {
						animation: fadeIn 0.3s ease-out;
					}
				`}</style>
      </div>
    );
  },
);

VoiceAssistantIntegrated.displayName = "VoiceAssistantIntegrated";

export default VoiceAssistantIntegrated;
