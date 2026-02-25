/**
 * Point-in-polygon check using the ray casting algorithm.
 * Used to verify a venue is within a neighborhood's boundary.
 */

type Point = [number, number]; // [lng, lat]
type Ring = Point[];

/**
 * Check if a point is inside a GeoJSON polygon or multipolygon
 */
export function isWithinBoundary(
    lat: number,
    lng: number,
    geojson: { type: string; coordinates: unknown }
): boolean {
    if (geojson.type === "Polygon") {
        const rings = geojson.coordinates as Ring[];
        return isInsidePolygon([lng, lat], rings[0]); // Check outer ring
    }

    if (geojson.type === "MultiPolygon") {
        const polygons = geojson.coordinates as Ring[][];
        return polygons.some((polygon) => isInsidePolygon([lng, lat], polygon[0]));
    }

    // Fallback: if no valid geometry, allow the point
    return true;
}

/**
 * Ray casting algorithm to check if point is inside polygon
 */
function isInsidePolygon(point: Point, polygon: Ring): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];

        const intersect =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
    }

    return inside;
}
