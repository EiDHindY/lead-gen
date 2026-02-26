import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { exportVenueToNotion, validateNotionConnection } from "@/lib/notion";

export async function POST(req: NextRequest) {
    try {
        const { campaignId, venueIds, notionToken, notionDatabaseId, action } = await req.json();

        // Action: validate — just test the connection
        if (action === "validate") {
            if (!notionToken || !notionDatabaseId) {
                return NextResponse.json({ error: "Missing Notion token or database ID" }, { status: 400 });
            }
            const result = await validateNotionConnection(notionToken, notionDatabaseId);
            return NextResponse.json(result);
        }

        // Action: export — export venues to Notion
        if (!campaignId || !notionToken || !notionDatabaseId) {
            return NextResponse.json(
                { error: "Missing campaignId, notionToken, or notionDatabaseId" },
                { status: 400 }
            );
        }

        // Get campaign details
        const { data: campaign } = await supabase
            .from("campaigns")
            .select("product_description")
            .eq("id", campaignId)
            .single();

        // Get venues to export (with their personnel)
        let venuesQuery = supabase
            .from("venues")
            .select("*")
            .eq("campaign_id", campaignId);

        // If specific venue IDs provided, filter to those
        if (venueIds && venueIds.length > 0) {
            venuesQuery = venuesQuery.in("id", venueIds);
        }

        const { data: venues, error: venuesErr } = await venuesQuery;

        if (venuesErr || !venues || venues.length === 0) {
            return NextResponse.json({ error: "No venues found to export" }, { status: 404 });
        }

        // Get all personnel for these venues
        const venueIdsList = venues.map(v => v.id);
        const { data: allPersonnel } = await supabase
            .from("venue_personnel")
            .select("*")
            .in("venue_id", venueIdsList);

        // Build personnel map
        const personnelMap: Record<string, NonNullable<typeof allPersonnel>> = {};
        if (allPersonnel) {
            for (const p of allPersonnel) {
                if (!personnelMap[p.venue_id]) personnelMap[p.venue_id] = [];
                personnelMap[p.venue_id].push(p);
            }
        }

        // Export each venue
        let exported = 0;
        const errors: string[] = [];

        for (const venue of venues) {
            const personnel = personnelMap[venue.id] || [];

            // Format contacts column
            const contactLines: string[] = [];
            for (let i = 0; i < personnel.length; i++) {
                const p = personnel[i];
                contactLines.push(`${p.title || "Contact"}: ${p.name}`);

                // Use personnel phone if available, fallback to venue phone
                const phoneToUse = p.phone || venue.phone;
                if (phoneToUse) {
                    contactLines.push(`Phone: ${phoneToUse}`);
                }

                if (p.email) {
                    contactLines.push(`Email: ${p.email}`);
                }

                // Add a divider dash between people (if not the last person)
                if (i < personnel.length - 1) {
                    contactLines.push("---");
                }
            }
            // If no personnel but venue has phone, use that
            if (contactLines.length === 0 && venue.phone) {
                contactLines.push(`Venue Phone: ${venue.phone}`);
            }

            // Format recommended column
            const recLines: string[] = [];
            if (venue.opening_days_count) {
                recLines.push(`Schedule: Open ${venue.opening_days_count} days/week`);
            }
            // Add pitches from personnel
            for (const p of personnel) {
                if (p.recommended_pitch) {
                    recLines.push(`\nFor ${p.name} (${p.title || "Contact"}):`);
                    recLines.push(p.recommended_pitch);
                }
            }

            const result = await exportVenueToNotion(notionToken, notionDatabaseId, {
                venueName: venue.name,
                address: venue.address || "",
                googleMapsUrl: venue.google_maps_url || undefined,
                contacts: contactLines.join("\n"),
                recommended: recLines.join("\n"),
            });

            if (result.success) {
                exported++;
            } else {
                errors.push(`${venue.name}: ${result.error}`);
                // If first venue fails with auth error, stop early
                if (errors.length === 1 && result.error?.includes("unauthorized")) {
                    return NextResponse.json({
                        error: "Notion authentication failed. Check your integration token and make sure the database is connected to the integration.",
                        exported: 0,
                        total: venues.length,
                    }, { status: 401 });
                }
            }

            // Rate limit: 350ms between calls
            await new Promise(r => setTimeout(r, 350));
        }

        // Mark successfully exported venues in the database
        const successfulVenueIds = venues
            .filter(v => !errors.some(e => e.startsWith(v.name)))
            .map(v => v.id);

        if (successfulVenueIds.length > 0) {
            await supabase
                .from("venues")
                .update({ notion_exported: true })
                .in("id", successfulVenueIds);
        }

        return NextResponse.json({
            exported,
            total: venues.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (err: any) {
        console.error("[export-notion]", err);
        return NextResponse.json(
            { error: "Failed to export to Notion: " + err.message },
            { status: 500 }
        );
    }
}
