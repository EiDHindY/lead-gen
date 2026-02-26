// Foursquare Places API helper
// Docs: https://docs.foursquare.com/developer/reference/place-search

const FSQ_BASE = "https://places-api.foursquare.com";

function getHeaders(): HeadersInit {
    return {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.FOURSQUARE_API_KEY}`,
        "X-Places-Api-Version": "2025-06-17",
    };
}

// ── Foursquare response types ──

export interface FsqVenue {
    fsq_id?: string; // Kept for backward compatibility
    fsq_place_id?: string; // New field in 2025 version
    name: string;
    location: {
        address?: string;
        formatted_address?: string;
        locality?: string;
        region?: string;
        country?: string;
        post_town?: string;
        cross_street?: string;
    };
    latitude?: number; // New in 2025
    longitude?: number; // New in 2025
    geocodes?: {
        main: { latitude: number; longitude: number };
    };
    categories: Array<{
        id?: number;
        fsq_category_id?: string; // Enterprise structure
        name: string;
        short_name: string;
        icon?: { prefix: string; suffix: string };
    }>;
    rating?: number;
    stats?: { total_ratings?: number };
    tel?: string;
    website?: string;
    hours?: {
        display?: string;
        open_now?: boolean;
        regular?: Array<{
            day: number;
            open: string;
            close: string;
        }>;
    };
}

interface FsqSearchResponse {
    results: FsqVenue[];
    context?: {
        geo_bounds?: unknown;
    };
}

// ── Foursquare category mapping ──
// Maps user-friendly names to Foursquare category IDs
// We use arrays to ensure we catch sub-categories (e.g., Cafe and Coffee Shop)
export const VENUE_CATEGORIES: Record<string, number[]> = {
    cafe: [13032, 13033, 13034, 13035],
    coffeeshop: [13032, 13033, 13034, 13035],
    coffee_shop: [13032, 13033, 13034, 13035],
    bakery: [13002],
    restaurant: [13065],
    bar: [13003],
    pizza: [13064],
    fast_food: [13145],
    ice_cream: [13040],
    juice_bar: [13381],
    tea_house: [13036, 13344],
    dessert_shop: [13028],
    deli: [13026],
    food_truck: [13141],
    pub: [13003, 13018], // Bar and Pub
    wine_bar: [13024],
    brewery: [13029],
    steakhouse: [13072],
    seafood: [13068],
    sushi: [13276],
    mexican: [13303],
    italian: [13236],
    chinese: [13099],
    indian: [13199],
    thai: [13352],
};

/**
 * Search for venues near a location
 */
export async function searchVenues(
    lat: number,
    lng: number,
    radius: number,
    categoryQuery: string,
    limit = 50,
    cursor?: string
): Promise<{ venues: FsqVenue[]; nextCursor?: string }> {
    const params = new URLSearchParams({
        ll: `${lat},${lng}`,
        radius: Math.round(radius).toString(),
        query: categoryQuery, // Rely on Foursquare's query text search because Enterprise IDs are string hashes
        limit: limit.toString(),
        fields: "fsq_place_id,name,location,categories,tel,website,latitude,longitude,rating,hours,stats",
    });

    if (cursor) {
        params.append("cursor", cursor);
    }

    const res = await fetch(`${FSQ_BASE}/places/search?${params}`, {
        headers: getHeaders(),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Foursquare search failed (${res.status}): ${body}`);
    }

    const data: FsqSearchResponse = await res.json();

    // Check for pagination cursor in Link header
    const linkHeader = res.headers.get("link");
    let nextCursor: string | undefined;
    if (linkHeader) {
        const cursorMatch = linkHeader.match(/cursor=([^&>]+)/);
        if (cursorMatch) {
            nextCursor = cursorMatch[1];
        }
    }

    // Normalize fsq_id for backward compatibility
    const normalizedVenues = data.results.map((v) => ({
        ...v,
        fsq_id: v.fsq_place_id || v.fsq_id || "",
        geocodes: v.geocodes || {
            main: {
                latitude: v.latitude || 0,
                longitude: v.longitude || 0,
            },
        },
    }));

    return {
        venues: normalizedVenues,
        nextCursor,
    };
}

/**
 * Get detailed info for a specific venue
 */
export async function getVenueDetails(fsqId: string): Promise<FsqVenue> {
    const params = new URLSearchParams({
        fields: "fsq_place_id,name,location,categories,tel,website,latitude,longitude",
    });

    const res = await fetch(`${FSQ_BASE}/places/${fsqId}?${params}`, {
        headers: getHeaders(),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(
            `Foursquare venue details failed (${res.status}): ${body}`
        );
    }

    const data: FsqVenue = await res.json();
    return {
        ...data,
        fsq_id: data.fsq_place_id || data.fsq_id || fsqId,
        geocodes: data.geocodes || {
            main: {
                latitude: data.latitude || 0,
                longitude: data.longitude || 0,
            },
        },
    };
}

/**
 * Map user-friendly venue type names to Foursquare category IDs
 */
export function mapVenueTypes(types: string[]): number[] {
    const ids: number[] = [];
    for (const t of types) {
        const normalized = t.toLowerCase().replace(/[\s-]/g, "_");
        const mappedIds = VENUE_CATEGORIES[normalized];
        if (mappedIds) {
            for (const id of mappedIds) {
                if (!ids.includes(id)) {
                    ids.push(id);
                }
            }
        }
    }
    return ids;
}

/**
 * Count how many unique days a venue is open per week
 */
export function countOpeningDays(
    hours?: FsqVenue["hours"]
): number | null {
    if (!hours?.regular || hours.regular.length === 0) return null;
    const uniqueDays = new Set(hours.regular.map((h) => h.day));
    return uniqueDays.size;
}

/**
 * Generate a Google Maps URL from coordinates
 */
export function generateMapsUrl(lat: number, lng: number, name: string, address?: string): string {
    const queryStr = address ? `${name}, ${address}` : `${name} ${lat},${lng}`;
    const query = encodeURIComponent(queryStr);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
