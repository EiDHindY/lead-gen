import { NextRequest, NextResponse } from "next/server";
import { searchArea } from "@/lib/nominatim";
import { SubAreaResult } from "../fetch-sub-areas/route";

export async function POST(req: NextRequest) {
    try {
        const { areas } = await req.json();

        if (!areas || !Array.isArray(areas)) {
            return NextResponse.json(
                { error: "Missing or invalid areas array" },
                { status: 400 }
            );
        }

        const enrichedAreas = [];

        for (const area of areas as SubAreaResult[]) {
            // Add a small delay to respect Nominatim's strict rate limits (1 request per second absolute max)
            await new Promise((resolve) => setTimeout(resolve, 1100));

            try {
                // Search Nominatim for the precise boundary of this specific suburb
                const searchResults = await searchArea(area.displayName);

                const preciseBoundary = searchResults.find(r => r.category === "boundary" || r.type === "administrative" || r.osm_type === "relation") || searchResults[0];


                if (preciseBoundary && preciseBoundary.geojson) {
                    enrichedAreas.push({
                        ...area,
                        lat: parseFloat(preciseBoundary.lat),
                        lon: parseFloat(preciseBoundary.lon),
                        boundingbox: preciseBoundary.boundingbox,
                        geojson: preciseBoundary.geojson
                    });
                } else {
                    // Fallback to exactly what we had before if Nominatim fails to find a polygon
                    enrichedAreas.push({
                        ...area,
                        boundingbox: null,
                        geojson: null
                    });
                }

            } catch (e) {
                console.error(`Failed to fetch exact boundary for ${area.displayName}:`, e);
                // Fallback to basic Overpass point
                enrichedAreas.push({
                    ...area,
                    boundingbox: null,
                    geojson: null
                });
            }
        }

        return NextResponse.json({ enrichedAreas });

    } catch (err: any) {
        console.error("[fetch-bulk-boundaries]", err);
        return NextResponse.json(
            { error: err.message || "Failed to fetch bulk boundaries" },
            { status: 500 }
        );
    }
}
