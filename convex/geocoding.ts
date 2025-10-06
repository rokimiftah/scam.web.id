// convex/geocoding.ts
// Simple geocoding with Mapbox API v6

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// Minimal country name → ISO2 map for Mapbox country filter
const COUNTRY_CODE_MAP: Record<string, string> = {
  // Americas
  "united states": "US",
  usa: "US",
  us: "US",
  mexico: "MX",
  canada: "CA",
  brazil: "BR",
  argentina: "AR",
  peru: "PE",
  // Europe
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  ireland: "IE",
  france: "FR",
  germany: "DE",
  italy: "IT",
  spain: "ES",
  portugal: "PT",
  greece: "GR",
  netherlands: "NL",
  czechia: "CZ",
  "czech republic": "CZ",
  // Africa
  egypt: "EG",
  morocco: "MA",
  kenya: "KE",
  "south africa": "ZA",
  rwanda: "RW",
  nigeria: "NG",
  // Middle East
  "united arab emirates": "AE",
  uae: "AE",
  turkey: "TR",
  qatar: "QA",
  "saudi arabia": "SA",
  // Asia
  india: "IN",
  indonesia: "ID",
  thailand: "TH",
  vietnam: "VN",
  "viet nam": "VN",
  singapore: "SG",
  malaysia: "MY",
  philippines: "PH",
  china: "CN",
  japan: "JP",
  "south korea": "KR",
  korea: "KR",
  // Oceania
  australia: "AU",
  "new zealand": "NZ",
};

function countryToIso2(country?: string): string | undefined {
  if (!country) return undefined;
  const key = country.trim().toLowerCase();
  return COUNTRY_CODE_MAP[key];
}

// Cache for geocoding results
const geocodeCache: Map<string, { lat: number; lng: number }> = new Map();

// Simple geocoding using Mapbox API
async function geocodeLocation(location: string, countryHint?: string): Promise<{ lat: number; lng: number } | null> {
  // Check cache first
  const cacheKey = location.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) {
    console.log(`Using cached coordinates for ${location}`);
    return geocodeCache.get(cacheKey)!;
  }

  if (!MAPBOX_ACCESS_TOKEN) {
    console.error("MAPBOX_ACCESS_TOKEN not set. Cannot geocode without API token.");
    return null;
  }

  try {
    // CRITICAL FIX: Build query string with proper country context
    // This prevents Delhi, India from becoming Delhi, California
    let queryString = location.trim();
    const locationLower = location.toLowerCase().trim();

    // Special handling for known problem cases
    if (locationLower === "delhi" && countryHint?.toLowerCase().includes("india")) {
      // Force Delhi, India explicitly
      queryString = "Delhi, India";
    } else if (locationLower === "lombok" && countryHint?.toLowerCase().includes("indonesia")) {
      // Force Lombok Island, Indonesia (not Lombok in Kalimantan)
      queryString = "Lombok Island, Indonesia";
    } else if (countryHint && !location.toLowerCase().includes(countryHint.toLowerCase())) {
      // General case: append country if not already present
      queryString = `${location.trim()}, ${countryHint.trim()}`;
    }

    // Mapbox v6 geocoding with stricter types and country filter
    const iso2 = countryToIso2(countryHint);
    let url =
      `https://api.mapbox.com/search/geocode/v6/forward?` +
      `q=${encodeURIComponent(queryString)}` +
      `&types=place,locality,region,country` +
      `&language=en` +
      `&autocomplete=false` +
      `&access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&limit=1`;

    // CRITICAL: Add country filter to narrow results
    if (iso2) {
      url += `&country=${iso2}`;
    }

    console.log(`Geocoding: ${queryString} (ISO2: ${iso2 || "none"})`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Mapbox API error for ${location}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const [lng, lat] = feature.geometry.coordinates;

      // Validate coordinates make sense for the location
      // Delhi, India should be around 28.6°N, 77.2°E
      // Lombok, Indonesia should be around -8.6°S, 116.3°E
      const locationLower = location.toLowerCase().trim();
      if (locationLower === "delhi" && countryHint?.toLowerCase().includes("india")) {
        if (Math.abs(lat - 28.6) > 5 || Math.abs(lng - 77.2) > 5) {
          console.warn(`WARNING: Wrong Delhi detected at ${lat}, ${lng}. Expected near 28.6, 77.2`);
          // Force correct Delhi coordinates
          return { lat: 28.6139, lng: 77.209 };
        }
      }
      if (locationLower === "lombok" && countryHint?.toLowerCase().includes("indonesia")) {
        if (Math.abs(lat - -8.65) > 2 || Math.abs(lng - 116.3) > 2) {
          console.warn(`WARNING: Wrong Lombok detected at ${lat}, ${lng}. Expected near -8.65, 116.3`);
          // Force correct Lombok coordinates (between Bali and Sumbawa)
          return { lat: -8.65, lng: 116.3249 };
        }
      }

      console.log(
        `Mapbox result: ${feature.properties?.full_address || feature.properties?.name || "Unknown"} at (${lat}, ${lng})`,
      );

      const coords = { lat, lng };

      // Cache the result
      geocodeCache.set(cacheKey, coords);

      return coords;
    }

    console.warn(`No geocoding results from Mapbox for: ${location}`);
    return null;
  } catch (error) {
    console.error(`Geocoding error for ${location}:`, error);
    return null;
  }
}

// Detailed geocoding that also extracts canonical country and city from Mapbox feature
async function geocodeLocationDetailed(
  location: string,
  countryHint?: string,
): Promise<{
  lat: number;
  lng: number;
  country?: string;
  city?: string;
} | null> {
  // No cross-cache with simple cache to avoid mixing structures

  if (!MAPBOX_ACCESS_TOKEN) {
    console.error("MAPBOX_ACCESS_TOKEN not set. Cannot geocode without API token.");
    return null;
  }

  try {
    // Apply same fixes as simple geocoding for consistency
    let queryString = location.trim();
    const locationLowerDetailed = location.toLowerCase().trim();

    if (locationLowerDetailed === "delhi" && countryHint?.toLowerCase().includes("india")) {
      queryString = "Delhi, India";
    } else if (locationLowerDetailed === "lombok" && countryHint?.toLowerCase().includes("indonesia")) {
      queryString = "Lombok Island, Indonesia";
    } else if (countryHint && !location.toLowerCase().includes(countryHint.toLowerCase())) {
      queryString = `${location.trim()}, ${countryHint.trim()}`;
    }

    const iso2 = countryToIso2(countryHint);
    let url =
      `https://api.mapbox.com/search/geocode/v6/forward?` +
      `q=${encodeURIComponent(queryString)}` +
      `&types=place,locality,region,country` +
      `&language=en` +
      `&autocomplete=false` +
      `&access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&limit=1`;

    if (iso2) {
      url += `&country=${iso2}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Mapbox API error (detailed) for ${location}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.features || data.features.length === 0) {
      return null;
    }

    const feature = data.features[0];
    const [lng, lat] = feature.geometry.coordinates;

    // Validate coordinates for known problem cases
    const locationLowerValidate = location.toLowerCase().trim();
    if (locationLowerValidate === "delhi" && countryHint?.toLowerCase().includes("india")) {
      if (Math.abs(lat - 28.6) > 5 || Math.abs(lng - 77.2) > 5) {
        console.warn(`WARNING: Wrong Delhi detected at ${lat}, ${lng}. Forcing correct coordinates.`);
        return { lat: 28.6139, lng: 77.209, country: "India", city: "Delhi" };
      }
    }
    if (locationLowerValidate === "lombok" && countryHint?.toLowerCase().includes("indonesia")) {
      if (Math.abs(lat - -8.65) > 2 || Math.abs(lng - 116.3) > 2) {
        console.warn(`WARNING: Wrong Lombok detected at ${lat}, ${lng}. Forcing correct coordinates.`);
        return { lat: -8.65, lng: 116.3249, country: "Indonesia", city: "Lombok" };
      }
    }

    // Try to pull canonical names from context; fallbacks to feature properties
    // The v6 Search API typically exposes a context object with country/region/place/locality
    const props = feature.properties || {};
    const ctx = props.context || {};

    const country: string | undefined =
      ctx.country?.name || props.country || (feature.place_type?.includes("country") ? props.name : undefined);

    const city: string | undefined =
      // prefer place/locality names for city level
      ctx.place?.name ||
      ctx.locality?.name ||
      (feature.place_type?.includes("place") || feature.place_type?.includes("locality") ? props.name : undefined);

    return { lat, lng, country, city };
  } catch (error) {
    console.error(`Detailed geocoding error for ${location}:`, error);
    return null;
  }
}

// Build location query string - ALWAYS include country for accuracy
function buildLocationQuery(country: string, city?: string): string {
  // Always include country for accuracy
  if (city && city !== "Unknown" && country && country !== "Unknown") {
    // City + Country is most accurate
    return `${city.trim()}, ${country.trim()}`;
  }

  // Just country if no city
  if (country && country !== "Unknown") {
    return country.trim();
  }

  return "";
}

// DEPRECATED: Use aiAnalyzer.analyzeScamStory which geocodes automatically
// Only use this for emergency fixes of missing coordinates
export const addCoordinatesToStories = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ success: boolean; updated: number; total: number; errors: number }> => {
    console.warn("⚠️ DEPRECATED: addCoordinatesToStories should only be used for emergency fixes.");
    console.warn("   Normal flow: aiAnalyzer.analyzeScamStory geocodes automatically.");

    const limit = args.limit || 50;

    const stories: any[] = await ctx.runQuery(internal.geocoding.getStoriesWithoutCoordinates, { limit });

    let updated = 0;
    let errors = 0;

    for (const story of stories) {
      try {
        const locationQuery = buildLocationQuery(story.country, story.city);

        if (!locationQuery) {
          console.log(`Skipping story ${story._id} - no location data`);
          continue;
        }

        const coords = await geocodeLocation(locationQuery);

        if (coords) {
          await ctx.runMutation(internal.geocoding.updateStoryCoordinates, {
            storyId: story._id,
            coordinates: coords,
          });
          updated++;
          console.log(`Updated ${locationQuery}: ${coords.lat}, ${coords.lng}`);
        } else {
          errors++;
          console.log(`Failed to geocode: ${locationQuery}`);
        }

        // Rate limiting for Mapbox API
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`Error processing story ${story._id}:`, error);
        errors++;
      }
    }

    return { success: true, updated, total: stories.length, errors };
  },
});

// Geocode a single location
export const geocodeSingleLocation = action({
  args: {
    location: v.string(),
  },
  handler: async (_ctx, args): Promise<{ success: boolean; coordinates: { lat: number; lng: number } | null }> => {
    const coords = await geocodeLocation(args.location);
    return {
      success: coords !== null,
      coordinates: coords,
    };
  },
});

// Internal version for use by other actions
export const geocodeSingleLocationInternal = internalAction({
  args: {
    location: v.string(),
  },
  handler: async (_ctx, args): Promise<{ success: boolean; coordinates: { lat: number; lng: number } | null }> => {
    const coords = await geocodeLocation(args.location);
    return {
      success: coords !== null,
      coordinates: coords,
    };
  },
});

// Internal: Geocode and also normalize canonical country/city from Mapbox result
export const geocodeAndNormalize = internalAction({
  args: {
    location: v.string(),
    country: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    success: boolean;
    coordinates: { lat: number; lng: number } | null;
    country?: string;
    city?: string;
  }> => {
    const detailed = await geocodeLocationDetailed(args.location, args.country);
    return {
      success: detailed !== null,
      coordinates: detailed ? { lat: detailed.lat, lng: detailed.lng } : null,
      country: detailed?.country,
      city: detailed?.city,
    };
  },
});

// Query functions
export const getProcessedStoriesWithCoordinates = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("scamStories")
      .filter((q) =>
        q.and(q.eq(q.field("isProcessed"), true), q.neq(q.field("coordinates"), undefined), q.neq(q.field("country"), "Unknown")),
      )
      .take(50);
  },
});

export const getStoriesWithoutCoordinates = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const stories = await ctx.db
      .query("scamStories")
      .filter((q) => q.and(q.eq(q.field("isProcessed"), true), q.neq(q.field("country"), "Unknown")))
      .take(limit);

    // Filter out stories that already have valid coordinates
    return stories.filter((story) => {
      if (!story.coordinates) return true;
      if (story.coordinates.lat === 0 && story.coordinates.lng === 0) return true;
      return false;
    });
  },
});

export const updateStoryCoordinates = internalMutation({
  args: {
    storyId: v.id("scamStories"),
    coordinates: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.storyId, {
      coordinates: args.coordinates,
    });
  },
});

export const getProcessedStories = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scamStories")
      .filter((q) => q.eq(q.field("isProcessed"), true))
      .take(args.limit);
  },
});

export const updateStoryLocationData = internalMutation({
  args: {
    storyId: v.id("scamStories"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.storyId, args.patch);
  },
});

// Re-geocode all stories
export const regeocodeAllStories = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; totalProcessed: number; totalUpdated: number; totalErrors: number }> => {
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let hasMore = true;

    // First, get all stories to build a country->coordinates map
    const allStoriesWithCoords = await ctx.runQuery(internal.geocoding.getProcessedStoriesWithCoordinates);
    const countryCoordinates: Record<string, { lat: number; lng: number }> = {};

    // Build map of country to coordinates from stories with known cities
    for (const story of allStoriesWithCoords) {
      if (story.coordinates && story.country && story.city && story.city !== "Unknown") {
        countryCoordinates[story.country] = story.coordinates;
      }
    }

    while (hasMore) {
      const stories: any[] = args?.force
        ? await ctx.runQuery(internal.geocoding.getProcessedStoriesWithCoordinates)
        : await ctx.runQuery(internal.geocoding.getStoriesWithoutCoordinates, { limit: 20 });

      if (stories.length === 0) {
        hasMore = false;
        break;
      }

      for (const story of stories) {
        try {
          let coords: { lat: number; lng: number } | null = null;

          // If city is Unknown but country exists, use coordinates from another story in same country
          if (story.city === "Unknown" && story.country && story.country !== "Unknown") {
            if (countryCoordinates[story.country]) {
              coords = countryCoordinates[story.country];
              console.log(`Using existing ${story.country} coordinates for Unknown city: ${coords.lat}, ${coords.lng}`);
            } else {
              // If no existing coordinates, geocode the country
              const locationQuery = buildLocationQuery(story.country, story.city);
              coords = await geocodeLocation(locationQuery);
            }
          } else {
            // Normal geocoding for stories with known cities
            const locationQuery = buildLocationQuery(story.country, story.city);

            if (!locationQuery) {
              console.log(`Skipping story ${story._id} - no location data`);
              continue;
            }

            coords = await geocodeLocation(locationQuery);
          }

          if (coords) {
            const needsUpdate =
              !story.coordinates ||
              args?.force ||
              Math.abs((story.coordinates?.lat || 0) - coords.lat) > 0.001 ||
              Math.abs((story.coordinates?.lng || 0) - coords.lng) > 0.001;

            if (needsUpdate) {
              await ctx.runMutation(internal.geocoding.updateStoryCoordinates, {
                storyId: story._id,
                coordinates: coords,
              });
              totalUpdated++;
              const location = story.city === "Unknown" ? `${story.country} (Unknown city)` : `${story.city}, ${story.country}`;
              console.log(`Updated ${location}: ${coords.lat}, ${coords.lng}`);
            }
          } else {
            totalErrors++;
            console.error(`Failed to geocode: ${story.city}, ${story.country}`);
          }

          totalProcessed++;

          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (error) {
          console.error(`Error processing story ${story._id}:`, error);
          totalErrors++;
        }
      }

      hasMore = stories.length === 20 && !args?.force;

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`Geocoding complete: ${totalProcessed} processed, ${totalUpdated} updated, ${totalErrors} errors`);

    return {
      success: true,
      totalProcessed,
      totalUpdated,
      totalErrors,
    };
  },
});

// DEPRECATED: Use aiAnalyzer.analyzeScamStory which normalizes locations automatically
// Only use this for batch fixing of existing bad data
export const normalizeStoryLocations = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ success: boolean; checked: number; updated: number; errors: number }> => {
    console.warn("⚠️ DEPRECATED: normalizeStoryLocations should only be used for batch fixes.");
    console.warn("   Normal flow: aiAnalyzer.analyzeScamStory normalizes locations automatically.");

    const limit = args.limit || 50;
    // Get processed stories that have country or city info
    const stories: any[] = await ctx.runQuery(internal.geocoding.getProcessedStories, { limit });

    let checked = 0;
    let updated = 0;
    let errors = 0;

    for (const story of stories) {
      checked++;
      const parts: string[] = [];
      if (story.specificLocation) parts.push(String(story.specificLocation));
      if (story.city && story.city !== "Unknown") parts.push(String(story.city));
      if (story.country && story.country !== "Unknown") parts.push(String(story.country));
      if (parts.length === 0) continue;

      const query = parts.join(", ");
      try {
        const result = await ctx.runAction(internal.geocoding.geocodeAndNormalize, { location: query, country: story.country });
        if (result.success && result.coordinates) {
          const patch: any = { coordinates: result.coordinates, updatedAt: Date.now() };
          if (result.country) patch.country = result.country;
          if (result.city) patch.city = result.city;
          await ctx.runMutation(internal.geocoding.updateStoryLocationData, {
            storyId: story._id,
            patch,
          });
          updated++;
        }
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        console.error("normalizeStoryLocations error:", e);
        errors++;
      }
    }

    return { success: true, checked, updated, errors };
  },
});
