import { NextRequest, NextResponse } from "next/server";
import { supabase, type CampaignRule } from "@/lib/supabase";
import {
    searchVenues,
    mapVenueTypes,
    countOpeningDays,
    generateMapsUrl,
    getPhone,
    getWebsite,
    getOpeningHours,
    type GeoapifyVenue,
} from "@/lib/geoapify";
import { getBoundingBoxCenter, getBoundingBoxRadius } from "@/lib/nominatim";

// Common chain keywords for exclude_chains filter
const CHAIN_KEYWORDS = [
    "starbucks", "mcdonald", "burger king", "subway", "dunkin",
    "costa coffee", "pret a manger", "tim hortons", "kfc",
    "domino", "pizza hut", "taco bell", "wendy", "chick-fil-a",
    "panera", "chipotle", "five guys", "shake shack", "popeyes",
];

export async function POST(req: NextRequest) {
    let campaignId: string | undefined, neighborhoodId: string | undefined, ruleId: string | undefined;
    try {
        const body = await req.json();
        campaignId = body.campaignId;
        neighborhoodId = body.neighborhoodId;
        ruleId = body.ruleId;

        if (!campaignId || !neighborhoodId) {
            return NextResponse.json(
                { error: "Missing campaignId or neighborhoodId" },
                { status: 400 }
            );
        }

        // 1. Get campaign rules (per-venue-type)
        let rulesQuery = supabase
            .from("campaign_rules")
            .select("*")
            .eq("campaign_id", campaignId);

        // If a specific ruleId was provided, only search for that one rule
        if (ruleId) {
            rulesQuery = rulesQuery.eq("id", ruleId);
        }

        const { data: rules, error: rulesErr } = await rulesQuery;

        if (rulesErr || !rules || rules.length === 0) {
            return NextResponse.json(
                { error: "No campaign rules found" },
                { status: 404 }
            );
        }

        // 2. Get neighborhood boundary
        const { data: neighborhood, error: nbErr } = await supabase
            .from("neighborhoods")
            .select("*")
            .eq("id", neighborhoodId)
            .single();

        if (nbErr || !neighborhood) {
            return NextResponse.json({ error: "Neighborhood not found" }, { status: 404 });
        }

        // Update neighborhood status
        await supabase
            .from("neighborhoods")
            .update({ status: "searching" })
            .eq("id", neighborhoodId);

        // 3. Get center and radius
        let centerLat: number, centerLng: number, radius: number;

        if (!neighborhood.boundary_polygon) {
            return NextResponse.json(
                { error: "Neighborhood has no valid boundary data" },
                { status: 400 }
            );
        }

        if (neighborhood.boundary_polygon.boundingbox) {
            const bb = neighborhood.boundary_polygon.boundingbox as (string | number)[];
            const center = getBoundingBoxCenter(bb);
            centerLat = center.lat;
            centerLng = center.lng;
            radius = Math.min(getBoundingBoxRadius(bb), 50000);
        } else if (
            neighborhood.boundary_polygon.lat !== undefined &&
            neighborhood.boundary_polygon.lng !== undefined &&
            neighborhood.boundary_polygon.lat !== null &&
            neighborhood.boundary_polygon.lng !== null
        ) {
            centerLat = Number(neighborhood.boundary_polygon.lat);
            centerLng = Number(neighborhood.boundary_polygon.lng);
            radius = 5000;
        } else {
            return NextResponse.json(
                { error: "Neighborhood has no valid boundary data" },
                { status: 400 }
            );
        }

        console.log(`[search-venues] Center: ${centerLat}, ${centerLng}. Radius: ${radius}`);

        // 4. Search Geoapify for EACH rule's venue type separately
        const allNewVenues: any[] = [];
        let totalFound = 0;
        let totalFiltered = 0;
        let totalDupsSkipped = 0;

        // Get existing place_ids for dedup
        const existingIds = new Set<string>();
        const { data: existingVenues } = await supabase
            .from("venues")
            .select("fsq_id")
            .eq("campaign_id", campaignId);

        if (existingVenues) {
            for (const v of existingVenues) {
                existingIds.add(v.fsq_id);
            }
        }

        for (const rule of rules as CampaignRule[]) {
            // Map venue type to Geoapify categories
            const categories = mapVenueTypes([rule.venue_type]);

            console.log(`[search-venues] Processing rule: ${rule.venue_type} → categories: ${categories}`);

            // Search with pagination (Geoapify uses offset)
            const typeVenues: GeoapifyVenue[] = [];
            let offset = 0;
            const pageSize = 50;

            do {
                const result = await searchVenues(
                    centerLat,
                    centerLng,
                    radius,
                    categories,
                    pageSize,
                    offset
                );

                if (result.venues.length > 0 && typeVenues.length === 0) {
                    console.log(`[search-venues] Sample venue:`, JSON.stringify(result.venues[0], null, 2));
                }

                typeVenues.push(...result.venues);
                offset += pageSize;

                if (!result.hasMore) break;
            } while (typeVenues.length < 300);

            totalFound += typeVenues.length;
            console.log(`[search-venues] Rule ${rule.venue_type}: Found ${typeVenues.length} venues.`);

            // Apply filters
            const filtered = typeVenues.filter((v) => {
                // Chain exclusion
                if (rule.exclude_chains) {
                    const nameLower = v.name.toLowerCase();
                    if (CHAIN_KEYWORDS.some((chain) => nameLower.includes(chain))) {
                        return false;
                    }
                }

                // Keyword exclusion
                if (rule.exclude_keywords && rule.exclude_keywords.length > 0) {
                    const nameLower = v.name.toLowerCase();
                    const addressLower = (v.formatted || "").toLowerCase();
                    if (
                        rule.exclude_keywords.some(
                            (kw) =>
                                nameLower.includes(kw.toLowerCase()) ||
                                addressLower.includes(kw.toLowerCase())
                        )
                    ) {
                        console.log(`[search-venues] REJECTED (Keyword): ${v.name}`);
                        return false;
                    }
                }

                // Opening days filter
                if (rule.min_opening_days > 0) {
                    const hours = getOpeningHours(v);
                    const days = countOpeningDays(hours);
                    if (days !== null && days < rule.min_opening_days) {
                        return false;
                    }
                }

                console.log(`[search-venues] PASSED: ${v.name}`);
                return true;
            });

            totalFiltered += filtered.length;

            // Dedup by place_id
            const newVenues = filtered.filter((v) => !existingIds.has(v.place_id || ""));
            totalDupsSkipped += filtered.length - newVenues.length;

            // Save to Supabase
            for (const v of newVenues) {
                const openingHours = getOpeningHours(v);
                const venueData = {
                    campaign_id: campaignId,
                    neighborhood_id: neighborhoodId,
                    fsq_id: v.place_id || "", // Reuse the fsq_id column for Geoapify place_id
                    name: v.name,
                    address: v.formatted || "",
                    latitude: v.lat || 0,
                    longitude: v.lon || 0,
                    rating: null, // Geoapify (OSM) doesn't have ratings
                    total_ratings: null,
                    opening_hours: openingHours ? { display: openingHours } : null,
                    opening_days_count: countOpeningDays(openingHours),
                    phone: getPhone(v),
                    website: getWebsite(v),
                    google_maps_url: generateMapsUrl(
                        v.lat || 0,
                        v.lon || 0,
                        v.name,
                        v.formatted || ""
                    ),
                    types: v.categories || [],
                    status: "new" as const,
                };

                const { data, error } = await supabase
                    .from("venues")
                    .insert(venueData)
                    .select()
                    .single();

                if (!error && data) {
                    allNewVenues.push(data);
                    existingIds.add(v.place_id || "");
                }
            }
        }

        // Update neighborhood to completed
        await supabase
            .from("neighborhoods")
            .update({
                venues_found: (neighborhood.venues_found || 0) + allNewVenues.length,
                searched_at: new Date().toISOString(),
                status: "completed"
            })
            .eq("id", neighborhoodId);

        // Record this specific search in the tracking table
        if (ruleId) {
            await supabase.from("neighborhood_searches").upsert({
                campaign_id: campaignId,
                neighborhood_id: neighborhoodId,
                rule_id: ruleId,
                venues_found: allNewVenues.length,
                searched_at: new Date().toISOString(),
            }, {
                onConflict: 'neighborhood_id, rule_id'
            });
        }

        return NextResponse.json({
            totalFound,
            filtered: totalFiltered,
            duplicatesSkipped: totalDupsSkipped,
            newVenues: allNewVenues.length,
            venues: allNewVenues,
        });
    } catch (err: any) {
        console.error("[search-venues]", err);

        // Reset status to allow retry if it failed
        if (typeof neighborhoodId !== 'undefined') {
            await supabase
                .from("neighborhoods")
                .update({ status: "new" })
                .eq("id", neighborhoodId);
        }

        return NextResponse.json(
            { error: "Failed to search venues (Server trace): " + err.message },
            { status: 500 }
        );
    }
}
