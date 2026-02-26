import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { researchVenuePersonnel, researchVenuePhone } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    try {
        const { venueId } = await req.json();

        if (!venueId) {
            return NextResponse.json({ error: "Missing venueId" }, { status: 400 });
        }

        // 1. Get venue details
        const { data: venue, error: venueErr } = await supabase
            .from("venues")
            .select("*, campaigns(*)")
            .eq("id", venueId)
            .single();

        if (venueErr || !venue) {
            return NextResponse.json({ error: "Venue not found" }, { status: 404 });
        }

        // 2. Get campaign for product description
        const { data: campaign } = await supabase
            .from("campaigns")
            .select("product_description")
            .eq("id", venue.campaign_id)
            .single();

        const productDescription =
            campaign?.product_description || "our product/service";

        // 3. PRIORITIZE PHONE NUMBER SEARCH
        let venuePhone = venue.phone;
        if (!venuePhone) {
            console.log(`[get-personnel] No phone in DB for "${venue.name}", researching...`);
            venuePhone = await researchVenuePhone(
                venue.name,
                venue.address || "",
                venue.types || []
            );

            if (venuePhone) {
                console.log(`[get-personnel] Found phone: ${venuePhone}`);
                // Save it immediately so we don't lose it
                await supabase
                    .from("venues")
                    .update({ phone: venuePhone })
                    .eq("id", venueId);
            }
        }

        // 4. ABORT if no phone found (user's request: save quota)
        if (!venuePhone) {
            console.log(`[get-personnel] Aborting research: No phone found for "${venue.name}"`);
            await supabase
                .from("venues")
                .update({
                    status: "skipped",
                    ai_research_raw: "Research aborted: No verifiable phone number found for this venue."
                })
                .eq("id", venueId);

            return NextResponse.json({
                venue: venue.name,
                aborted: true,
                reason: "no_phone",
                message: "No phone number found. Research aborted to save quota."
            });
        }

        // 5. Call Gemini to research personnel
        const result = await researchVenuePersonnel(
            venue.name,
            venue.address || "",
            venue.types || [],
            productDescription
        );

        // 4. Save personnel to Supabase
        const insertedPersonnel = [];
        for (const person of result.personnel) {
            const { data, error } = await supabase
                .from("venue_personnel")
                .insert({
                    venue_id: venueId,
                    name: person.name,
                    title: person.title || null,
                    phone: person.phone || null,
                    email: person.email || null,
                    recommended_pitch: person.recommended_pitch || null,
                })
                .select()
                .single();

            if (!error && data) {
                insertedPersonnel.push(data);
            }
        }

        // 6. Update venue status and store raw AI response
        await supabase
            .from("venues")
            .update({
                status: "researched",
                ai_research_raw: result.raw_response,
            })
            .eq("id", venueId);

        return NextResponse.json({
            venue: venue.name,
            personnelFound: insertedPersonnel.length,
            personnel: insertedPersonnel,
        });
    } catch (err: any) {
        console.error("[get-personnel]", err);
        return NextResponse.json(
            { error: "Failed to research personnel", details: err.message },
            { status: 500 }
        );
    }
}
