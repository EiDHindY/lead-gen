// OpenStreetMap Nominatim API helper
// Docs: https://nominatim.org/release-docs/latest/api/Search/

export interface NominatimResult {
    place_id: number;
    licence: string;
    osm_type: string;
    osm_id: number;
    lat: string;
    lon: string;
    display_name: string;
    name: string;
    type: string;
    category?: string;
    geojson?: {
        type: string;
        coordinates: unknown;
    };
    boundingbox: (string | number)[]; // [south, north, west, east]
}

/**
 * Search for an area and get its boundary polygon
 */
export async function searchArea(
    query: string
): Promise<NominatimResult[]> {
    const params = new URLSearchParams({
        q: query,
        format: "json",
        polygon_geojson: "1",
        limit: "5",
        addressdetails: "1",
    });

    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
            headers: {
                "User-Agent": "LeadGenApp/1.0 (dodo@leadgen.app)",
            },
        }
    );

    if (!res.ok) {
        throw new Error(`Nominatim search failed (${res.status})`);
    }

    const data: NominatimResult[] = await res.json();

    // Filter to results that have boundary polygons
    return data.filter(
        (r) =>
            r.geojson &&
            (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon")
    );
}

/**
 * Get the center point of a bounding box
 */
export function getBoundingBoxCenter(
    boundingbox: (string | number)[]
): { lat: number; lng: number } {
    const [south, north, west, east] = boundingbox.map(Number);
    return {
        lat: (south + north) / 2,
        lng: (west + east) / 2,
    };
}

/**
 * Calculate approximate radius (in meters) that covers a bounding box
 */
export function getBoundingBoxRadius(
    boundingbox: (string | number)[]
): number {
    const [south, north, west, east] = boundingbox.map(Number);

    // Haversine-approximated distance for the diagonal
    const latDiff = Math.abs(north - south);
    const lngDiff = Math.abs(east - west);

    // Rough conversion: 1 degree latitude ≈ 111,000 meters
    const latMeters = latDiff * 111000;
    const lngMeters = lngDiff * 111000 * Math.cos(((south + north) / 2) * (Math.PI / 180));

    // Half the diagonal gives us a rough radius
    return Math.round(Math.sqrt(latMeters ** 2 + lngMeters ** 2) / 2);
}
