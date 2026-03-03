import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { researchVenueBasics } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    try {
        const { venueId } = await req.json();

        if (!venueId) {
            return NextResponse.json({ error: "Missing venueId" }, { status: 400 });
        }

        // 1. Get current venue details
        const { data: venue, error: venueErr } = await supabase
            .from("venues")
            .select("*")
            .eq("id", venueId)
            .single();

        if (venueErr || !venue) {
            return NextResponse.json({ error: "Venue not found" }, { status: 404 });
        }

        // 2. Perform lightweight research
        console.log(`[sync-basics] Researching basics for "${venue.name}"...`);
        const result = await researchVenueBasics(
            venue.name,
            venue.address || "",
            venue.types || [],
            venue.google_maps_url
        );

        // 3. Update venue with new official info
        const updateData: any = {};
        if (result.name) updateData.name = result.name;
        if (result.rating) updateData.rating = result.rating;
        if (result.total_ratings) updateData.total_ratings = result.total_ratings;

        // Handle closed status
        const isClosed = !!result.is_permanently_closed;
        if (isClosed) {
            updateData.status = "skipped";
        }

        // Handle Google Category logic
        let updatedTypes = venue.types || [];
        if (result.google_category && !updatedTypes.includes(result.google_category)) {
            updatedTypes = [result.google_category, ...updatedTypes];
            updateData.types = updatedTypes;
        }

        // Add sync flag to ai_research_raw (merge if existing is JSON)
        let rawData: any = {
            synced_basics: true,
            synced_at: new Date().toISOString(),
            is_permanently_closed: isClosed
        };
        if (venue.ai_research_raw) {
            try {
                const existing = JSON.parse(venue.ai_research_raw);
                if (typeof existing === 'object' && existing !== null) {
                    rawData = { ...existing, ...rawData };
                }
            } catch (e) {
                // If existing is just a string (gemini error), we keep it as 'original_message'
                rawData.original_message = venue.ai_research_raw;
            }
        }
        updateData.ai_research_raw = JSON.stringify(rawData);

        // Final safety check: if no data to update, just return success
        if (Object.keys(updateData).length === 0) {
            console.log(`[sync-basics] No new info found for "${venue.name}". Skipping update.`);
            return NextResponse.json({
                success: true,
                venue: venue,
                message: "No new info found"
            });
        }

        const { data: updatedVenue, error: updateErr } = await supabase
            .from("venues")
            .update(updateData)
            .eq("id", venueId)
            .select()
            .single();

        if (updateErr) {
            throw updateErr;
        }

        return NextResponse.json({
            success: true,
            venue: updatedVenue
        });

    } catch (err: any) {
        console.error("[sync-basics] Error:", err);
        return NextResponse.json(
            { error: "Failed to sync venue basics", details: err.message },
            { status: 500 }
        );
    }
}
