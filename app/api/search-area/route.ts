import { NextRequest, NextResponse } from "next/server";
import { searchArea } from "@/lib/nominatim";

export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get("query");

    if (!query) {
        return NextResponse.json({ error: "Missing 'query' parameter" }, { status: 400 });
    }

    try {
        const results = await searchArea(query);

        const areas = results.map((r) => ({
            osmId: r.osm_id,
            name: r.name || query,
            displayName: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            boundingbox: r.boundingbox,
            geojson: r.geojson,
            type: r.type,
        }));

        return NextResponse.json({ areas });
    } catch (err) {
        console.error("[search-area]", err);
        return NextResponse.json({ error: "Failed to search area" }, { status: 500 });
    }
}
