import { NextRequest, NextResponse } from "next/server";
import { getSubAreas, calculateApproximateAreaSqKm } from "@/lib/overpass";

// Types corresponding to how our Nominatim area search results look
export interface SubAreaResult {
    osmId: number;
    name: string;
    displayName: string;
    lat: number;
    lon: number;
    approxSizeSqKm: number;
    parentName: string;
}

export async function POST(req: NextRequest) {
    try {
        const { osmId, osmType, parentName } = await req.json();

        if (!osmId || !osmType) {
            return NextResponse.json(
                { error: "Missing osmId or osmType" },
                { status: 400 }
            );
        }

        // Fetch sub-areas based on the relation or way from OSM
        const elements = await getSubAreas(osmId, osmType);

        // Map Overpass results to a clean format for our frontend Staging Table
        const subAreas: SubAreaResult[] = elements.map(el => {
            const size = el.bounds ? calculateApproximateAreaSqKm(el.bounds) : 0;
            const lat = el.center?.lat || el.lat || 0;
            const lon = el.center?.lon || el.lon || 0;

            return {
                osmId: el.id,
                name: el.tags.name || "Unknown",
                displayName: `${el.tags.name}, ${parentName || 'Unknown Region'}`,
                lat,
                lon,
                approxSizeSqKm: Number(size.toFixed(2)), // Keep 2 decimal places for UI
                parentName: parentName || ''
            };
        });

        // Filter out extreme junk and sort by size descending to bring useful ones to the top
        const validAreas = subAreas
            .filter(a => a.name !== "Unknown")
            .sort((a, b) => b.approxSizeSqKm - a.approxSizeSqKm);

        return NextResponse.json({ subAreas: validAreas });

    } catch (err: any) {
        console.error("[fetch-sub-areas]", err);
        return NextResponse.json(
            { error: err.message || "Failed to fetch sub-areas" },
            { status: 500 }
        );
    }
}
