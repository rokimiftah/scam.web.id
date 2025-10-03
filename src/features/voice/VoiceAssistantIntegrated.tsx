// src/features/voice/VoiceAssistantIntegrated.tsx

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import Vapi from "@vapi-ai/web";
import { useAction, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

interface VoiceAssistantProps {
	isAuthenticated: boolean;
	onLocationQuery?: (country: string) => void;
	onVoiceSessionEnd?: () => void;
	onSessionActiveChange?: (active: boolean) => void;
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

const VoiceAssistantIntegrated = forwardRef<VoiceAssistantHandle, VoiceAssistantProps>(
	({ isAuthenticated, onLocationQuery, onVoiceSessionEnd, onSessionActiveChange }, ref) => {
		const [isListening, setIsListening] = useState(false);
		const [isConnecting, setIsConnecting] = useState(false);
		const [transcript, setTranscript] = useState("");
		const [assistantResponse, setAssistantResponse] = useState("");
		const [isThinking, setIsThinking] = useState(false);
		const vapiRef = useRef<Vapi | null>(null);

		// Fetch data for the assistant to use
		const scamStories = useQuery(api.scams.getScamStories, { limit: 100 });
		const locationStats = useQuery(api.scams.getLocationStats, {});
		const trendingScams = useQuery(api.scams.getTrendingScams, {});
		const currentUser = useQuery(api.users.getCurrentUser);
		const sendPreventionTipsEmailAction = useAction(api.aiAnalyzer.sendPreventionTips);

		const onLocationQueryRef = useRef(onLocationQuery);
		const trendingScamsRef = useRef(trendingScams);
		const getHighRiskLocationsRef = useRef<() => string[]>(() => []);
		const onVoiceSessionEndRef = useRef(onVoiceSessionEnd);
		const onSessionActiveChangeRef = useRef(onSessionActiveChange);
		const sendPreventionTipsEmailActionRef = useRef(sendPreventionTipsEmailAction);

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
					console.warn("🚨 Cannot send tool result: missing vapi instance or toolCallId");
					return;
				}

				try {
					const messageContent = {
						toolCallId,
						functionName,
						...payload,
					};

					vapiRef.current.send({
						type: "add-message",
						message: {
							role: "tool",
							name: functionName,
							tool_call_id: toolCallId,
							content: JSON.stringify(messageContent),
						},
						triggerResponseEnabled: true,
					} as any);
				} catch (error) {
					console.error("❌ Failed to send tool result to Vapi:", error);
				}
			},
			[],
		);

		const handleFunctionCall = useCallback((functionName: string, rawArgs: any) => {
			const args = parseFunctionArgs(rawArgs);
			const countryArg = typeof args.country === "string" ? args.country.trim() : "";
			const latestOnLocationQuery = onLocationQueryRef.current;
			const latestHighRiskFn = getHighRiskLocationsRef.current;
			const latestTrendingScams = trendingScamsRef.current;
			const latestSendTipsAction = sendPreventionTipsEmailActionRef.current;

			switch (functionName) {
				case "queryScamsByLocation":
				case "travel-scam-location-query": // Dashboard tool name
					if (countryArg && latestOnLocationQuery) {
						try {
							latestOnLocationQuery(countryArg);
							return {
								success: true,
								result: `Successfully focused on ${countryArg}`,
								country: countryArg,
								action: "map_focused",
							};
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
							latestSendTipsAction({ country: countryArg });
							return {
								success: true,
								result: `Okay, I'm sending the prevention tips for ${countryArg} to the user's email.`,
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
					setIsListening(true);
					setIsConnecting(false);
					setTranscript("");
					setAssistantResponse("");
					setIsThinking(false);
					onSessionActiveChangeRef.current?.(true);
				});

				vapiInstance.on("call-end", () => {
					setIsListening(false);
					setIsConnecting(false);
					setTranscript("");
					setAssistantResponse("");
					setIsThinking(false);
					onVoiceSessionEndRef.current?.();
					onSessionActiveChangeRef.current?.(false);
				});

				vapiInstance.on("speech-start", () => {
					setAssistantResponse("");
					setIsThinking(false);
				});

				vapiInstance.on("speech-end", () => {
					setIsThinking(false);
				});

				vapiInstance.on("message", (message: any) => {
					// CRITICAL: Monitor for auto-end signals
					if (message.type === "call-end" || message.type === "end-call") {
						console.warn("🚨 UNEXPECTED CALL END DETECTED:", message);
					}

					if (message.type === "transcript") {
						if (message.role === "user") {
							setTranscript(message.transcript);
							setIsThinking(true);
						} else if (message.role === "assistant") {
							setAssistantResponse(message.transcript);
							setIsThinking(false);
						}
					}

					if (message.type === "function-call") {
						const result = handleFunctionCall(message.functionName, message.functionArgs);

						const potentialToolCallId = message.toolCallId || message.tool_call_id || message.id || message.toolCall?.id;
						if (potentialToolCallId) {
							sendToolResultToVapi(potentialToolCallId, message.functionName ?? "", {
								success: Boolean(result?.success),
								result: result?.result,
								country: result?.country,
							});
						} else {
							console.warn("🚨 No toolCallId found in function call message");
						}
					}

					// Also check for tool-calls format (alternative format)
					if (message.type === "tool-calls" || message.toolCalls) {
						const toolCalls = message.toolCalls || message.toolCallList || [];

						toolCalls.forEach((toolCall: any) => {
							const functionName = toolCall.name || toolCall.function?.name;
							const rawArgs = toolCall.arguments || toolCall.function?.arguments;
							const toolCallId = toolCall.id;

							if (functionName && rawArgs && toolCallId) {
								const result = handleFunctionCall(functionName, rawArgs);

								// Forward the actual result from the handler so it works for all tools
								// (Previously this always sent a "focused on" message which was only correct for location queries.)
								sendToolResultToVapi(toolCallId, functionName, {
									success: Boolean(result?.success),
									result: (result as any)?.result,
									country: (result as any)?.country,
								});
							} else {
								console.warn("🚨 Incomplete tool call data:", { functionName, rawArgs, toolCallId });
							}
						});
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
			[handleFunctionCall, sendToolResultToVapi],
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
					// Temporarily disable assistant ID to use improved inline config
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
- After the tool call, DO NOT say "let me focus the map" or "I couldn't update" - just provide scam information directly
- The tool focuses the globe automatically - you don't need to explain this to the user
- NEVER end the conversation after a tool call - always follow up with relevant information
- Examples of natural responses after tool calls:
  * User: "America" → Call tool → You: "The United States has MEDIUM risk level with common taxi and online scams. Keep your valuables secure in major cities. Would you like to know about another destination?"
  * User: "Thailand" → Call tool → You: "Thailand shows HIGH risk with taxi scams and fake police checkpoints reported. Always use metered taxis and ask for police ID. What other location interests you?"

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

CONVERSATION FLOW AFTER TOOL CALLS:
1. Call queryScamsByLocation tool (automatically focuses globe)
2. Immediately provide: risk level + common scam types + 1-2 prevention tips
3. Always end with: "Would you like to know about another destination?" or "What other places are you considering?"
4. Never mention map/globe updates - focus only on safety information
5. WAIT for user response - DO NOT end conversation
6. Continue this pattern indefinitely until user wants to stop

Risk guidance:
- HIGH RISK → stress vigilance.
- MEDIUM RISK → advise staying alert in known trouble spots.
- LOW RISK → reassure but still offer a quick tip.

Error handling:
- Ask for clarification when the destination is unclear.
- If data is unavailable or something fails, apologize and give best-effort safety advice instead of guessing.
- Always keep the conversation going with follow-up questions

Your goal: Help ${travelerFallbackName} stay safe using the data above. This is an ongoing conversation that should continue until the user explicitly wants to end it.

CONVERSATION FLOW AFTER TOOL CALLS:
1. Call queryScamsByLocation tool (automatically focuses globe).
2. Immediately provide: risk level + common scam types + 1-2 prevention tips for the location.
3. After providing the tips, ask the user if they would like a more detailed list of prevention tips sent to their email. For example: "I can also send a more detailed list of prevention tips for [Country] to your email. Would you like me to do that?"
4. If they say yes, call the 'sendPreventionTipsEmail' function with the correct country. After the tool call, confirm with a message like "Alright, I've sent that to you."
5. After handling the email request (or if they say no), ALWAYS ask if they want to know about another destination to continue the conversation. For example: "What other places are you considering?"
6. Never mention map/globe updates - focus only on safety information.
7. WAIT for user response - DO NOT end conversation.
8. Continue this pattern indefinitely until user wants to stop.`,
									},
								],
								tools: [
									{
										type: "function",
										function: {
											name: "queryScamsByLocation",
											description: "Focus the globe on the country or city the traveler asks about and get scam information.",
											parameters: {
												type: "object",
												properties: {
													country: { type: "string", description: "Country name to focus on and get scam data for" },
												},
												required: ["country"],
											},
										},
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
			<div className="absolute inset-0 z-50 flex flex-col bg-gradient-to-b from-blue-600/10 to-purple-600/10 backdrop-blur-sm">
				{/* Header */}
				<div className="border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-purple-600/20 px-4 py-3">
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
				<div className="flex-1 overflow-y-auto p-4">
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
						<div className="space-y-4">
							{/* Transcript */}
							{transcript && (
								<div className="animate-fadeIn">
									<div className="mb-2 flex items-center gap-2">
										<span className="text-xs font-medium text-blue-400">You</span>
										{isThinking && (
											<div className="flex space-x-1">
												<div className="h-1 w-1 animate-bounce rounded-full bg-white/40" style={{ animationDelay: "0ms" }}></div>
												<div
													className="h-1 w-1 animate-bounce rounded-full bg-white/40"
													style={{ animationDelay: "150ms" }}
												></div>
												<div
													className="h-1 w-1 animate-bounce rounded-full bg-white/40"
													style={{ animationDelay: "300ms" }}
												></div>
											</div>
										)}
									</div>
									<div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
										<p className="text-sm text-white/90">{transcript}</p>
									</div>
								</div>
							)}

							{/* Assistant Response */}
							{assistantResponse && (
								<div className="animate-fadeIn">
									<p className="mb-2 text-xs font-medium text-purple-400">Assistant</p>
									<div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-3">
										<p className="text-sm leading-relaxed text-white/90">{assistantResponse}</p>
									</div>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="border-t border-white/10 bg-black/20 px-4 py-3">
					<div className="flex items-center justify-between">
						<p></p>
						<button
							onClick={() => vapiRef.current?.stop()}
							className="cursor-pointer rounded bg-red-500/20 px-3 py-1 text-xs text-red-400 transition-all hover:bg-red-500/30"
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
