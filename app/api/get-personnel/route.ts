import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { researchVenuePersonnel, researchVenuePhone } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    let venueId: string | undefined;
    try {
        const body = await req.json();
        venueId = body.venueId;

        if (!venueId) {
            return NextResponse.json({ error: "Missing venueId" }, { status: 400 });
        }

        // 1. Get venue details
        const { data: venue, error: venueErr } = await supabase
            .from("venues")
            .select("*")
            .eq("id", venueId)
            .single();

        console.log(`[get-personnel] Fetching venue ${venueId}:`, venue ? "Found" : "Not Found", venueErr || "");

        if (venueErr || !venue) {
            return NextResponse.json({ error: "Venue not found" }, { status: 404 });
        }

        // 2. Get campaign for product description
        const { data: campaign, error: campaignErr } = await supabase
            .from("campaigns")
            .select("product_description")
            .eq("id", venue.campaign_id)
            .single();

        console.log(`[get-personnel] Fetching campaign ${venue.campaign_id}:`, campaign ? "Found" : "Not Found", campaignErr || "");

        const productDescription =
            campaign?.product_description || "our product/service";

        // 3. Get campaign rules for this venue type to get "AI Search Rules"
        const { data: allRules } = await supabase
            .from("campaign_rules")
            .select("*")
            .eq("campaign_id", venue.campaign_id);

        let aiSearchRules = null;
        if (allRules && allRules.length > 0) {
            // Try to find a rule where the venue_type (string) matches one of the venue types from Geoapify
            const venueTypes = venue.types || [];
            const matchingRule = allRules.find(r => {
                const ruleType = String(r.venue_type).toLowerCase();
                return venueTypes.some((vt: string) => String(vt).toLowerCase().includes(ruleType) || ruleType.includes(String(vt).toLowerCase()));
            });

            aiSearchRules = matchingRule?.custom_notes || allRules[0].custom_notes;
        }

        console.log(`[get-personnel] Selected AI Search Rules:`, aiSearchRules || "None");

        // 4. PRIORITIZE PHONE NUMBER SEARCH
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

        console.log(`[get-personnel] Calling Gemini for "${venue.name}"...`);
        const result = await researchVenuePersonnel(
            venue.name,
            venue.address || "",
            venue.types || [],
            productDescription,
            aiSearchRules
        );

        // 5. CHECK AI FILTERING RESULTS
        if (result.matchesRules === false) {
            console.log(`[get-personnel] Venue rejected by AI rules: ${result.reason}`);
            await supabase
                .from("venues")
                .update({
                    status: "skipped",
                    ai_research_raw: `Rejected by AI rules: ${result.reason}\n\nFull AI Response: ${result.raw_response}`
                })
                .eq("id", venueId);

            return NextResponse.json({
                venue: venue.name,
                aborted: true,
                reason: "ai_filter_rejected",
                message: result.reason || "Venue did not match your AI search rules."
            });
        }

        console.log(`[get-personnel] Gemini returned ${result.personnel.length} people.`);

        // 6. Save personnel to Supabase
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
                    confidence_score: person.confidence_score || null,
                    justification: person.justification || null,
                })
                .select()
                .single();

            if (!error && data) {
                insertedPersonnel.push(data);
            }
        }

        // 7. Update venue status and store raw AI response
        // 7. Update venue status
        const hasData = insertedPersonnel.length > 0 || !!venuePhone;
        await supabase
            .from("venues")
            .update({
                status: hasData ? "researched" : "skipped",
                ai_research_raw: hasData ? result.raw_response : `No personnel or phone found. \n\nAI Response: ${result.raw_response}`,
                model_used: result.model_used || "unknown",
            })
            .eq("id", venueId);

        return NextResponse.json({
            venue: venue.name,
            personnelFound: insertedPersonnel.length,
            personnel: insertedPersonnel,
        });
    } catch (err: any) {
        console.error(`[get-personnel] Error researching venue ${venueId}:`, err);
        return NextResponse.json(
            {
                error: "Failed to research personnel",
                details: err.message,
                venueId
            },
            { status: 500 }
        );
    }
}
