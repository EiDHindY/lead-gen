import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function pointInPolygon(point: number[], vs: number[][]) {
    // ray-casting algorithm based on
    // https://github.com/substack/point-in-polygon/blob/master/nested.js
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Multipolygon support
function pointInMultiPolygon(point: number[], polygons: any[]) {
    for (const polygon of polygons) {
        // First ring is the outer boundary
        const outerRing = polygon[0];
        if (pointInPolygon(point, outerRing)) {
            // Check holes (inner rings)
            let inHole = false;
            for (let i = 1; i < polygon.length; i++) {
                if (pointInPolygon(point, polygon[i])) {
                    inHole = true;
                    break;
                }
            }
            if (!inHole) return true;
        }
    }
    return false;
}

async function main() {
    // 1. Get Chatswood Poly
    const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('name, boundary_polygon')
        .ilike('name', '%Chatswood%')
        .limit(1)
        .single();

    if (!neighborhood || !neighborhood.boundary_polygon?.geojson) {
        return console.log("Polygon not found");
    }

    const geojson = neighborhood.boundary_polygon.geojson;

    // GeoJSON uses [lng, lat]
    // Let's test two points:
    // P1: Chatswood Station (inside) -> -33.796, 151.181
    const p1 = [151.181, -33.796];

    // P2: Artarmon Station (outside) -> -33.808, 151.184
    const p2 = [151.184, -33.808];

    let p1Inside = false;
    let p2Inside = false;

    if (geojson.type === "Polygon") {
        p1Inside = pointInMultiPolygon(p1, [geojson.coordinates]);
        p2Inside = pointInMultiPolygon(p2, [geojson.coordinates]);
    } else if (geojson.type === "MultiPolygon") {
        p1Inside = pointInMultiPolygon(p1, geojson.coordinates);
        p2Inside = pointInMultiPolygon(p2, geojson.coordinates);
    }

    console.log("P1 (Chatswood) inside:", p1Inside); // Should be true
    console.log("P2 (Artarmon) inside:", p2Inside); // Should be false
}

main();
