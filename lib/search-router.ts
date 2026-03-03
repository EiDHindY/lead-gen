// Search Router — the brain that routes venue searches to the right engine(s)
//
// Strategy:
//   - Standard venue types (cafes, bars, restaurants) → Geoapify (OSM categories)
//   - Activity-based types (parachuting, go-karting) → Foursquare + Overpass IN PARALLEL
//   - Dedup: STRICT (exact name + exact lat/lon only)

import { VENUE_CATEGORIES as GEOAPIFY_CATEGORIES } from "@/lib/geoapify";
import { searchByActivity, type NormalizedVenue } from "@/lib/overpass";
import { searchVenues as searchFoursquare, type FsqVenue } from "@/lib/foursquare";

// ── Detection: Is this an activity or a standard venue type? ──

/**
 * Check if a venue type string maps to a known Geoapify category.
 * If it does, it's a "standard" type. If not, it's an "activity" type.
 */
export function isActivityType(venueType: string): boolean {
    const normalized = venueType.toLowerCase().replace(/[\s-]/g, "_");

    // Check exact match in Geoapify mapping
    if (GEOAPIFY_CATEGORIES[normalized]) return false;

    // Check singularized forms
    if (normalized.endsWith("s") && GEOAPIFY_CATEGORIES[normalized.slice(0, -1)]) return false;
    if (normalized.endsWith("es") && GEOAPIFY_CATEGORIES[normalized.slice(0, -2)]) return false;

    // If Geoapify doesn't know it, treat it as an activity
    return true;
}

// ── Foursquare → NormalizedVenue conversion ──

function normalizeFoursquareVenue(v: FsqVenue): NormalizedVenue | null {
    const lat = v.latitude ?? v.geocodes?.main?.latitude;
    const lon = v.longitude ?? v.geocodes?.main?.longitude;

    if (!lat || !lon) return null;
    if (!v.name) return null;

    return {
        id: v.fsq_id || v.fsq_place_id || "",
        source: "foursquare",
        name: v.name,
        address: v.location?.formatted_address || v.location?.address || "",
        lat,
        lon,
        phone: v.tel || null,
        website: v.website || null,
        opening_hours: v.hours?.display || null,
        categories: v.categories?.map(c => c.name) || [],
        rating: v.rating || null,
        total_ratings: v.stats?.total_ratings || null,
    };
}

// ── Strict Deduplication ──

/**
 * Generate a strict dedup key: exact lowercase name + exact coordinates.
 * Only venues with IDENTICAL name AND coordinates are treated as duplicates.
 */
function dedupKey(venue: NormalizedVenue): string {
    return `${venue.name.toLowerCase().trim()}|${venue.lat}|${venue.lon}`;
}

/**
 * Merge results from multiple sources with strict deduplication.
 * When duplicates are found, keep the one with more data (more non-null fields).
 */
function mergeAndDedup(sources: NormalizedVenue[][]): NormalizedVenue[] {
    const seen = new Map<string, NormalizedVenue>();

    for (const sourceVenues of sources) {
        for (const venue of sourceVenues) {
            const key = dedupKey(venue);

            if (seen.has(key)) {
                // Keep the richer record (more non-null fields)
                const existing = seen.get(key)!;
                const existingScore = richness(existing);
                const newScore = richness(venue);

                if (newScore > existingScore) {
                    seen.set(key, venue);
                }
            } else {
                seen.set(key, venue);
            }
        }
    }

    return Array.from(seen.values());
}

/** Score how "rich" a venue record is (more data = higher score) */
function richness(v: NormalizedVenue): number {
    let score = 0;
    if (v.phone) score++;
    if (v.website) score++;
    if (v.opening_hours) score++;
    if (v.address) score++;
    if (v.rating !== null) score += 2; // Ratings are extra valuable
    if (v.total_ratings !== null) score++;
    if (v.categories.length > 0) score++;
    return score;
}

// ── Main Search Router ──

export interface ActivitySearchResult {
    venues: NormalizedVenue[];
    sources: {
        foursquare: number;
        overpass: number;
        beforeDedup: number;
    };
}

/**
 * Search for activity-based venues using Foursquare + Overpass in parallel.
 * Results are merged and strictly deduplicated (exact name + exact coordinates).
 */
export async function searchActivity(
    lat: number,
    lon: number,
    radius: number,
    activityKeyword: string
): Promise<ActivitySearchResult> {
    console.log(`[search-router] Activity search: "${activityKeyword}" at ${lat},${lon} radius=${radius}m`);

    // Run Foursquare and Overpass in PARALLEL
    const [foursquareResults, overpassResults] = await Promise.allSettled([
        searchFoursquareActivity(lat, lon, radius, activityKeyword),
        searchByActivity(lat, lon, radius, activityKeyword),
    ]);

    // Extract results (handle failures gracefully)
    const fsqVenues: NormalizedVenue[] = foursquareResults.status === "fulfilled"
        ? foursquareResults.value
        : (() => {
            console.error(`[search-router] Foursquare failed:`, (foursquareResults as PromiseRejectedResult).reason);
            return [];
        })();

    const overpassVenues: NormalizedVenue[] = overpassResults.status === "fulfilled"
        ? overpassResults.value
        : (() => {
            console.error(`[search-router] Overpass failed:`, (overpassResults as PromiseRejectedResult).reason);
            return [];
        })();

    console.log(`[search-router] Raw results — Foursquare: ${fsqVenues.length}, Overpass: ${overpassVenues.length}`);

    const beforeDedup = fsqVenues.length + overpassVenues.length;

    // Merge and deduplicate with STRICT matching (exact name + exact coordinates)
    const merged = mergeAndDedup([fsqVenues, overpassVenues]);

    console.log(`[search-router] After strict dedup: ${merged.length} (removed ${beforeDedup - merged.length} exact duplicates)`);

    return {
        venues: merged,
        sources: {
            foursquare: fsqVenues.length,
            overpass: overpassVenues.length,
            beforeDedup,
        },
    };
}

/**
 * Human-readable search terms for compound activity keywords.
 * These improve Foursquare's semantic text search accuracy.
 */
const ACTIVITY_SEARCH_TERMS: Record<string, string[]> = {
    escape_rooms_laser_tag: ["escape room", "laser tag"],
    airsoft_paintball: ["airsoft", "paintball"],
    ropes_courses_ziplines: ["ropes course", "zipline", "adventure park"],
    atv_off_road_tours: ["ATV tours", "off road tours", "quad biking"],
    bike_segway_tours: ["bike tours", "segway tours"],
    kayaking_paddleboarding: ["kayaking", "paddleboarding", "SUP rental"],
    snorkeling_scuba: ["snorkeling", "scuba diving"],
    jet_ski_wakeboarding: ["jet ski rental", "wakeboarding"],
    sailing_boat_tours: ["sailing", "boat tours", "yacht charter"],
    skydiving_bungee: ["skydiving", "bungee jumping"],
    hot_air_balloon: ["hot air balloon"],
    paragliding_hang_gliding: ["paragliding", "hang gliding"],
    go_kart_track_racing: ["go kart", "karting", "race track"],
    vr_simulator: ["VR arcade", "virtual reality", "simulator"],
    aquariums_zoos: ["aquarium", "zoo"],
    museums_cultural_sites: ["museum", "cultural center", "art gallery"],
    water_parks_pools: ["water park", "swimming pool"],
    arcades_indoor_play: ["arcade", "indoor playground", "trampoline park"],
    mini_golf_trampoline: ["mini golf", "trampoline park"],
};

/**
 * Search Foursquare using text query for an activity keyword.
 * For compound keywords (e.g., "escape_rooms_laser_tag"), splits into
 * individual sub-queries to avoid irrelevant results.
 */
async function searchFoursquareActivity(
    lat: number,
    lon: number,
    radius: number,
    activityKeyword: string
): Promise<NormalizedVenue[]> {
    const normalized = activityKeyword.toLowerCase().replace(/[\s-]/g, "_");

    // Get specific search terms, or fall back to splitting on underscores
    const searchTerms = ACTIVITY_SEARCH_TERMS[normalized]
        || [activityKeyword.replace(/_/g, " ")];

    console.log(`[foursquare-search] Terms for "${activityKeyword}":`, searchTerms);

    // Search each term in parallel
    const results = await Promise.allSettled(
        searchTerms.map(async (term) => {
            try {
                // Request a smaller limit per sub-term to keep it fast
                const result = await searchFoursquare(lat, lon, radius, term, 30);
                return result.venues;
            } catch (err) {
                console.error(`[foursquare-search] Failed for "${term}":`, err);
                return [];
            }
        })
    );

    const seenIds = new Set<string>();
    const allVenues: NormalizedVenue[] = [];

    for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const v of result.value) {
            // FsqVenue might already be normalized if coming from searchFoursquare
            const nv = normalizeFoursquareVenue(v);
            if (!nv) continue;

            // Deduplicate across sub-queries
            if (seenIds.has(nv.id)) continue;
            seenIds.add(nv.id);
            allVenues.push(nv);
        }
    }

    console.log(`[foursquare-search] Total results for "${activityKeyword}": ${allVenues.length}`);
    return allVenues;
}

