import { NextRequest, NextResponse } from "next/server";
import { supabase, type CampaignRule } from "@/lib/supabase";
import {
    searchVenues,
    mapVenueTypes,
    countOpeningDays,
    generateMapsUrl,
    type FsqVenue,
} from "@/lib/foursquare";
import { isWithinBoundary } from "@/lib/geo";
import { getBoundingBoxCenter, getBoundingBoxRadius } from "@/lib/nominatim";

// Common chain keywords for exclude_chains filter
const CHAIN_KEYWORDS = [
    "starbucks", "mcdonald", "burger king", "subway", "dunkin",
    "costa coffee", "pret a manger", "tim hortons", "kfc",
    "domino", "pizza hut", "taco bell", "wendy", "chick-fil-a",
    "panera", "chipotle", "five guys", "shake shack", "popeyes",
];

export async function POST(req: NextRequest) {
    try {
        const { campaignId, neighborhoodId } = await req.json();

        if (!campaignId || !neighborhoodId) {
            return NextResponse.json(
                { error: "Missing campaignId or neighborhoodId" },
                { status: 400 }
            );
        }

        // 1. Get campaign rules (per-venue-type)
        const { data: rules, error: rulesErr } = await supabase
            .from("campaign_rules")
            .select("*")
            .eq("campaign_id", campaignId);

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

        if (neighborhood.boundary_polygon?.boundingbox) {
            const bb = neighborhood.boundary_polygon.boundingbox as [string, string, string, string];
            const center = getBoundingBoxCenter(bb);
            centerLat = center.lat;
            centerLng = center.lng;
            radius = Math.min(getBoundingBoxRadius(bb), 50000);
        } else if (neighborhood.boundary_polygon?.lat && neighborhood.boundary_polygon?.lng) {
            centerLat = neighborhood.boundary_polygon.lat as number;
            centerLng = neighborhood.boundary_polygon.lng as number;
            radius = 5000;
        } else {
            return NextResponse.json(
                { error: "Neighborhood has no valid boundary data" },
                { status: 400 }
            );
        }

        // 4. Search Foursquare for EACH rule's venue type separately
        const allNewVenues = [];
        let totalFound = 0;
        let totalFiltered = 0;
        let totalDupsSkipped = 0;

        // Get existing fsq_ids for dedup
        const existingFsqIds = new Set<string>();
        const { data: existingVenues } = await supabase
            .from("venues")
            .select("fsq_id")
            .eq("campaign_id", campaignId);

        if (existingVenues) {
            for (const v of existingVenues) {
                existingFsqIds.add(v.fsq_id);
            }
        }

        for (const rule of rules as CampaignRule[]) {
            // Map this rule's venue type to Foursquare category IDs
            const categoryIds = mapVenueTypes([rule.venue_type]);
            if (categoryIds.length === 0) continue;

            // Search with pagination
            const typeVenues: FsqVenue[] = [];
            let cursor: string | undefined;

            do {
                const result = await searchVenues(
                    centerLat,
                    centerLng,
                    radius,
                    categoryIds,
                    50,
                    cursor
                );
                typeVenues.push(...result.venues);
                cursor = result.nextCursor;
            } while (cursor && typeVenues.length < 300);

            totalFound += typeVenues.length;

            // Apply this rule's specific filters
            const filtered = typeVenues.filter((v) => {
                // Rating filter
                if (rule.min_rating > 0 && v.rating && v.rating < rule.min_rating) {
                    return false;
                }

                // Opening days filter
                if (rule.min_opening_days > 0) {
                    const days = countOpeningDays(v.hours);
                    if (days !== null && days < rule.min_opening_days) {
                        return false;
                    }
                }

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
                    const addressLower = (v.location.formatted_address || "").toLowerCase();
                    if (
                        rule.exclude_keywords.some(
                            (kw) =>
                                nameLower.includes(kw.toLowerCase()) ||
                                addressLower.includes(kw.toLowerCase())
                        )
                    ) {
                        return false;
                    }
                }

                // Boundary filter
                if (neighborhood.boundary_polygon?.geojson) {
                    const geo = neighborhood.boundary_polygon.geojson as {
                        type: string;
                        coordinates: unknown;
                    };
                    if (!isWithinBoundary(v.geocodes.main.latitude, v.geocodes.main.longitude, geo)) {
                        return false;
                    }
                }

                return true;
            });

            totalFiltered += filtered.length;

            // Dedup
            const newVenues = filtered.filter((v) => !existingFsqIds.has(v.fsq_id));
            totalDupsSkipped += filtered.length - newVenues.length;

            // Save to Supabase
            for (const v of newVenues) {
                const venueData = {
                    campaign_id: campaignId,
                    neighborhood_id: neighborhoodId,
                    fsq_id: v.fsq_id,
                    name: v.name,
                    address: v.location.formatted_address || v.location.address || "",
                    latitude: v.geocodes.main.latitude,
                    longitude: v.geocodes.main.longitude,
                    rating: v.rating || null,
                    total_ratings: v.stats?.total_ratings || null,
                    opening_hours: v.hours || null,
                    opening_days_count: countOpeningDays(v.hours),
                    phone: v.tel || null,
                    website: v.website || null,
                    google_maps_url: generateMapsUrl(
                        v.geocodes.main.latitude,
                        v.geocodes.main.longitude,
                        v.name
                    ),
                    types: v.categories.map((c) => c.name),
                    status: "new" as const,
                };

                const { data, error } = await supabase
                    .from("venues")
                    .insert(venueData)
                    .select()
                    .single();

                if (!error && data) {
                    allNewVenues.push(data);
                    existingFsqIds.add(v.fsq_id); // Track for cross-type dedup
                }
            }
        }

        // Update neighborhood
        await supabase
            .from("neighborhoods")
            .update({
                status: "completed",
                venues_found: (neighborhood.venues_found || 0) + allNewVenues.length,
                searched_at: new Date().toISOString(),
            })
            .eq("id", neighborhoodId);

        return NextResponse.json({
            totalFound,
            filtered: totalFiltered,
            duplicatesSkipped: totalDupsSkipped,
            newVenues: allNewVenues.length,
            venues: allNewVenues,
        });
    } catch (err) {
        console.error("[search-venues]", err);
        return NextResponse.json(
            { error: "Failed to search venues" },
            { status: 500 }
        );
    }
}
