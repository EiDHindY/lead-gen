// Geoapify Places API helper
// Docs: https://apidocs.geoapify.com/docs/places/

const GEOAPIFY_BASE = "https://api.geoapify.com/v2/places";

// ── Response types ──

export interface GeoapifyVenue {
    place_id: string;
    name: string;
    lat: number;
    lon: number;
    formatted: string; // Full formatted address
    address_line1?: string;
    address_line2?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    categories: string[]; // e.g. ["catering.cafe", "catering.cafe.coffee_shop"]
    datasource?: {
        raw?: {
            phone?: string;
            website?: string;
            opening_hours?: string;
            "contact:phone"?: string;
            "contact:website"?: string;
        };
    };
}

interface GeoapifyResponse {
    type: "FeatureCollection";
    features: Array<{
        type: "Feature";
        geometry: { type: "Point"; coordinates: [number, number] };
        properties: GeoapifyVenue;
    }>;
}

// ── Geoapify category mapping ──
// Maps user-friendly venue types to Geoapify category strings
export const VENUE_CATEGORIES: Record<string, string> = {
    cafe: "catering.cafe",
    coffee: "catering.cafe.coffee,catering.cafe.coffee_shop",
    coffee_shop: "catering.cafe.coffee,catering.cafe.coffee_shop",
    coffeeshop: "catering.cafe.coffee,catering.cafe.coffee_shop",
    bakery: "commercial.food_and_drink.bakery",
    restaurant: "catering.restaurant",
    bar: "catering.bar,catering.pub,catering.restaurant",
    pub: "catering.pub,catering.bar,catering.restaurant",
    wine_bar: "catering.bar,catering.pub,catering.restaurant",
    cocktail_bar: "catering.bar,catering.pub,catering.restaurant",
    brewery: "catering.biergarten,catering.pub,catering.bar,catering.restaurant",
    nightclub: "adult.nightclub,catering.bar,catering.pub,catering.restaurant",
    lounge: "catering.bar,catering.pub,catering.restaurant",
    arcade: "entertainment.game_centre,entertainment.activity_park",
    mini_golf: "entertainment.activity_park,leisure.park",
    bowling_alley: "entertainment.activity_park,sport.sport_centre",
    snooker_hall: "entertainment.activity_park,sport.sport_centre",
    pool_hall: "entertainment.activity_park,sport.sport_centre",
    event_venue: "entertainment.culture,leisure",
    hotel: "accommodation.hotel",
    juice_bar: "catering.cafe,catering.fast_food,catering.ice_cream",
    steakhouse: "catering.restaurant.steak_house",
    seafood: "catering.restaurant.seafood",
    sushi: "catering.restaurant.sushi",
    mexican: "catering.restaurant.mexican",
    italian: "catering.restaurant.italian",
    chinese: "catering.restaurant.chinese",
    indian: "catering.restaurant.indian",
    thai: "catering.restaurant.thai",
};

/**
 * Map user-friendly venue type names to Geoapify category strings
 */
export function mapVenueTypes(typesInput: string | (string | any)[]): string {
    const cats: string[] = [];

    // Support both single string and array of strings/objects
    const types = Array.isArray(typesInput) ? typesInput : [typesInput];

    for (const t of types) {
        // Defensive: handle cases where venue_type is an object instead of a string
        const raw = String(typeof t === "string" ? t : (t?.name ?? t?.venue_type ?? "")).trim();
        if (!raw) continue;

        // Normalize: lowercase, underscores, and handle PLURALIZATION
        let normalized = raw.toLowerCase().replace(/[\s-]/g, "_");

        // Try exact match first
        if (VENUE_CATEGORIES[normalized]) {
            cats.push(VENUE_CATEGORIES[normalized]);
            continue;
        }

        // Try singularizing (bars -> bar, cafes -> cafe)
        if (normalized.endsWith("s")) {
            const singular = normalized.slice(0, -1);
            if (VENUE_CATEGORIES[singular]) {
                cats.push(VENUE_CATEGORIES[singular]);
                continue;
            }
        }
        if (normalized.endsWith("es")) {
            const singular = normalized.slice(0, -2);
            if (VENUE_CATEGORIES[singular]) {
                cats.push(VENUE_CATEGORIES[singular]);
                continue;
            }
        }

        // Check if it's likely a food establishment to provide a better fallback
        const foodKeywords = ["food", "eat", "drink", "brew", "cater", "kitchen", "grill", "bbq"];
        if (foodKeywords.some(kw => normalized.includes(kw))) {
            cats.push("catering");
        }
    }

    // If no mapping found at all, we return a hybrid guess
    if (cats.length === 0 && types.length > 0) {
        const firstInput = types[0];
        const first = String(typeof firstInput === "string" ? firstInput : (firstInput?.name || "")).toLowerCase().trim();
        if (!first) return "catering";

        // If it's a known generic term, return 'catering'
        if (["bar", "bars", "restaurant", "restaurants", "cafe", "cafes"].some(kw => first.includes(kw))) {
            return "catering";
        }
        // Otherwise return the first type as a raw string
        return first.replace(/\s+/g, "_");
    }

    return cats.length > 0 ? Array.from(new Set(cats)).join(",") : "catering";
}

/**
 * Search for venues near a location using Geoapify Places API
 */
export async function searchVenues(
    lat: number,
    lng: number,
    radius: number,
    categories: string,
    limit = 50,
    offset = 0
): Promise<{ venues: GeoapifyVenue[]; hasMore: boolean }> {
    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
        throw new Error("GEOAPIFY_API_KEY is not set in environment variables");
    }

    const params = new URLSearchParams({
        categories,
        filter: `circle:${lng},${lat},${Math.round(radius)}`,
        bias: `proximity:${lng},${lat}`,
        limit: limit.toString(),
        offset: offset.toString(),
        apiKey,
    });

    const url = `${GEOAPIFY_BASE}?${params}`;
    console.log(`[geoapify] Fetching: ${url.replace(apiKey, "***")}`);

    const res = await fetch(url);

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Geoapify search failed (${res.status}): ${body}`);
    }

    const data: GeoapifyResponse = await res.json();

    const venues = data.features.map((f) => f.properties);

    return {
        venues,
        hasMore: venues.length === limit, // If we got a full page, there might be more
    };
}

/**
 * Extract phone number from Geoapify venue data
 */
export function getPhone(venue: GeoapifyVenue): string | null {
    const raw = venue.datasource?.raw;
    if (!raw) return null;
    return raw.phone || raw["contact:phone"] || null;
}

/**
 * Extract website from Geoapify venue data
 */
export function getWebsite(venue: GeoapifyVenue): string | null {
    const raw = venue.datasource?.raw;
    if (!raw) return null;
    return raw.website || raw["contact:website"] || null;
}

/**
 * Extract opening hours string from Geoapify venue data
 */
export function getOpeningHours(venue: GeoapifyVenue): string | null {
    return venue.datasource?.raw?.opening_hours || null;
}

/**
 * Count how many unique days a venue is open per week from OSM opening_hours string
 * OSM format example: "Mo-Fr 07:00-22:00; Sa 08:00-20:00; Su 09:00-18:00"
 */
export function countOpeningDays(openingHours: string | null): number | null {
    if (!openingHours) return null;

    const dayAbbrevs = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const foundDays = new Set<string>();

    for (const day of dayAbbrevs) {
        if (openingHours.includes(day)) {
            foundDays.add(day);
        }
    }

    // Handle ranges like "Mo-Fr"
    const rangeMatch = openingHours.match(/(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)/g);
    if (rangeMatch) {
        for (const range of rangeMatch) {
            const [start, end] = range.split("-");
            const startIdx = dayAbbrevs.indexOf(start);
            const endIdx = dayAbbrevs.indexOf(end);
            if (startIdx >= 0 && endIdx >= 0) {
                for (let i = startIdx; i <= endIdx; i++) {
                    foundDays.add(dayAbbrevs[i]);
                }
            }
        }
    }

    // Handle "24/7"
    if (openingHours.includes("24/7")) return 7;

    return foundDays.size > 0 ? foundDays.size : null;
}

/**
 * Check if a name is likely a generic POI tag rather than a specific business brand
 */
export function isGenericName(name: string): boolean {
    if (!name) return true;
    const lower = name.toLowerCase().trim();
    const genericTerms = [
        "restaurant", "cafe", "bar", "pub", "building",
        "unnamed", "pharmacy", "hospital", "school", "college",
        "university", "mall", "shopping center", "plaza", "block",
        "floor", "level", "parking", "toilet", "restroom", "elevator"
    ];

    // Exact match or matches a generic term followed by a space/number
    return genericTerms.some(term =>
        lower === term ||
        lower.startsWith(term + " ") ||
        lower.startsWith(term + " #")
    );
}

/**
 * Generate a Google Maps URL from coordinates and address
 */
export function generateMapsUrl(lat: number, lng: number, name: string, address?: string): string {
    // If name is generic or missing, use coordinates as the primary query to ensure the pin is accurate
    const nameIsGeneric = isGenericName(name);

    if (nameIsGeneric || !name) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    // Avoid duplicating the name if the address already starts with it
    let queryStr = name;
    if (address) {
        const cleanedAddress = address.trim();
        if (cleanedAddress.toLowerCase().startsWith(name.toLowerCase())) {
            queryStr = cleanedAddress;
        } else {
            queryStr = `${name}, ${cleanedAddress}`;
        }
    } else {
        queryStr = `${name} ${lat},${lng}`;
    }

    const query = encodeURIComponent(queryStr);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
