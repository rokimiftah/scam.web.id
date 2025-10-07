// src/pages/App/index.tsx

/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <> */

import type { Id } from "../../../convex/_generated/dataModel";
import type { VoiceAssistantHandle } from "@features/voice/VoiceAssistantIntegrated";
import type { GlobeMethods } from "react-globe.gl";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import isEmail from "validator/lib/isEmail";

import { UserMenu } from "@features/auth/ui/UserMenu";
import VoiceAssistantIntegrated from "@features/voice/VoiceAssistantIntegrated";
import MobileBlocker from "@shared/components/MobileBlocker";

import { api } from "../../../convex/_generated/api";

const Globe = lazy(() => import("react-globe.gl"));

// --- Types ---
type ScamPoint = {
  id: Id<"scamStories"> | string;
  lat: number;
  lng: number;
  location: string; // City/Area
  country: string; // Country name or ISO code
  risk: number; // 0..1
  reports: number; // number of reports
  types: string[]; // scam categories
  lastReport: string; // ISO date
  title?: string;
  summary?: string;
  scamType?: string;
  moneyLost?: number;
  currency?: string;
  redditUrl?: string;
  warningSignals?: string[];
  preventionTips?: string[];
  storyIds?: Id<"scamStories">[]; // Array of story IDs for this country
  stories?: any[]; // Array of actual story objects
};

type CountryFeature = {
  type: string;
  properties: {
    NAME: string;
    POP_EST?: number;
    [key: string]: any;
  };
  geometry: any;
};

// --- Helpers ---
// Map GeoJSON country names to our database country names
const geoJsonToDbCountryMap: Record<string, string> = {
  "United States of America": "United States",
  "Czech Republic": "Czechia",
  "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
  "Republic of Korea": "South Korea",
  "Democratic People's Republic of Korea": "North Korea",
  "Russian Federation": "Russia",
  "Iran (Islamic Republic of)": "Iran",
  "Viet Nam": "Vietnam",
  "Lao People's Democratic Republic": "Laos",
  "Syrian Arab Republic": "Syria",
  "Venezuela (Bolivarian Republic of)": "Venezuela",
  "Bolivia (Plurinational State of)": "Bolivia",
  "Tanzania (United Republic of)": "Tanzania",
  "Moldova (Republic of)": "Moldova",
  "Macedonia (the former Yugoslav Republic of)": "North Macedonia",
  "Côte d'Ivoire": "Ivory Coast",
  "Congo (Democratic Republic of the)": "Democratic Republic of the Congo",
  Congo: "Republic of the Congo",
  Turkey: "Türkiye", // GeoJSON has "Turkey", DB has "Türkiye"
  // Most other countries use the same name
};

const riskColor = (r: number) => {
  // 0 = low (emerald), 1 = high (red)
  // simple gradient between green -> orange -> red
  if (r < 0.33) return "#10b981"; // emerald-500
  if (r < 0.66) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

// --- Component ---
// Add global styles for animations
const globalStyles = `
	/* Ensure globe container is always dark */
	.globe-container {
		background-color: #15151a !important;
		opacity: 0;
		transition: opacity 0.6s ease-in-out;
	}

	.globe-container.loaded {
		opacity: 1;
	}

	/* Force all globe-related divs to be dark */
	.globe-container > div {
		background-color: #15151a !important;
	}

	.globe-container canvas {
		background-color: #15151a !important;
	}

	/* Loading dots animation */
	.loading-dots {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}

	.loading-dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: currentColor;
		animation: dotPulse 1.4s infinite ease-in-out;
	}

	.loading-dots span:nth-child(1) {
		animation-delay: 0s;
	}

	.loading-dots span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.loading-dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes dotPulse {
		0%, 80%, 100% {
			transform: scale(0);
			opacity: 0.3;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Enhanced loading animations */
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.4;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.1);
		}
	}

	@keyframes ping {
		75%, 100% {
			transform: scale(2);
			opacity: 0;
		}
	}

	@keyframes glow {
		0%, 100% {
			box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
		}
		50% {
			box-shadow: 0 0 40px rgba(59, 130, 246, 0.8), 0 0 60px rgba(59, 130, 246, 0.4);
		}
	}

	/* Pulse wave animation for points */
	@keyframes pulseWave {
		0% {
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
			transform: scale(1);
		}
		50% {
			box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
			transform: scale(1.1);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
			transform: scale(1);
		}
	}

	/* Custom scrollbar for scams list */
	.scams-list::-webkit-scrollbar {
		width: 4px;
		height: 4px;
	}

	.scams-list::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 2px;
	}

	.scams-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
	}

	.scams-list::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	/* Loading spinner styles */
	.loading-spinner {
		position: relative;
		width: 150px;
		height: 150px;
	}

	/* Scanning animation for loading */
	@keyframes scan {
		0% {
			transform: translateY(-32px);
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		80% {
			opacity: 1;
		}
		100% {
			transform: translateY(32px);
			opacity: 0;
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
`;

// Add animation for modal
const modalAnimations = `
	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translate(-50%, -20px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
`;

// Inject styles on mount
if (typeof document !== "undefined" && !document.getElementById("scam-globe-styles")) {
  const styleEl = document.createElement("style");
  styleEl.id = "scam-globe-styles";
  styleEl.textContent = globalStyles + modalAnimations;
  document.head.appendChild(styleEl);
}

export default function App() {
  // Authentication hooks
  const { signIn } = useAuthActions();
  const user = useQuery(api.users.getCurrentUser);
  const isAuthenticated = !!user;
  const isAuthLoading = user === undefined; // Query is still loading

  // Component state - declare selectedStoryId first
  const [selectedStoryId, setSelectedStoryId] = useState<Id<"scamStories"> | null>(null);

  // VAPI → remember last country to offer email tips at session end
  const [lastVapiCountry, setLastVapiCountry] = useState<string | null>(null);
  const [showEmailOffer, setShowEmailOffer] = useState(false);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [offerSentSuccess, setOfferSentSuccess] = useState(false);
  const [isSendingRegion, setIsSendingRegion] = useState(false);
  const [regionSentSuccess, setRegionSentSuccess] = useState(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);

  // Voice-triggered country highlighting
  const [voiceHighlightedCountry, setVoiceHighlightedCountry] = useState<string | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const countryColorMapRef = useRef<Record<string, string>>({});

  // Fetch real scam data from Convex - ALWAYS load (let backend handle auth)
  // This ensures queries start immediately instead of waiting for user auth
  const scamStories = useQuery(api.scams.getScamStoriesForGlobe);
  const locationStats = useQuery(api.scams.getAllLocationStats);
  const totalScamCount = useQuery(api.scams.getTotalScamCount);
  const selectedStoryDetails = useQuery(api.scams.getScamStory, selectedStoryId ? { storyId: selectedStoryId } : "skip");

  // Track if data has loaded at least once
  const [dataLoaded, setDataLoaded] = useState(false);

  // Debug queries and track loading
  useEffect(() => {
    const storiesLoaded = scamStories !== undefined && scamStories !== null;
    const statsLoaded = locationStats !== undefined && locationStats !== null;
    const countLoaded = totalScamCount !== undefined && totalScamCount !== null;

    console.log("📡 Query Status:", {
      isAuthenticated,
      scamStories:
        scamStories === undefined ? "⏳ loading" : scamStories === null ? "❌ null" : `✅ ${scamStories?.length} items`,
      locationStats:
        locationStats === undefined ? "⏳ loading" : locationStats === null ? "❌ null" : `✅ ${locationStats?.length} items`,
      totalCount: totalScamCount === undefined ? "⏳ loading" : totalScamCount === null ? "❌ null" : `✅ ${totalScamCount}`,
    });

    if (storiesLoaded && statsLoaded && countLoaded && !dataLoaded) {
      console.log("✅ All data loaded successfully!");
      setDataLoaded(true);
    }

    if (scamStories === null) {
      console.error("❌ scamStories query returned null - possible permission error");
    }
    if (locationStats === null) {
      console.error("❌ locationStats query returned null - possible permission error");
    }
  }, [isAuthenticated, scamStories, locationStats, totalScamCount, dataLoaded]);

  // Action to send prevention tips email
  const sendPreventionTips = useAction(api.aiAnalyzer.sendPreventionTips);

  const handleSendTipsEmail = useCallback(async () => {
    if (!lastVapiCountry) {
      setShowEmailOffer(false);
      return;
    }

    try {
      setOfferSentSuccess(false);
      setIsSendingOffer(true);
      setEmailSendError(null);
      await sendPreventionTips({ country: lastVapiCountry });
      setOfferSentSuccess(true);

      // Close modal after showing success (1.5s delay)
      setTimeout(() => {
        setShowEmailOffer(false);
        setOfferSentSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Failed to send prevention tips email:", err);
      setEmailSendError("Failed to send email. Please try again.");
    } finally {
      setIsSendingOffer(false);
    }
  }, [lastVapiCountry, sendPreventionTips]);

  // Send tips for a specific country (used in region detail modal button)
  const handleSendTipsForCountry = useCallback(
    async (country: string) => {
      if (!country) return;
      try {
        setRegionSentSuccess(false);
        setIsSendingRegion(true);
        setEmailSendError(null);
        await sendPreventionTips({ country });
        setRegionSentSuccess(true);
        // Auto re-enable after a short success display
        setTimeout(() => setRegionSentSuccess(false), 3000);
      } catch (err) {
        console.error("Failed to send prevention tips email:", err);
        setEmailSendError("Failed to send email. Please try again.");
      } finally {
        setIsSendingRegion(false);
      }
    },
    [sendPreventionTips],
  );

  // Sign-in form state
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_success, setSuccess] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Component state
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const globeContainerRef = useRef<HTMLDivElement | null>(null);
  const voiceAssistantRef = useRef<VoiceAssistantHandle>(null);
  const [riskFilter, setRiskFilter] = useState<number>(0);

  // Convert scam stories to map points - GROUP BY COUNTRY
  const { points, highRiskCount, totalReportsFromVisualization } = useMemo(() => {
    // Return empty if data still loading OR not authenticated
    if (scamStories === undefined || locationStats === undefined) {
      console.log("⏳ Data still loading:", {
        scamStories: scamStories === undefined ? "loading..." : `${scamStories?.length} items`,
        locationStats: locationStats === undefined ? "loading..." : `${locationStats?.length} items`,
      });
      return { points: [], highRiskCount: 0, totalReportsFromVisualization: 0 };
    }

    // If user not authenticated, return empty (backend will return empty arrays)
    if (!isAuthenticated) {
      console.log("⚠️ Not authenticated, using empty data");
      return { points: [], highRiskCount: 0, totalReportsFromVisualization: 0 };
    }

    if (!scamStories || !locationStats) {
      console.log("⚠️ Points empty because data is null:", {
        hasScamStories: !!scamStories,
        scamStoriesCount: scamStories?.length,
        hasLocationStats: !!locationStats,
        locationStatsCount: locationStats?.length,
      });
      return { points: [], highRiskCount: 0, totalReportsFromVisualization: 0 };
    }

    console.log("✅ Processing points with data:", {
      storiesCount: scamStories.length,
      statsCount: locationStats.length,
    });

    // Create points for visualization (only for stories with coordinates)
    // Group stories by COUNTRY, not exact coordinates
    const countryGroups: Map<string, any[]> = new Map();
    const countryCoordinates: Map<string, { lat: number; lng: number }> = new Map();

    // Process stories with coordinates for map visualization
    if (scamStories && scamStories.length > 0) {
      const storiesWithCoords = scamStories.filter(
        (story: any) =>
          story.coordinates?.lat &&
          story.coordinates?.lng &&
          story.country !== "Unknown" &&
          story.country !== "Multiple European Countries" &&
          story.country !== "Multiple Countries",
      );

      storiesWithCoords.forEach((story: any) => {
        const { lat, lng } = story.coordinates;
        const countryKey = story.country;

        // Add story to country group
        if (!countryGroups.has(countryKey)) {
          countryGroups.set(countryKey, []);
          countryCoordinates.set(countryKey, { lat, lng });
        }
        countryGroups.get(countryKey)!.push(story);
      });
    }

    // Add location stats with coordinates for visualization
    if (locationStats && locationStats.length > 0) {
      const statsByCountry: Map<string, any[]> = new Map();

      locationStats
        .filter(
          (stat: any) =>
            stat.coordinates?.lat &&
            stat.coordinates.lng &&
            stat.country !== "Unknown" &&
            stat.country !== "Multiple European Countries" &&
            stat.country !== "Multiple Countries",
        )
        .forEach((stat: any) => {
          const countryKey = stat.country;
          if (!statsByCountry.has(countryKey)) {
            statsByCountry.set(countryKey, []);
          }
          statsByCountry.get(countryKey)!.push(stat);
        });

      // Process location stats for countries
      statsByCountry.forEach((stats, countryKey) => {
        const totalScamsFromStats = stats.reduce((sum, stat) => sum + (stat.totalScams || 0), 0);
        const primaryStat = stats[0];

        if (!countryGroups.has(countryKey)) {
          // Create synthetic story for location stats
          const syntheticStory = {
            _id: `stat_${countryKey}`,
            country: countryKey,
            city: stats
              .map((s) => s.city)
              .filter((c) => c && c !== "Unknown")
              .join(", "),
            coordinates: primaryStat.coordinates,
            scamType: primaryStat.topScamTypes?.[0]?.type || "other",
            scamMethods: primaryStat.topScamTypes?.map((t: any) => t.type) || [],
            title: `${totalScamsFromStats} scams reported`,
            summary: `${totalScamsFromStats} scams from comment reports across ${stats.length} locations`,
            isFromStats: true,
            totalScams: totalScamsFromStats,
            topScamTypes: primaryStat.topScamTypes,
            averageLoss: primaryStat.averageLoss,
            postDate: Date.now(),
          };
          countryGroups.set(countryKey, [syntheticStory]);
          countryCoordinates.set(countryKey, primaryStat.coordinates);
        } else {
          // Add additional scams to existing country group
          const existingStories = countryGroups.get(countryKey)!;
          const existingStoryCount = existingStories.filter((s) => !s.isFromStats).length;
          const additionalFromComments = Math.max(0, totalScamsFromStats - existingStoryCount);
          if (additionalFromComments > 0) {
            existingStories[0].additionalScams = (existingStories[0].additionalScams || 0) + additionalFromComments;
          }
        }
      });
    }

    // Create map points for visualization
    const mappedPoints: ScamPoint[] = [];
    let totalVisualizationReports = 0;

    countryGroups.forEach((stories, countryKey) => {
      const coordinates = countryCoordinates.get(countryKey);
      if (!coordinates) return;

      const { lat, lng } = coordinates;

      // Calculate total reports for this COUNTRY (for visualization)
      const totalReports = stories.reduce((sum, story) => {
        if (story.isFromStats && story.totalScams) {
          return sum + story.totalScams;
        } else {
          return sum + 1 + (story.additionalScams || 0);
        }
      }, 0);

      totalVisualizationReports += totalReports;

      // Calculate risk based on multiple factors
      const calculateRisk = () => {
        let riskScore = 0.3; // Base risk
        if (totalReports >= 10) riskScore = 0.8;
        else if (totalReports >= 5) riskScore = 0.7;
        else if (totalReports >= 3) riskScore = 0.6;
        else if (totalReports >= 2) riskScore = 0.5;
        else riskScore = 0.4;
        return Math.min(1, Math.max(0.1, riskScore));
      };

      // Collect scam types and other data
      const allScamTypes = [...new Set(stories.flatMap((s) => s.scamMethods || [s.scamType]))];
      const countryNames = [
        "United States",
        "United Kingdom",
        "Germany",
        "France",
        "Italy",
        "Spain",
        "Canada",
        "Australia",
        "Japan",
        "China",
        "India",
        "Brazil",
        "Mexico",
        "Netherlands",
        "Belgium",
        "Switzerland",
        "Austria",
        "Poland",
        "Russia",
        "Unknown",
        "Multiple European Countries",
      ];
      const cities = [...new Set(stories.map((s) => s.city).filter((c) => c && c !== "Unknown" && !countryNames.includes(c)))];
      const cityDisplay = cities.length > 0 ? cities.slice(0, 3).join(", ") : `Various locations in ${countryKey}`;
      const allStoryIds = stories.filter((s) => !s.isFromStats).map((s) => s._id);
      const risk = calculateRisk();

      mappedPoints.push({
        id: `country_${countryKey}`,
        lat,
        lng,
        location: countryKey,
        country: countryKey,
        risk,
        reports: totalReports, // This will be summed for "Reports" stat
        types: allScamTypes,
        lastReport: new Date(Math.max(...stories.map((s) => new Date(s.postDate).getTime()))).toISOString(),
        title: `${totalReports} scams in ${countryKey}`,
        summary:
          cities.length > 0
            ? `Reports from: ${cityDisplay}${cities.length > 3 ? ` and ${cities.length - 3} more cities` : ""}`
            : `${totalReports} scam reports from ${countryKey}`,
        scamType: stories[0].scamType,
        moneyLost: stories.reduce((sum, s) => sum + (s.moneyLost || 0), 0),
        currency: stories[0].currency,
        redditUrl: stories[0].redditUrl,
        warningSignals: [...new Set(stories.flatMap((s) => s.warningSignals || []))],
        preventionTips: [...new Set(stories.flatMap((s) => s.preventionTips || []))],
        storyIds: allStoryIds,
        stories: stories.filter((s) => !s.isFromStats),
      });
    });

    // Calculate high risk count from points (countries with coordinates that have high risk)
    const highRiskCountries = mappedPoints.filter((p) => p.risk >= 0.6).length;

    return {
      points: mappedPoints,
      highRiskCount: highRiskCountries,
      totalReportsFromVisualization: totalVisualizationReports,
    };
  }, [scamStories, isAuthenticated, locationStats]);
  const [selected, setSelected] = useState<ScamPoint | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [windowSize, setWindowSize] = useState(() => {
    if (typeof window !== "undefined") {
      // Subtract status bar height (approx 48px for p-3 + borders)
      return { width: window.innerWidth * (2 / 3), height: window.innerHeight - 48 };
    }
    return { width: 800, height: 600 };
  });

  // Only show points if authenticated
  const filtered = useMemo(() => {
    if (!isAuthenticated) return [];
    return points.filter((p) => p.risk >= riskFilter);
  }, [points, riskFilter, isAuthenticated]);

  // Use ref to always get latest points (avoid stale closure)
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
    console.log("📍 Points updated in ref:", points.length);
  }, [points]);

  // Memoized callback for location query to avoid stale closure
  const handleLocationQuery = useCallback(
    (country: string) => {
      const currentPoints = pointsRef.current;
      console.log("🔍 handleLocationQuery called with:", country, "Points count:", currentPoints.length);

      // KEY = what database has, VALUES = what user might say
      const countryAliases: Record<string, string[]> = {
        // Database has "Türkiye", user says "Turkey"
        Türkiye: ["Turkey", "Turkiye"],
        "People's Republic of China": ["China", "PRC"],
        "Czech Republic": ["Czechia"],
        "North Macedonia": ["Macedonia", "FYROM"],
        "United States": ["USA", "US", "America"],
        "United Kingdom": ["UK", "Britain", "England"],
        "United Arab Emirates": ["UAE", "Emirates"],
        "South Korea": ["Korea", "ROK"],
        "Dominican Republic": ["DR", "Dominican Rep"],
        "New Zealand": ["NZ"],
        "South Africa": ["RSA"],
        "Saudi Arabia": ["KSA"],
        "Papua New Guinea": ["PNG"],
        "Solomon Islands": ["Solomons"],
        "The Gambia": ["Gambia"],
        "Sri Lanka": ["Ceylon"],
        Myanmar: ["Burma"],
        Vietnam: ["Viet Nam"],
        "Hong Kong": ["HK"],
        Netherlands: ["Holland"],
        Switzerland: ["Swiss"],
        Germany: ["Deutschland"],
        Greece: ["Hellas"],
        Russia: ["Russian Federation"],
        Egypt: ["Misr"],
        Japan: ["Nippon"],
        India: ["Bharat"],
        Thailand: ["Siam"],
        Cambodia: ["Kampuchea"],
        Laos: ["Lao"],
        Philippines: ["Pilipinas"],
        Indonesia: ["ID"],
        Malaysia: ["MY"],
        Singapore: ["SG"],
        Australia: ["Oz"],
        Brazil: ["Brasil"],
        Mexico: ["MX"],
        Spain: ["ES"],
        France: ["FR"],
        Italy: ["IT"],
        Portugal: ["PT"],
        Austria: ["AT"],
        Belgium: ["BE"],
        Poland: ["PL"],
        Ukraine: ["UA"],
        Romania: ["RO"],
        Hungary: ["HU"],
        Sweden: ["SE"],
        Norway: ["NO"],
        Ireland: ["IE"],
        Croatia: ["HR"],
        Serbia: ["RS"],
        Montenegro: ["ME"],
        Albania: ["AL"],
        Lithuania: ["LT"],
        Slovakia: ["SK"],
        Morocco: ["MA"],
        Tunisia: ["TN"],
        Ghana: ["GH"],
        Nigeria: ["NG"],
        Ethiopia: ["ET"],
        Uganda: ["UG"],
        Rwanda: ["RW"],
        Zimbabwe: ["ZW"],
        Pakistan: ["PK"],
        Jordan: ["JO"],
        Oman: ["OM"],
        Qatar: ["QA"],
        Syria: ["SY"],
        Georgia: ["GE"],
        Azerbaijan: ["AZ"],
        Kazakhstan: ["KZ"],
        Peru: ["PE"],
        Chile: ["CL"],
        Colombia: ["CO"],
        Ecuador: ["EC"],
        Paraguay: ["PY"],
        Panama: ["PA"],
        Guatemala: ["GT"],
        Nicaragua: ["NI"],
        "El Salvador": ["SV"],
        Haiti: ["HT"],
        Cuba: ["CU"],
        Jamaica: ["JM"],
        Iceland: ["IS"],
        Malta: ["MT"],
        Cyprus: ["CY"],
      };

      // Function to find country by aliases
      const findCountryWithAliases = (searchCountry: string) => {
        // Try direct matches first
        let point = currentPoints.find((p) => p.country === searchCountry);
        if (point) return point;

        // Try case-insensitive
        point = currentPoints.find((p) => p.country.toLowerCase() === searchCountry.toLowerCase());
        if (point) return point;

        // Try aliases
        for (const [realCountry, aliases] of Object.entries(countryAliases)) {
          if (aliases.some((alias) => alias.toLowerCase() === searchCountry.toLowerCase())) {
            point = currentPoints.find((p) => p.country === realCountry);
            if (point) return point;
          }
        }

        // Try partial match
        point = currentPoints.find(
          (p) =>
            p.country.toLowerCase().includes(searchCountry.toLowerCase()) ||
            searchCountry.toLowerCase().includes(p.country.toLowerCase()),
        );

        return point;
      };

      const point = findCountryWithAliases(country);

      console.log("🎯 VAPI Location Query:", {
        requestedCountry: country,
        foundPoint: point ? point.country : "NOT FOUND",
        hasData: !!point,
        reports: point?.reports,
      });

      if (point && globeRef.current) {
        setSelected(point);
        setShowDetail(true);
        setSelectedStoryId(null);
        setLastVapiCountry(point.country);

        // Stop rotation and highlight
        const controls = globeRef.current.controls();
        if (controls) {
          controls.autoRotate = false;
        }

        setVoiceHighlightedCountry(point.country);
        console.log("🔵 Highlighting country:", point.country);
        console.log("🗺️ GeoJSON mapping check:", {
          dbCountry: point.country,
          geoJsonEquivalent:
            Object.entries(geoJsonToDbCountryMap).find(([_geo, db]) => db === point.country)?.[0] || point.country,
        });

        // Focus globe
        globeRef.current.pointOfView(
          {
            lat: point.lat,
            lng: point.lng,
            altitude: 1.2,
          },
          1200,
        );
      } else {
        setShowDetail(false);
        setSelected(null);
        setVoiceHighlightedCountry(null);
        console.warn("❌ App: Could not find point for country:", country);
        console.warn("📊 App: Available countries:", currentPoints.map((p) => p.country).sort());
      }
    },
    [globeRef, setSelected, setShowDetail, setSelectedStoryId, setLastVapiCountry, setVoiceHighlightedCountry],
  );

  // Authentication handlers
  const handleSendMagicLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedEmail = email.trim().toLowerCase();
      if (!isEmail(trimmedEmail)) {
        setError("Please enter a valid email address");
        return;
      }

      setIsLoading(true);
      setError(null);
      setSuccess(false);
      const formData = new FormData();
      formData.set("email", trimmedEmail);

      try {
        await signIn("resend-magic-link", formData);
        setSuccess(true);
        setShowSuccessModal(true);
        setEmail("");
        setTimeout(() => {
          setSuccess(false);
          setShowSuccessModal(false);
        }, 7000);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof ConvexError
            ? (error.data as { message: string }).message || "Failed to send magic link"
            : "Failed to send magic link";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [email, signIn],
  );

  const handleGoogleLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("google", { redirectTo: "/" });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof ConvexError
          ? (error.data as { message: string }).message || "Failed to sign in with Google"
          : "Failed to sign in with Google";
      setError(errorMessage);
      setIsLoading(false);
    }
  }, [signIn]);

  const handleGitHubLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("github", { redirectTo: "/" });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof ConvexError
          ? (error.data as { message: string }).message || "Failed to sign in with GitHub"
          : "Failed to sign in with GitHub";
      setError(errorMessage);
      setIsLoading(false);
    }
  }, [signIn]);

  // Fetch country borders
  useEffect(() => {
    fetch("https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson")
      .then((res) => res.json())
      .then((countries) => {
        setCountries(countries.features);
      })
      .catch((err) => console.error("Failed to load countries:", err));
  }, []);

  useEffect(() => {
    // Wait for globe to be ready before setting controls
    if (!globeReady || !globeRef.current) return;

    const controls = globeRef.current.controls();
    if (controls) {
      controls.autoRotate = true; // Always keep auto-rotate enabled
      controls.autoRotateSpeed = 0.2; // Slower rotation speed
      controls.enableZoom = false; // Disable zoom
      controls.minDistance = 280; // Further distance for smaller globe
      controls.maxDistance = 280; // Fixed distance (no zoom)
      // Keep rotating even when interacting
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.rotateSpeed = 0.5;
    }

    // Set initial camera position
    const globe = globeRef.current;
    if (globe) {
      // Set initial point of view
      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

      // Update controls
      const ctrl = globe.controls?.();
      ctrl?.update?.();

      // Set renderer pixel ratio for better quality
      const renderer = globe.renderer?.();
      if (renderer) {
        renderer.setPixelRatio(window.devicePixelRatio || 1);
      }
    }
  }, [globeReady]);

  // Globe auto-rotation is now always enabled - no need to monitor voice state

  // Globe auto-rotation is now always enabled - no need to monitor voice state periodically

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") {
        setWindowSize({
          width: window.innerWidth * (2 / 3),
          height: window.innerHeight - 48, // Account for status bar height
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <MobileBlocker>
      <div className="flex h-screen overflow-hidden text-white" style={{ backgroundColor: "#1a1a1f" }}>
        {/* Left Column - Navigation & Content */}
        <div
          className="relative flex h-full w-1/3 flex-col border-r border-white/5"
          style={{
            background: "linear-gradient(180deg, #1a1a1f 0%, #16161b 100%)",
          }}
        >
          {/* Nav Header */}
          <div className="relative">
            <nav
              style={{
                backgroundColor: "rgba(25, 25, 30, 0.8)",
                backdropFilter: "blur(10px)",
              }}
            >
              {/* Logo and AI Assistant/Auth Section */}
              <div className="border-b border-white/5">
                <div className="flex">
                  {/* Logo - Fixed width matching UserMenu */}
                  <div className="flex items-center justify-center px-4" style={{ width: "120px", minHeight: "56px" }}>
                    <img src="/logo.png" alt="Travel Scam Alert" className="h-8 w-auto" />
                  </div>

                  {!isAuthLoading && isAuthenticated ? (
                    <>
                      {/* AI Assistant Button - Flex grow */}
                      {(() => {
                        const assistantDisabled = isVoiceActive || showEmailOffer;
                        const base = "flex flex-1 items-center justify-center gap-2 px-6 py-4 transition-all";
                        const cls = assistantDisabled
                          ? `${base} cursor-not-allowed border-white/5 bg-gray-600/10 opacity-50`
                          : `${base} cursor-pointer border-white/5 bg-gradient-to-r from-blue-600/10 to-purple-600/10 hover:from-blue-600/20 hover:to-purple-600/20`;
                        return (
                          <button
                            className={cls}
                            disabled={assistantDisabled}
                            onClick={() => {
                              if (assistantDisabled) return;
                              voiceAssistantRef.current?.toggleVoice();
                            }}
                          >
                            <span className="text-blue-400">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                            </span>
                            <span className="text-sm font-medium text-white/90">AI Assistant</span>
                          </button>
                        );
                      })()}

                      {/* User Menu - Quarter width */}
                      <div className="flex items-center justify-center px-4" style={{ width: "120px", minHeight: "56px" }}>
                        <UserMenu />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* AI Assistant Disabled - Flex grow */}
                      <div className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 bg-gray-600/10 px-6 py-4 opacity-50">
                        <span className="text-gray-400">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </span>
                        <span className="text-sm font-medium text-gray-400">AI Assistant (Sign In Required)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </nav>

            {/* Success Toast - Flush Design Below Navbar */}
            {showSuccessModal && (
              <div className="absolute right-0 bottom-0 left-0 z-10 w-full translate-y-full border-b border-white/5 bg-green-500/10">
                <div className="px-6 py-3 text-center">
                  <p className="text-sm font-medium text-green-400">Email sent! Check your inbox</p>
                </div>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="no-scrollbar relative flex flex-1 flex-col overflow-y-auto" style={{ backgroundColor: "transparent" }}>
            {/* Voice Assistant Interface - Only render if NOT loading */}
            {!isAuthLoading && (
              <VoiceAssistantIntegrated
                ref={voiceAssistantRef}
                isAuthenticated={isAuthenticated}
                pointsData={points}
                onLocationQuery={handleLocationQuery}
                onVoiceSessionEnd={() => {
                  setVoiceHighlightedCountry(null);
                  if (globeRef.current) {
                    const controls = globeRef.current.controls();
                    if (controls) {
                      controls.autoRotate = true;
                    }
                  }
                  // Prefer the last voice-detected country, fallback to currently selected country on the map
                  const fallbackCountry = lastVapiCountry || selected?.country || null;
                  if (fallbackCountry && isAuthenticated) {
                    setLastVapiCountry(fallbackCountry);
                    setShowEmailOffer(true);
                  }
                }}
                onSessionActiveChange={(active) => setIsVoiceActive(active)}
              />
            )}

            {/* Offer to email prevention tips at voice session end */}
            {showEmailOffer && lastVapiCountry && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="w-full border-y border-white/10 bg-gradient-to-r from-blue-600/20 to-purple-600/20 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
                  <div className="px-5 py-5">
                    <h3 className="text-center text-xl font-light break-words whitespace-normal text-white/90">
                      Send Prevention Tips For {lastVapiCountry}?
                    </h3>
                    <p className="mt-2 text-center text-sm text-white/70">
                      We’ll email a concise list of safety tips based on user reports to help you stay safe.
                    </p>

                    {emailSendError && (
                      <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 p-2 text-center text-sm text-red-300">
                        {emailSendError}
                      </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShowEmailOffer(false)}
                        className="cursor-pointer rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                      >
                        No, Thanks
                      </button>
                      <button
                        onClick={handleSendTipsEmail}
                        disabled={isSendingOffer || offerSentSuccess}
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all duration-300 disabled:opacity-60 ${offerSentSuccess ? "bg-green-600" : "bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90"}`}
                      >
                        {isSendingOffer && (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            ></path>
                          </svg>
                        )}
                        <span className="animate-fadeIn">
                          {offerSentSuccess ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : isSendingOffer ? (
                            "Sending..."
                          ) : (
                            "Send Now"
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isAuthLoading ? (
              // Show loading state while checking authentication
              <div className="flex flex-1 items-center justify-center">
                <div className="text-white/40">
                  <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </div>
              </div>
            ) : !isAuthenticated ? (
              <div className="flex flex-1 flex-col" style={{ backgroundColor: "transparent" }}>
                {/* Sign-in Form - Centered */}
                <div className="flex flex-1 items-center justify-center px-6 py-6" style={{ backgroundColor: "transparent" }}>
                  <div className="w-full max-w-xs space-y-4" style={{ backgroundColor: "transparent" }}>
                    <div className="text-center" style={{ backgroundColor: "transparent" }}>
                      <h3 className="text-xl font-light text-white/90">Welcome Back</h3>
                      <p className="mt-2 text-sm text-white/50">Everyone Should Be Safe Everywhere</p>
                    </div>

                    {/* OAuth Buttons */}
                    <div className="space-y-2" style={{ backgroundColor: "transparent" }}>
                      <button
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="flex w-full cursor-pointer items-center justify-center gap-3 border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                        Continue with Google
                      </button>

                      <button
                        onClick={handleGitHubLogin}
                        disabled={isLoading}
                        className="flex w-full cursor-pointer items-center justify-center gap-3 border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        Continue with GitHub
                      </button>
                    </div>

                    {/* Divider */}
                    <div className="relative py-3" style={{ backgroundColor: "transparent" }}>
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span
                          className="px-2 text-white/40"
                          style={{ background: "linear-gradient(90deg, #18181d 0%, #18181d 100%)" }}
                        >
                          OR
                        </span>
                      </div>
                    </div>

                    {/* Email Form */}
                    <form onSubmit={handleSendMagicLink} className="space-y-3">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        disabled={isLoading}
                        className="w-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !isEmail(email.trim())}
                        className="w-full cursor-pointer bg-white px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? "Sending..." : "Continue with Email"}
                      </button>
                    </form>

                    {/* Error Message */}
                    {error && (
                      <div className="border border-red-500/20 bg-red-500/10 p-3">
                        <p className="text-sm text-red-400">{error}</p>
                      </div>
                    )}

                    {/* Legal Links */}
                    <div className="text-center">
                      <p className="text-xs text-white/40">
                        By signing in, you agree to our{" "}
                        <a href="/terms" className="cursor-pointer underline hover:text-white/60">
                          Terms of Service
                        </a>{" "}
                        and{" "}
                        <a href="/privacy" className="cursor-pointer underline hover:text-white/60">
                          Privacy Policy
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Authenticated Content - Show selected story details */
              <div className="no-scrollbar flex-1 overflow-y-auto">
                {selectedStoryDetails ? (
                  <div className="space-y-6 p-6">
                    {/* Story Header */}
                    <div className="border-b border-white/10 pb-4">
                      <div className="flex items-start justify-between">
                        <h2 className="mb-2 flex-1 pr-4 text-xl font-light text-white/90">{selectedStoryDetails.title}</h2>
                        <button
                          onClick={() => {
                            setSelectedStoryId(null);
                            setSelected(null);
                            setShowDetail(false);
                          }}
                          className="text-white/40 transition-colors hover:text-white/60"
                          aria-label="Close story"
                        >
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-white/60">
                        <span className="flex items-center gap-1">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {selectedStoryDetails.city
                            ? `${selectedStoryDetails.city}, ${selectedStoryDetails.country}`
                            : selectedStoryDetails.country}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          {new Date(selectedStoryDetails.postDate).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          u/{selectedStoryDetails.authorUsername}
                        </span>
                      </div>
                    </div>

                    {/* Scam Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded bg-white/5 p-4">
                        <p className="mb-1 text-xs tracking-wider text-white/40 uppercase">Scam Type</p>
                        <p className="text-white/90 capitalize">{selectedStoryDetails.scamType?.replace(/_/g, " ")}</p>
                      </div>
                      {selectedStoryDetails.moneyLost && (
                        <div className="rounded bg-white/5 p-4">
                          <p className="mb-1 text-xs tracking-wider text-white/40 uppercase">Money Lost</p>
                          <p className="text-red-400">
                            {selectedStoryDetails.currency} {selectedStoryDetails.moneyLost}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* AI Summary */}
                    <div className="rounded border border-white/10 bg-gradient-to-r from-blue-500/5 to-purple-500/5 p-4">
                      <p className="mb-3 flex items-center gap-2 text-xs tracking-wider text-blue-400 uppercase">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        AI Analysis Summary
                      </p>
                      <div className="leading-relaxed text-white/80">
                        {selectedStoryDetails.summary || "AI analysis not available for this story"}
                      </div>
                    </div>

                    {/* Warning Signals & Prevention Tips */}
                    {(selectedStoryDetails.warningSignals?.length > 0 || selectedStoryDetails.preventionTips?.length > 0) && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {selectedStoryDetails.warningSignals?.length > 0 && (
                          <div className="rounded border border-red-500/20 bg-red-500/10 p-4">
                            <p className="mb-3 text-xs tracking-wider text-red-400 uppercase">Warning Signals</p>
                            <ul className="space-y-2">
                              {selectedStoryDetails.warningSignals.map((signal, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                  <svg
                                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  {signal}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selectedStoryDetails.preventionTips?.length > 0 && (
                          <div className="rounded border border-green-500/20 bg-green-500/10 p-4">
                            <p className="mb-3 text-xs tracking-wider text-green-400 uppercase">Prevention Tips</p>
                            <ul className="space-y-2">
                              {selectedStoryDetails.preventionTips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                  <svg
                                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  {tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Community Insights */}
                    {selectedStoryDetails.comments && selectedStoryDetails.comments.length > 0 && (
                      <div className="rounded bg-white/5 p-4">
                        <p className="mb-3 text-xs tracking-wider text-white/40 uppercase">Community Insights</p>
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-2xl font-light text-white/80">{selectedStoryDetails.comments.length}</p>
                            <p className="text-xs text-white/50">Comments</p>
                          </div>
                          <div>
                            <p className="text-2xl font-light text-green-400">
                              {selectedStoryDetails.comments.filter((c: any) => c.isHelpful).length}
                            </p>
                            <p className="text-xs text-white/50">Helpful</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : selectedStoryId ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-white/40">
                      <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  </div>
                ) : selected ? (
                  /* Show all stories for the selected country */
                  <div className="no-scrollbar space-y-4 overflow-y-auto p-4">
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-4">
                          <h2 className="mb-2 text-xl font-medium text-white">
                            {selected.reports} Scams in {selected.country}
                          </h2>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                            <span className="flex items-center gap-2">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {selected.location === selected.country
                                ? selected.country
                                : `${selected.location}, ${selected.country}`}
                            </span>
                            <span className="flex items-center gap-2">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                              </svg>
                              Total: {selected.reports} {selected.reports === 1 ? "report" : "reports"}
                            </span>
                            {selected.lastReport && (
                              <span className="flex items-center gap-2">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                Last: {new Date(selected.lastReport).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedStoryId(null);
                            setSelected(null);
                            setShowDetail(false);
                          }}
                          className="p-2 text-white/40 transition-colors hover:text-white/70"
                          aria-label="Close"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-white/5 p-4">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-white/50 uppercase">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Summary
                      </p>
                      <p className="text-sm leading-relaxed text-white/90">
                        {selected.summary || `Multiple scam reports from various cities in ${selected.country}`}
                      </p>
                    </div>

                    {/* Stats - 2x2 grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-500/10 p-4 transition-colors hover:bg-red-500/15">
                        <p className="mb-1 text-xs font-semibold tracking-wider text-white/50 uppercase">Risk Level</p>
                        <p className="text-2xl font-semibold" style={{ color: riskColor(selected.risk) }}>
                          {(selected.risk * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div className="bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15">
                        <p className="mb-1 text-xs font-semibold tracking-wider text-white/50 uppercase">Total Loss</p>
                        <p className="text-2xl font-semibold text-amber-400">
                          {selected.moneyLost ? `${selected.currency || "$"}${selected.moneyLost}` : "N/A"}
                        </p>
                      </div>
                      <div className="bg-blue-500/10 p-4 transition-colors hover:bg-blue-500/15">
                        <p className="mb-1 text-xs font-semibold tracking-wider text-white/50 uppercase">Reports</p>
                        <p className="text-2xl font-semibold text-blue-400">{selected.reports}</p>
                      </div>
                      <div className="bg-purple-500/10 p-4 transition-colors hover:bg-purple-500/15">
                        <p className="mb-1 text-xs font-semibold tracking-wider text-white/50 uppercase">Scam Types</p>
                        <p className="text-2xl font-semibold text-purple-400">{selected.types ? selected.types.length : 0}</p>
                      </div>
                    </div>

                    {/* Scam Types */}
                    <div className="bg-white/5 p-4">
                      <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-white/50 uppercase">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        Common Scam Types in {selected.country}
                      </p>
                      <div className="space-y-2">
                        {selected.types && selected.types.length > 0 ? (
                          selected.types.slice(0, 5).map((type: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 bg-red-500/10 px-3 py-2 text-sm text-white/80">
                              <div className="h-2 w-2 rounded-full bg-red-400"></div>
                              <span className="capitalize">{type.replace(/_/g, " ")}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-white/50">No scam type data available</p>
                        )}
                      </div>
                    </div>

                    {/* AI Summary for each story */}
                    {selected.stories && selected.stories.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                          <div className="bg-blue-500 p-2">
                            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          AI Analysis Summary
                        </h3>
                        <div className="scams-list max-h-[500px] space-y-4 overflow-y-auto pr-2">
                          {selected.stories.map((story: any, idx: number) => (
                            <div key={story._id || idx} className="bg-white/5 p-4 transition-colors hover:bg-white/[0.07]">
                              {/* Header */}
                              <div className="mb-3 flex items-start justify-between">
                                <div>
                                  <h4 className="text-base font-semibold text-white">
                                    {story.city && story.city !== "Unknown" ? story.city : `Location ${idx + 1}`}
                                  </h4>
                                  <p className="mt-1 text-xs text-white/50">
                                    {story.postDate ? new Date(story.postDate).toLocaleDateString() : ""}
                                  </p>
                                </div>
                                <span className="bg-red-500/20 px-4 py-1.5 text-xs font-semibold text-red-400">
                                  {story.scamType?.replace(/_/g, " ") || "unknown"}
                                </span>
                              </div>

                              {/* AI Summary */}
                              {story.summary && (
                                <div className="mb-3 bg-white/[0.03] p-3">
                                  <p className="text-sm leading-relaxed text-white/90">{story.summary}</p>
                                </div>
                              )}

                              {/* Warning Signals */}
                              {story.warningSignals && story.warningSignals.length > 0 && (
                                <div className="mb-3">
                                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-400">
                                    <span className="text-base">⚠️</span> Warning Signals
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {story.warningSignals.slice(0, 3).map((signal: string, i: number) => (
                                      <span key={i} className="bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300">
                                        {signal}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Prevention Tips */}
                              {story.preventionTips && story.preventionTips.length > 0 && (
                                <div className="mb-3">
                                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-green-400">
                                    <span className="text-base">✅</span> Prevention Tips
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {story.preventionTips.slice(0, 3).map((tip: string, i: number) => (
                                      <span key={i} className="bg-green-500/15 px-2 py-1 text-xs font-medium text-green-300">
                                        {tip}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Footer Stats */}
                              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                                <div className="flex gap-4 text-xs font-medium">
                                  {story.moneyLost && (
                                    <span className="flex items-center gap-1.5 text-amber-400">
                                      💸 {story.currency || "$"}
                                      {story.moneyLost}
                                    </span>
                                  )}
                                  {story.aiConfidenceScore && (
                                    <span className="flex items-center gap-1.5 text-blue-400">
                                      🤖 {(story.aiConfidenceScore * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-white/40">
                                  {story.authorUsername ? `u/${story.authorUsername}` : "anonymous"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Info Note for comment scams only */}
                    {(!selected.stories || selected.stories.length === 0) && (
                      <div className="bg-blue-500/10 p-4">
                        <div className="flex gap-3">
                          <span className="text-xl">ℹ️</span>
                          <div>
                            <p className="mb-1 font-semibold text-blue-400">Note</p>
                            <p className="text-sm leading-relaxed text-white/80">
                              This location has scam reports found in comments. These are additional scam stories shared by users
                              in comment sections that weren't posted as main stories.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-white/40">
                    <div className="text-center">
                      <svg className="mx-auto mb-4 h-16 w-16 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-lg font-light">Click a Pinpoint on the Globe</p>
                      <p className="text-lg font-light">OR</p>
                      <p className="text-lg font-light">Click AI Assistant</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div
            className="border-t border-white/5"
            style={{
              background: "linear-gradient(180deg, rgba(20, 20, 25, 0.3) 0%, rgba(15, 15, 20, 0.5) 100%)",
            }}
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-3">
              <div className="group relative overflow-hidden border-r border-white/5">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
                <div className="relative p-4 backdrop-blur-sm">
                  <p className="text-xs tracking-wider text-white/40 uppercase">Total Scams</p>
                  <p className="mt-1 text-xl font-extralight text-white/90">
                    {isAuthLoading || totalScamCount === undefined ? (
                      <span className="loading-dots" style={{ color: "#60a5fa" }}>
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    ) : (
                      totalScamCount
                    )}
                  </p>
                  <div className="absolute top-3 right-3">
                    <svg className="h-3 w-3 text-blue-400/30" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path
                        fillRule="evenodd"
                        d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="group relative overflow-hidden border-r border-white/5">
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
                <div className="relative p-4 backdrop-blur-sm">
                  <p className="text-xs tracking-wider text-white/40 uppercase">High Risk</p>
                  <p className="mt-1 text-xl font-extralight text-red-400">
                    {isAuthLoading || !scamStories ? (
                      <span className="loading-dots" style={{ color: "#f87171" }}>
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    ) : (
                      highRiskCount
                    )}
                  </p>
                  <div className="absolute top-3 right-3">
                    <svg className="h-3 w-3 text-red-400/30" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-green-600/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
                <div className="relative p-4 backdrop-blur-sm">
                  <p className="text-xs tracking-wider text-white/40 uppercase">Reports</p>
                  <p className="mt-1 text-xl font-extralight text-green-400">
                    {isAuthLoading || !scamStories || !locationStats ? (
                      <span className="loading-dots" style={{ color: "#4ade80" }}>
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    ) : (
                      totalReportsFromVisualization || points.reduce((sum, p) => sum + p.reports, 0)
                    )}
                  </p>
                  <div className="absolute top-3 right-3">
                    <svg className="h-3 w-3 text-green-400/30" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Button - Only show when authenticated */}
            {!isAuthLoading && isAuthenticated ? (
              <button
                onClick={() => setRiskFilter(riskFilter === 0 ? 0.6 : 0)}
                className="group relative w-full cursor-pointer overflow-hidden border-t border-white/5 p-3 text-sm text-white/70 transition-all hover:bg-white/5 hover:text-white"
                style={{
                  background:
                    riskFilter > 0
                      ? "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)"
                      : "rgba(255, 255, 255, 0.02)",
                }}
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 group-hover:translate-x-full"></div>
                <div className="relative flex items-center justify-center gap-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                  <span>{riskFilter > 0 ? "Show All Locations" : "High Risk Only"}</span>
                </div>
              </button>
            ) : (
              <div className="border-t border-white/5 p-3 text-center text-sm text-white/40">Sign in to access filters</div>
            )}
          </div>
        </div>

        {/* Right Column - Globe */}
        <div className="relative flex h-full w-2/3 flex-col" style={{ backgroundColor: "#15151a" }}>
          <section ref={heroRef} className="relative flex-1 overflow-hidden" style={{ backgroundColor: "#15151a" }}>
            {/* Data Loading Overlay - Show when queries are loading */}
            {(scamStories === undefined || locationStats === undefined || totalScamCount === undefined) && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
                <p className="animate-pulse text-lg font-light tracking-widest text-white/90 uppercase">Loading Data</p>
              </div>
            )}

            {/* Globe Container - Adjusted to not overlap status bar */}
            <div className="absolute inset-0" style={{ backgroundColor: "#15151a" }}>
              <div ref={globeContainerRef} className="h-full w-full" style={{ backgroundColor: "#15151a" }}>
                <Suspense
                  fallback={
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        backgroundColor: "#15151a",
                      }}
                    >
                      <div className="relative">
                        {/* Core */}
                        <div className="flex h-32 w-32 flex-col items-center justify-center space-y-2">
                          <p className="animate-ping text-xs font-light tracking-widest text-white/40">INITIALIZING</p>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <div
                    className={`globe-container absolute inset-0 ${globeReady ? "loaded" : ""}`}
                    style={{ backgroundColor: "#15151a" }}
                  >
                    <Globe
                      ref={globeRef}
                      width={windowSize.width}
                      height={windowSize.height}
                      backgroundColor="#15151a"
                      globeImageUrl="https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-dark.jpg"
                      showAtmosphere={false} // Disable atmosphere for better performance
                      atmosphereColor="#3b82f6"
                      atmosphereAltitude={0.15}
                      enablePointerInteraction={true}
                      // Hexed polygons layer - with voice highlighting
                      hexPolygonsData={countries}
                      hexPolygonResolution={3} // Reduced resolution for performance
                      hexPolygonMargin={0.2} // Increased margin to reduce overlap calculations
                      hexPolygonsTransitionDuration={0} // No transition for better performance
                      hexPolygonColor={(d: any) => {
                        // Get the database country name from the GeoJSON name
                        const geoJsonName = d.properties?.NAME;
                        const dbCountryName = geoJsonToDbCountryMap[geoJsonName] || geoJsonName;

                        // Debug logging for Türkiye specifically
                        if (
                          voiceHighlightedCountry === "Türkiye" &&
                          (geoJsonName.includes("Turkey") || dbCountryName.includes("Türkiye"))
                        ) {
                          console.log("🔍 Turkey polygon check:", {
                            geoJsonName,
                            dbCountryName,
                            voiceHighlightedCountry,
                            match: dbCountryName === voiceHighlightedCountry,
                          });
                        }

                        // Highlight the voice-selected country
                        if (voiceHighlightedCountry && dbCountryName === voiceHighlightedCountry) {
                          console.log("✅ HIGHLIGHTING polygon:", dbCountryName);
                          return "#3b82f6"; // Bright blue for highlighted country
                        }

                        // Dim other countries when one is highlighted
                        if (voiceHighlightedCountry) {
                          return "#1f2937"; // Dark gray for non-highlighted countries
                        }

                        // Default deterministic colors when no highlighting
                        const colorMap = countryColorMapRef.current;
                        if (!colorMap[dbCountryName]) {
                          colorMap[dbCountryName] = `#${Math.round(Math.random() * 2 ** 24)
                            .toString(16)
                            .padStart(6, "0")}`;
                        }
                        return colorMap[dbCountryName];
                      }}
                      hexPolygonAltitude={(d: any) => {
                        // Get the database country name from the GeoJSON name
                        const geoJsonName = d.properties?.NAME;
                        const dbCountryName = geoJsonToDbCountryMap[geoJsonName] || geoJsonName;

                        // Raise the highlighted country
                        if (voiceHighlightedCountry && dbCountryName === voiceHighlightedCountry) {
                          return 0.05; // Elevated for highlighted country
                        }

                        return 0.01; // Default altitude
                      }}
                      hexPolygonLabel={(d: any) => {
                        // Get the database country name from the GeoJSON name
                        const geoJsonName = d.properties?.NAME;
                        const dbCountryName = geoJsonToDbCountryMap[geoJsonName] || geoJsonName;

                        // Count TOTAL scam reports for this country (sum of all reports from all locations)
                        // Use the database country name to match our data
                        const countryPoints = points.filter((p) => p.country === dbCountryName);
                        const totalScamReports = countryPoints.reduce((sum, p) => sum + p.reports, 0);
                        const locationCount = countryPoints.length;
                        return `
												<div style="background: rgba(0,0,0,0.9); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">
													<b style="color: white; font-size: 14px;">${geoJsonName || ""}</b> <br />
													<span style="color: #9ca3af; font-size: 12px;">Total Scams: <i style="color: ${totalScamReports > 0 ? "#ef4444" : "#10b981"}">${totalScamReports}</i></span><br/>
													${locationCount > 0 ? `<span style="color: #9ca3af; font-size: 11px;">${locationCount} location${locationCount > 1 ? "s" : ""}</span>` : ""}
												</div>
											`;
                      }}
                      // Points layer for blinking markers
                      pointsData={filtered}
                      pointLat={(d: any) => d.lat}
                      pointLng={(d: any) => d.lng}
                      pointColor={(d: any) => riskColor(d.risk)}
                      pointRadius={(d: any) => {
                        // Simplified radius calculation for better performance
                        return 0.4 + Math.min(0.4, d.reports / 500);
                      }}
                      pointAltitude={0.02} // Slightly increased altitude for better visibility
                      pointsTransitionDuration={0}
                      // Rings layer for pulse effect
                      ringsData={filtered}
                      ringLat={(d: any) => d.lat}
                      ringLng={(d: any) => d.lng}
                      ringColor={(d: any) => riskColor(d.risk)}
                      ringMaxRadius={3}
                      ringPropagationSpeed={1}
                      ringRepeatPeriod={2000}
                      ringAltitude={0.015}
                      onPointClick={(point: any) => {
                        setSelected(point);
                        setShowDetail(true);

                        // Clear selectedStoryId since we're showing country summary
                        setSelectedStoryId(null);

                        // We don't load individual stories anymore, just show the summary
                        // The point already contains all the data we need
                      }}
                      onPointHover={(point: any) => {
                        document.body.style.cursor = point ? "pointer" : "auto";
                        const controls = globeRef.current?.controls?.();
                        if (controls) {
                          if (point) {
                            controls.autoRotate = false;
                          } else if (!voiceHighlightedCountry) {
                            controls.autoRotate = true;
                          }
                        }
                      }}
                      pointLabel={(d: any) => `
								<div style="background: rgba(0,0,0,0.9); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">
									<strong style="color: white; font-size: 13px;">${d.location === d.country ? d.country : `${d.location}, ${d.country}`}</strong><br/>
									<span style="color: #9ca3af; font-size: 11px;">Risk: ${(d.risk * 100).toFixed(0)}%</span><br/>
									<span style="color: #9ca3af; font-size: 11px;">Reports: ${d.reports}</span>
								</div>
							`}
                      onGlobeReady={() => {
                        setGlobeReady(true);
                        // Force visibility after a small delay to ensure smooth transition
                        setTimeout(() => {
                          const container = document.querySelector(".globe-container");
                          if (container) container.classList.add("loaded");
                        }, 100);
                      }}
                    />
                  </div>
                </Suspense>
              </div>
            </div>

            {/* Region Detail Modal */}
            {showDetail && selected && (
              <div
                className="pointer-events-auto absolute top-4 right-4 z-30 w-80 overflow-hidden border border-white/10 backdrop-blur-md"
                style={{
                  animation: "fadeIn 0.3s ease-out",
                  backgroundColor: "rgba(25, 25, 30, 0.95)",
                  backdropFilter: "blur(10px)",
                }}
              >
                {/* Header */}
                <div className="relative border-b border-white/10 bg-gradient-to-r from-blue-600/10 to-purple-600/10 p-4">
                  <button
                    onClick={() => {
                      setShowDetail(false);
                      setSelected(null);
                      setSelectedStoryId(null);
                    }}
                    className="absolute top-3 right-3 cursor-pointer text-white/40 transition-colors hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div>
                    <h3 className="text-lg font-light text-white/90">
                      {selected.location === selected.country ? selected.country : `${selected.location}, ${selected.country}`}
                    </h3>
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-3 p-4">
                  {/* Risk Level */}
                  <div className="flex items-center justify-between rounded border border-white/5 bg-white/5 p-3">
                    <span className="text-xs font-medium text-white/60">RISK LEVEL</span>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-white/10">
                        <div
                          style={{
                            width: `${selected.risk * 100}%`,
                            backgroundColor: riskColor(selected.risk),
                          }}
                          className="h-full transition-all duration-500"
                        />
                      </div>
                      <span className="font-mono text-sm font-medium" style={{ color: riskColor(selected.risk) }}>
                        {(selected.risk * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="flex flex-col justify-center rounded border border-white/5 bg-white/5 p-3 text-center"
                      style={{ minHeight: "70px" }}
                    >
                      <span className="text-xs tracking-wider text-white/40 uppercase">Reports</span>
                      <p className="text-md mt-1 font-light text-white/90">{selected.reports}</p>
                    </div>
                    <div
                      className="flex flex-col justify-center rounded border border-white/5 bg-white/5 p-3 text-center"
                      style={{ minHeight: "70px" }}
                    >
                      <span className="text-xs tracking-wider text-white/40 uppercase">Posted</span>
                      <p className="text-md mt-1 font-light text-white/90">{formatDate(selected.lastReport)}</p>
                    </div>
                  </div>

                  {/* Common Scams */}
                  <div className="rounded border border-white/5 bg-white/5 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <span className="text-xs font-medium tracking-wider text-white/60 uppercase">Common Scams</span>
                    </div>
                    <div className="scams-list space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "68px", minHeight: "68px" }}>
                      {selected.types.map((type, index) => (
                        <div
                          key={type}
                          className="flex items-center gap-1 rounded border-l-2 border-red-400/40 bg-gradient-to-r from-red-500/5 to-transparent px-3 py-1.5 text-xs text-white/70 transition-all hover:border-red-400/60 hover:from-red-500/10 hover:text-white/90"
                          style={{
                            animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`,
                          }}
                        >
                          <div className="h-1.5 w-1.5 rounded-full bg-red-400/60"></div>
                          {type
                            .replace(/_/g, " ") // Replace underscores with spaces
                            .split(" ")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(" ")}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Send email CTA */}
                  {!showEmailOffer && (
                    <div className="pt-1">
                      <button
                        onClick={() => handleSendTipsForCountry(selected.country)}
                        disabled={!isAuthenticated || isSendingRegion || regionSentSuccess}
                        aria-label={`Send Prevention Tips For ${selected.country}`}
                        className="group relative inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-gradient-to-r from-blue-600/60 via-indigo-600/60 to-purple-600/60 px-3 text-sm font-medium text-white shadow-[0_0_20px_rgba(99,102,241,0.15)] backdrop-blur transition-all hover:from-blue-500/70 hover:to-purple-500/70 hover:shadow-[0_0_30px_rgba(99,102,241,0.25)] focus:ring-2 focus:ring-blue-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSendingRegion && (
                          <svg className="h-4 w-4 animate-spin text-white/90" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            ></path>
                          </svg>
                        )}
                        <span className="animate-fadeIn max-w-full truncate whitespace-nowrap">
                          {regionSentSuccess ? (
                            <svg className="inline h-4 w-4 align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : isSendingRegion ? (
                            "Sending..."
                          ) : (
                            `Send Prevention Tips Email For ${selected.country}`
                          )}
                        </span>
                      </button>

                      {!isAuthenticated && (
                        <p className="mt-1 text-center text-xs break-words whitespace-normal text-white/50">
                          Sign In To Send Tips To Your Email.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Bottom Status Bar - Separated from globe container */}
          <div className="border-t border-white/5" style={{ backgroundColor: "#15151a" }}>
            <div className="flex">
              {/* Data Stream Status */}
              <div className="flex flex-1 items-center justify-between border-r border-white/5 p-3">
                <span className="text-sm text-white/60">Data Stream</span>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${isAuthLoading ? "animate-pulse bg-yellow-500" : isAuthenticated ? "animate-pulse bg-green-500" : "bg-gray-500"}`}
                  ></div>
                  <span
                    className={`text-xs ${isAuthLoading ? "text-yellow-400" : isAuthenticated ? "text-green-400" : "text-gray-400"}`}
                  >
                    {isAuthLoading ? "Connecting..." : isAuthenticated ? "Online" : "Offline"}
                  </span>
                </div>
              </div>

              {/* On Map */}
              <div className="flex flex-1 items-center justify-between p-3">
                <span className="text-sm text-white/60">On Map</span>
                <span className="font-mono text-xs text-white/80">
                  {isAuthLoading ? "--" : isAuthenticated && filtered ? filtered.length : "--"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MobileBlocker>
  );
}
