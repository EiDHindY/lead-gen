import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateCSV } from "@/lib/csv-export";
import type { Venue, VenuePersonnel } from "@/lib/supabase";

export async function GET(req: NextRequest) {
    const campaignId = req.nextUrl.searchParams.get("campaignId");
    const neighborhoodId = req.nextUrl.searchParams.get("neighborhoodId");

    if (!campaignId) {
        return NextResponse.json({ error: "Missing campaignId" }, { status: 400 });
    }

    try {
        // 1. Get venues for campaign (optionally filtered by neighborhood)
        let query = supabase.from("venues").select("*").eq("campaign_id", campaignId);

        if (neighborhoodId) {
            query = query.eq("neighborhood_id", neighborhoodId);
        }

        const { data: venues, error: venueErr } = await query;

        if (venueErr || !venues) {
            return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
        }

        // 2. Get personnel for all venues
        const venueIds = venues.map((v) => v.id);
        const { data: allPersonnel } = await supabase
            .from("venue_personnel")
            .select("*")
            .in("venue_id", venueIds);

        // 3. Group personnel by venue
        const personnelByVenue = new Map<string, VenuePersonnel[]>();
        if (allPersonnel) {
            for (const p of allPersonnel) {
                const existing = personnelByVenue.get(p.venue_id) || [];
                existing.push(p as VenuePersonnel);
                personnelByVenue.set(p.venue_id, existing);
            }
        }

        // 4. Build export rows
        const rows = venues.map((venue) => ({
            venue: venue as Venue,
            personnel: personnelByVenue.get(venue.id) || [],
        }));

        // 5. Generate CSV
        const csv = generateCSV(rows);

        // 6. Return as downloadable file
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="leads-${campaignId.slice(0, 8)}.csv"`,
            },
        });
    } catch (err) {
        console.error("[export-csv]", err);
        return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
    }
}
