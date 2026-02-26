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
    bar: "catering.bar",
    pub: "catering.pub",
    fast_food: "catering.fast_food",
    ice_cream: "catering.ice_cream",
    pizza: "catering.fast_food.pizza,catering.restaurant.pizza",
    tea_house: "catering.cafe.tea",
    dessert_shop: "catering.cafe.dessert",
    wine_bar: "catering.bar",
    brewery: "catering.biergarten",
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
export function mapVenueTypes(types: (string | any)[]): string {
    const cats: string[] = [];
    for (const t of types) {
        // Defensive: handle cases where venue_type is an object instead of a string
        const raw = typeof t === "string" ? t : (t?.name || t?.venue_type || String(t || ""));
        if (!raw) continue;
        const normalized = raw.toLowerCase().replace(/[\s-]/g, "_");
        const mapped = VENUE_CATEGORIES[normalized];
        if (mapped) {
            cats.push(mapped);
        }
    }
    // If no mapping found, use the type as a broad catering search
    return cats.length > 0 ? cats.join(",") : "catering";
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
 * Generate a Google Maps URL from coordinates and address
 */
export function generateMapsUrl(lat: number, lng: number, name: string, address?: string): string {
    const queryStr = address ? `${name}, ${address}` : `${name} ${lat},${lng}`;
    const query = encodeURIComponent(queryStr);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
