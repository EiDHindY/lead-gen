import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Parse pasted text in the format:
 *   Venue Name
 *   (blank line)
 *   Address
 *   (blank lines)
 *   ...repeat
 */
function parseVenueText(text: string): Array<{ name: string; address: string }> {
    // Split into lines, trim each
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const venues: Array<{ name: string; address: string }> = [];

    for (let i = 0; i < lines.length; i += 2) {
        const name = lines[i];
        const address = lines[i + 1] || "";

        if (name) {
            venues.push({ name, address });
        }
    }

    return venues;
}

function generateMapsUrl(name: string, address: string): string {
    const query = encodeURIComponent(`${name} ${address}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export async function POST(req: NextRequest) {
    try {
        const { campaignId, neighborhoodId, text } = await req.json();

        if (!campaignId || !text) {
            return NextResponse.json(
                { error: "Missing campaignId or text" },
                { status: 400 }
            );
        }

        const parsed = parseVenueText(text);

        if (parsed.length === 0) {
            return NextResponse.json(
                { error: "No venues found in pasted text" },
                { status: 400 }
            );
        }

        // Check for existing venues in this campaign by name (dedup)
        const { data: existingVenues } = await supabase
            .from("venues")
            .select("name")
            .eq("campaign_id", campaignId);

        const existingNames = new Set(
            (existingVenues || []).map((v) => v.name.toLowerCase())
        );

        const newVenues = parsed.filter(
            (v) => !existingNames.has(v.name.toLowerCase())
        );

        const duplicates = parsed.length - newVenues.length;

        // Insert new venues
        const inserted = [];
        for (const venue of newVenues) {
            // Use a synthetic fsq_id (manual import prefix)
            const fsqId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            const { data, error } = await supabase
                .from("venues")
                .insert({
                    campaign_id: campaignId,
                    neighborhood_id: neighborhoodId || null,
                    fsq_id: fsqId,
                    name: venue.name,
                    address: venue.address,
                    google_maps_url: generateMapsUrl(venue.name, venue.address),
                    status: "new",
                })
                .select()
                .single();

            if (!error && data) {
                inserted.push(data);
            }
        }

        return NextResponse.json({
            total: parsed.length,
            imported: inserted.length,
            duplicatesSkipped: duplicates,
            venues: inserted,
        });
    } catch (err) {
        console.error("[import-venues]", err);
        return NextResponse.json(
            { error: "Failed to import venues" },
            { status: 500 }
        );
    }
}
