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

/**
 * Fetch sub-neighborhoods (suburbs, neighborhoods) within a given OSM area ID
 */
export async function getSubAreas(osmId: number, osmType: string): Promise<OverpassElement[]> {
    // Determine the Overpass Area ID based on the osm_type.
    // Relations add 3600000000, Ways add 2400000000. Nodes don't form areas.
    let areaIdOffset = 0;
    if (osmType === 'relation') {
        areaIdOffset = 3600000000;
    } else if (osmType === 'way') {
        areaIdOffset = 2400000000;
    } else {
        throw new Error("Only relations and ways can be used as parent areas.");
    }

    const areaId = areaIdOffset + osmId;

    // We query for nodes, ways, and relations tagged as place=suburb OR place=neighbourhood
    // inside the parent area. We ask it to output the bounding box (bb) and the center point.
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

    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': "LeadGenApp/1.0 (dodo@leadgen.app)",
        },
        body: `data=${encodeURIComponent(query)}`
    });

    if (!res.ok) {
        throw new Error(`Overpass API failed (${res.status})`);
    }

    const data: OverpassResponse = await res.json();

    // Filter out elements that don't have a name
    return data.elements.filter(el => el.tags && el.tags.name);
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
