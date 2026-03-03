// OpenStreetMap Overpass API helper
// Docs: https://wiki.openstreetmap.org/wiki/Overpass_API

export interface OverpassElement {
    type: string;
    id: number;
    tags: {
        name?: string;
        place?: string;
    };
    bounds?: {
        minlat: number;
        minlon: number;
        maxlat: number;
        maxlon: number;
    };
    // Used if out center is provided for nodes/ways
    lat?: number;
    lon?: number;
    center?: {
        lat: number;
        lon: number;
    }
}

export interface OverpassResponse {
    version: number;
    generator: string;
    osm3s: any;
    elements: OverpassElement[];
}

// OpenStreetMap Overpass API mirrors to handle high load or timeouts on specific servers
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
];

/**
 * Fetch sub-neighborhoods (suburbs, neighborhoods) within a given OSM area ID
 */
export async function getSubAreas(osmId: number, osmType: string): Promise<OverpassElement[]> {
    // Determine the Overpass Area ID based on the osm_type.
    let areaIdOffset = 0;
    if (osmType === 'relation') {
        areaIdOffset = 3600000000;
    } else if (osmType === 'way') {
        areaIdOffset = 2400000000;
    } else {
        throw new Error("Only relations and ways can be used as parent areas.");
    }

    const areaId = areaIdOffset + osmId;

    const query = `
        [out:json][timeout:25];
        area(${areaId})->.searchArea;
        (
          node["place"~"suburb|neighbourhood|quarter"](area.searchArea);
          way["place"~"suburb|neighbourhood|quarter"](area.searchArea);
          relation["place"~"suburb|neighbourhood|quarter"](area.searchArea);
        );
        out center bb;
    `;

    let lastError = null;

    // Try mirrors in order
    for (const mirror of OVERPASS_MIRRORS) {
        try {
            console.log(`[overpass] Trying mirror: ${mirror}`);
            const res = await fetch(mirror, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': "LeadGenApp/1.0 (dodo@leadgen.app)",
                },
                body: `data=${encodeURIComponent(query)}`,
                // Add a fetch timeout signal here if needed, but the server usually respects [timeout:25]
            });

            if (!res.ok) {
                console.warn(`[overpass] Mirror ${mirror} returned status ${res.status}`);
                continue;
            }

            const data: OverpassResponse = await res.json();
            console.log(`[overpass] Success using mirror: ${mirror}`);
            return data.elements.filter(el => el.tags && el.tags.name);

        } catch (err: any) {
            console.error(`[overpass] Mirror ${mirror} failed:`, err.message);
            lastError = err;
        }
    }

    throw new Error(`All Overpass API mirrors failed. Last error: ${lastError?.message || 'Timeout'}`);
}

/**
 * Rough calculation of an area size in Square Kilometers based on a bounding box.
 */
export function calculateApproximateAreaSqKm(bounds: { minlat: number, minlon: number, maxlat: number, maxlon: number }): number {
    if (!bounds) return 0;

    // Roughly: 1 degree latitude = ~111km
    const latDistanceKm = Math.abs(bounds.maxlat - bounds.minlat) * 111;

    // Roughly: 1 degree longitude = 111km * cos(latitude)
    const midLat = (bounds.maxlat + bounds.minlat) / 2;
    const lonDistanceKm = Math.abs(bounds.maxlon - bounds.minlon) * 111 * Math.cos(midLat * (Math.PI / 180));

    // Area = width * height
    return latDistanceKm * lonDistanceKm;
}

// ══════════════════════════════════════════════════════════════
// Activity-Based Search (Hybrid Search Engine)
// ══════════════════════════════════════════════════════════════

/**
 * Normalized venue format shared across all search engines (Geoapify, Foursquare, Overpass)
 */
export interface NormalizedVenue {
    id: string;
    source: "geoapify" | "foursquare" | "overpass";
    name: string;
    address: string;
    lat: number;
    lon: number;
    phone: string | null;
    website: string | null;
    opening_hours: string | null;
    categories: string[];
    rating: number | null;
    total_ratings: number | null;
}

/**
 * OSM tag mapping for activities. Maps user-friendly activity names to OSM tag queries.
 * Reference: https://wiki.openstreetmap.org/wiki/Map_features
 */
export const ACTIVITY_OSM_TAGS: Record<string, { tags: [string, string][]; aliases: string[] }> = {
    // ── Adventure Activities ──
    escape_rooms_laser_tag: {
        tags: [["leisure", "escape_game"], ["leisure", "laser_tag"], ["sport", "laser_tag"]],
        aliases: ["escape_room", "laser_tag", "lasertag", "escape_game"],
    },
    airsoft_paintball: {
        tags: [["sport", "airsoft"], ["sport", "paintball"]],
        aliases: ["airsoft", "paintball", "paintball_arena"],
    },
    ropes_courses_ziplines: {
        tags: [["leisure", "high_ropes_course"], ["sport", "zipline"], ["attraction", "zipline"]],
        aliases: ["zipline", "zip_line", "high_ropes", "ropes_course"],
    },
    atv_off_road_tours: {
        tags: [["leisure", "atv"], ["sport", "atv"], ["tourism", "attraction"]],
        aliases: ["atv", "quad_bike", "off_road", "buggy_tours"],
    },
    bike_segway_tours: {
        tags: [["tourism", "attraction"], ["amenity", "bicycle_rental"]],
        aliases: ["bike_tours", "segway_tours", "bicycle_tours"],
    },

    // ── Water Activities ──
    kayaking_paddleboarding: {
        tags: [["sport", "kayak"], ["sport", "canoe"], ["sport", "paddleboarding"]],
        aliases: ["kayak", "canoe", "paddleboarding", "sup", "kayaking"],
    },
    snorkeling_scuba: {
        tags: [["sport", "scuba_diving"], ["sport", "diving"], ["sport", "snorkeling"]],
        aliases: ["scuba", "diving", "snorkeling", "scuba_diving"],
    },
    jet_ski_wakeboarding: {
        tags: [["sport", "jetski"], ["sport", "wakeboarding"], ["sport", "water_skiing"]],
        aliases: ["jetski", "jet_ski", "wakeboarding", "water_skiing"],
    },
    surfing: {
        tags: [["sport", "surfing"]],
        aliases: ["surf", "surfing", "surf_school"],
    },
    sailing_boat_tours: {
        tags: [["sport", "sailing"], ["tourism", "attraction"]],
        aliases: ["sailing", "boat_tours", "yacht_club"],
    },

    // ── Adrenaline Experiences ──
    skydiving_bungee: {
        tags: [["sport", "parachuting"], ["sport", "skydiving"], ["sport", "bungee_jumping"]],
        aliases: ["parachuting", "skydiving", "bungee", "bungee_jumping", "skydive"],
    },
    hot_air_balloon: {
        tags: [["sport", "ballooning"], ["attraction", "balloon_ride"]],
        aliases: ["balloon", "hot_air_ballooning", "ballooning"],
    },
    paragliding_hang_gliding: {
        tags: [["sport", "paragliding"], ["sport", "hang_gliding"]],
        aliases: ["paragliding", "hang_gliding", "gliding"],
    },
    go_kart_track_racing: {
        tags: [["sport", "karting"], ["sport", "motor"]],
        aliases: ["go_kart", "karting", "track_racing", "motorsport"],
    },
    vr_simulator: {
        tags: [["leisure", "vr_center"], ["leisure", "simulator"]],
        aliases: ["vr", "virtual_reality", "simulator", "vr_arcade"],
    },

    // ── Activities (Family & Attractions) ──
    aquariums_zoos: {
        tags: [["tourism", "aquarium"], ["tourism", "zoo"]],
        aliases: ["aquarium", "zoo", "wildlife_park"],
    },
    museums_cultural_sites: {
        tags: [["tourism", "museum"], ["tourism", "artwork"], ["heritage", "yes"]],
        aliases: ["museum", "cultural_site", "gallery", "historic"],
    },
    water_parks_pools: {
        tags: [["leisure", "water_park"], ["leisure", "swimming_pool"]],
        aliases: ["water_park", "swimming_pool", "aquapark"],
    },
    arcades_indoor_play: {
        tags: [["leisure", "arcade"], ["leisure", "playground"], ["amenity", "childcare"]],
        aliases: ["arcade", "indoor_play", "playground", "soft_play"],
    },
    mini_golf_trampoline: {
        tags: [["leisure", "miniature_golf"], ["leisure", "trampoline_park"]],
        aliases: ["mini_golf", "minigolf", "trampoline", "trampoline_park"],
    },
};

/**
 * Build an Overpass QL query to search for POIs by OSM tags within a radius
 */
function buildActivityQuery(
    lat: number,
    lon: number,
    radius: number,
    tags: [string, string][]
): string {
    const queries = tags.map(([key, value]) => {
        return `
  node["${key}"="${value}"]["name"](around:${Math.round(radius)},${lat},${lon});
  way["${key}"="${value}"]["name"](around:${Math.round(radius)},${lat},${lon});
  relation["${key}"="${value}"]["name"](around:${Math.round(radius)},${lat},${lon});`;
    }).join("\n");

    return `[out:json][timeout:25];
(${queries}
);
out center;`;
}

/**
 * Search for activity venues using the Overpass API.
 * Queries OpenStreetMap directly using specific sport/leisure tags.
 * Free, no API key required.
 */
export async function searchByActivity(
    lat: number,
    lon: number,
    radius: number,
    activityKeyword: string
): Promise<NormalizedVenue[]> {
    const normalized = activityKeyword.toLowerCase().replace(/[\s-]/g, "_");

    // Find matching OSM tags — check exact match first, then aliases
    let tags: [string, string][] | null = null;

    if (ACTIVITY_OSM_TAGS[normalized]) {
        tags = ACTIVITY_OSM_TAGS[normalized].tags;
    } else {
        for (const [, config] of Object.entries(ACTIVITY_OSM_TAGS)) {
            if (config.aliases.includes(normalized)) {
                tags = config.tags;
                break;
            }
        }
    }

    // If no known tags, try a generic sport= query with the keyword
    if (!tags) {
        tags = [["sport", normalized], ["leisure", normalized]];
        console.log(`[overpass-activity] No predefined tags for "${activityKeyword}", trying generic: sport=${normalized}, leisure=${normalized}`);
    }

    // Cap radius at 25km to avoid Overpass timeouts on large areas
    const cappedRadius = Math.min(radius, 25000);
    if (radius > 25000) {
        console.log(`[overpass-activity] Capping radius from ${radius}m to ${cappedRadius}m to avoid timeouts`);
    }

    const query = buildActivityQuery(lat, lon, cappedRadius, tags);
    console.log(`[overpass-activity] Querying for "${activityKeyword}" with ${tags.length} tag pairs, radius=${cappedRadius}m`);

    let lastError = null;

    for (const mirror of OVERPASS_MIRRORS) {
        try {
            const res = await fetch(mirror, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "LeadGenApp/1.0 (dodo@leadgen.app)",
                },
                body: `data=${encodeURIComponent(query)}`,
            });

            if (!res.ok) {
                console.warn(`[overpass-activity] Mirror ${mirror} returned status ${res.status}`);
                continue;
            }

            const data: OverpassResponse = await res.json();
            console.log(`[overpass-activity] Success using mirror: ${mirror}`);

            const venues: NormalizedVenue[] = [];
            for (const el of data.elements) {
                const elLat = el.lat ?? el.center?.lat;
                const elLon = el.lon ?? el.center?.lon;

                if (!elLat || !elLon) continue;

                const elTags = el.tags || {};
                const name = elTags.name || "";

                // Skip unnamed features
                if (!name) continue;

                const rawTags = elTags as Record<string, string>;

                venues.push({
                    id: `osm_${el.type}_${el.id}`,
                    source: "overpass",
                    name,
                    address: [rawTags["addr:street"], rawTags["addr:housenumber"], rawTags["addr:city"], rawTags["addr:postcode"]]
                        .filter(Boolean)
                        .join(", ") || "",
                    lat: elLat,
                    lon: elLon,
                    phone: rawTags.phone || rawTags["contact:phone"] || null,
                    website: rawTags.website || rawTags["contact:website"] || null,
                    opening_hours: rawTags.opening_hours || null,
                    categories: Object.entries(rawTags)
                        .filter(([k]) => ["sport", "leisure", "tourism", "attraction", "amenity"].includes(k))
                        .map(([k, v]) => `${k}:${v}`),
                    rating: null,
                    total_ratings: null,
                });
            }

            console.log(`[overpass-activity] Returning ${venues.length} named venues for "${activityKeyword}"`);
            return venues;

        } catch (err: any) {
            console.error(`[overpass-activity] Mirror ${mirror} failed:`, err.message);
            lastError = err;
        }
    }

    console.error(`[overpass-activity] All mirrors failed for "${activityKeyword}". Last error: ${lastError?.message}`);
    return [];
}

/**
 * Check if an activity keyword has known OSM tags (exact or alias match)
 */
export function hasKnownOSMTags(keyword: string): boolean {
    const normalized = keyword.toLowerCase().replace(/[\s-]/g, "_");
    if (ACTIVITY_OSM_TAGS[normalized]) return true;
    return Object.values(ACTIVITY_OSM_TAGS).some(config => config.aliases.includes(normalized));
}
