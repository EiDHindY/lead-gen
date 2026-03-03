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
    isGenericName,
    type GeoapifyVenue,
} from "@/lib/geoapify";
import { getBoundingBoxCenter, getBoundingBoxRadius, isPointInGeoJSONPolygon } from "@/lib/nominatim";
import { isActivityType, searchActivity } from "@/lib/search-router";

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
        const debugLogs: string[] = [];

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
            // Debug: log the actual type and value of venue_type from DB
            console.log(`[search-venues] rule.venue_type type=${typeof rule.venue_type} value=`, JSON.stringify(rule.venue_type));

            // Ensure venue_type is a string (DB might return unexpected types)
            const venueTypeStr = typeof rule.venue_type === "string"
                ? rule.venue_type
                : String((rule.venue_type as any)?.name ?? (rule.venue_type as any)?.venue_type ?? rule.venue_type ?? "");

            // ═══════════════════════════════════════════════════
            // HYBRID ROUTING: Activity vs Standard venue type
            // ═══════════════════════════════════════════════════
            if (isActivityType(venueTypeStr)) {
                // ── ACTIVITY SEARCH: Foursquare + Overpass in parallel ──
                console.log(`[search-venues] 🎯 ACTIVITY detected: "${venueTypeStr}" → routing to Foursquare + Overpass`);

                const activityResult = await searchActivity(
                    centerLat,
                    centerLng,
                    radius,
                    venueTypeStr
                );

                const stats = `[Activity] FSQ=${activityResult.sources.foursquare}, Overpass=${activityResult.sources.overpass}, Before Dedup=${activityResult.sources.beforeDedup}`;
                debugLogs.push(`Rule "${venueTypeStr}": ${stats}`);
                console.log(`[search-venues] ${stats}`);

                totalFound += activityResult.sources.beforeDedup;

                const activityAudit = { outOfBounds: 0, chain: 0, keyword: 0, isDup: 0 };

                // Apply filters (simplified — no accuracy filter needed since Foursquare does semantic search)
                const filtered = activityResult.venues.filter((v) => {
                    // Point-in-Polygon check
                    if (neighborhood.boundary_polygon?.geojson && v.lon && v.lat) {
                        if (!isPointInGeoJSONPolygon([v.lon, v.lat], neighborhood.boundary_polygon.geojson)) {
                            activityAudit.outOfBounds++;
                            return false;
                        }
                    }

                    // Chain exclusion
                    if (rule.exclude_chains) {
                        const nameLower = String(v.name || "").toLowerCase();
                        if (CHAIN_KEYWORDS.some((chain) => nameLower.includes(chain))) {
                            activityAudit.chain++;
                            return false;
                        }
                    }

                    // Keyword exclusion
                    if (rule.exclude_keywords && rule.exclude_keywords.length > 0) {
                        const nameLower = String(v.name || "").toLowerCase();
                        const addressLower = String(v.address || "").toLowerCase();
                        if (
                            rule.exclude_keywords.some((kw) => {
                                const kwLower = String(kw || "").toLowerCase();
                                return nameLower.includes(kwLower) || addressLower.includes(kwLower);
                            })
                        ) {
                            activityAudit.keyword++;
                            return false;
                        }
                    }

                    console.log(`[search-venues] PASSED (activity): ${v.name} [${v.source}]`);
                    return true;
                });

                const activityAuditStr = `Audit: Bounds=${activityAudit.outOfBounds}, Chain=${activityAudit.chain}, Keyword=${activityAudit.keyword}, Dup=${activityAudit.isDup}`;
                debugLogs.push(`Rule "${venueTypeStr}" Result: ${filtered.length} passed. ${activityAuditStr}`);
                console.log(`[search-venues] Activity Audit for "${venueTypeStr}":`, JSON.stringify(activityAudit, null, 2));
                totalFiltered += filtered.length;

                // Dedup against existing DB venues by ID
                const newVenues = filtered.filter((v) => !existingIds.has(v.id));
                totalDupsSkipped += filtered.length - newVenues.length;

                // Save activity venues to Supabase
                for (const v of newVenues) {
                    const openingDays = v.opening_hours ? countOpeningDays(v.opening_hours) : null;
                    const venueData = {
                        campaign_id: campaignId,
                        neighborhood_id: neighborhoodId,
                        fsq_id: v.id,
                        name: v.name || "Unnamed Venue",
                        address: v.address || "",
                        latitude: v.lat || 0,
                        longitude: v.lon || 0,
                        rating: v.rating,
                        total_ratings: v.total_ratings,
                        opening_hours: v.opening_hours ? { display: v.opening_hours } : null,
                        opening_days_count: openingDays,
                        phone: v.phone,
                        website: v.website,
                        google_maps_url: generateMapsUrl(v.lat, v.lon, v.name, v.address || undefined),
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
                        existingIds.add(v.id);
                    }
                }

                continue; // Skip the Geoapify flow below
            }

            // ── STANDARD SEARCH: Geoapify (existing flow) ──
            // Map venue type to Geoapify categories
            const categories = mapVenueTypes([venueTypeStr]);

            console.log(`[search-venues] Processing rule: ${venueTypeStr} → categories: ${categories}`);

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

                console.log(`[search-venues] Geoapify results for "${venueTypeStr}" (offset ${offset}): Found ${result.venues.length}. (Radius: ${Math.round(radius)}m)`);

                if (result.venues.length > 0 && typeVenues.length === 0) {
                    // console.log(`[search-venues] Sample venue:`, JSON.stringify(result.venues[0], null, 2));
                }

                typeVenues.push(...result.venues);
                offset += pageSize;

                if (!result.hasMore) break;
            } while (typeVenues.length < 300);

            totalFound += typeVenues.length;
            const stats = `[Standard] Geoapify results for "${venueTypeStr}": ${typeVenues.length}`;
            debugLogs.push(`Rule "${venueTypeStr}": ${stats}`);
            console.log(`[search-venues] ${stats}`);

            const rejectionAudit = {
                outOfBounds: 0,
                generic: 0,
                chain: 0,
                keyword: 0,
                openDays: 0,
                accuracy: 0,
                cafeExclusion: 0,
                isDup: 0
            };

            // Apply filters
            const filtered = typeVenues.filter((v) => {
                // Strict Point-in-Polygon check first
                if (neighborhood.boundary_polygon?.geojson && v.lon && v.lat) {
                    if (!isPointInGeoJSONPolygon([v.lon, v.lat], neighborhood.boundary_polygon.geojson)) {
                        rejectionAudit.outOfBounds++;
                        return false;
                    }
                }

                // Rating filter
                if (rule.min_rating > 0 && (v as any).rating !== undefined) {
                    if ((v as any).rating < rule.min_rating) return false;
                }

                // Chain exclusion
                if (rule.exclude_chains) {
                    const nameLower = String(v.name || "").toLowerCase();
                    if (CHAIN_KEYWORDS.some((chain) => nameLower.includes(chain))) {
                        rejectionAudit.chain++;
                        return false;
                    }
                }

                // Keyword exclusion
                if (rule.exclude_keywords && rule.exclude_keywords.length > 0) {
                    const nameLower = String(v.name || "").toLowerCase();
                    const addressLower = String(v.formatted || "").toLowerCase();
                    if (
                        rule.exclude_keywords.some(
                            (kw) => {
                                const kwLower = String(kw || "").toLowerCase();
                                return (
                                    (nameLower && nameLower.includes(kwLower)) ||
                                    (addressLower && addressLower.includes(kwLower))
                                );
                            }
                        )
                    ) {
                        rejectionAudit.keyword++;
                        return false;
                    }
                }

                // Opening days filter
                if (rule.min_opening_days > 0) {
                    const hours = getOpeningHours(v);
                    const days = countOpeningDays(hours);
                    if (days !== null && days < rule.min_opening_days) {
                        rejectionAudit.openDays++;
                        return false;
                    }
                }

                // SECONDARY FILTER: Accuracy Check
                const requestedType = venueTypeStr.toLowerCase();
                const venueFoundTypes = (v.categories || []).join(", ").toLowerCase();
                const venueName = (v.name || "").toLowerCase();

                // 2. EXPLICIT GENERIC POI FILTER (New)
                if (isGenericName(v.name)) {
                    rejectionAudit.generic++;
                    console.log(`[search-venues] REJECTED (Generic Name): ${v.name}`);
                    return false;
                }

                // 1. Keyword Relevance Check
                const specificityKeywords = requestedType.split(/[\s_-]/).filter(kw => kw.length > 2);

                // Add synonyms for common searches (User Request: Bar matches Pub)
                const barKeywords = ["bar", "pub", "taphouse", "club", "lounge", "tavern", "nightclub", "beer", "wine", "cocktail"];
                if (requestedType.includes("bar")) specificityKeywords.push(...barKeywords.filter(kw => kw !== "bar"));
                if (requestedType.includes("pub")) specificityKeywords.push("bar", "taphouse", "tavern", "beer");

                if (specificityKeywords.length > 0) {
                    const matchesTypeOrName = specificityKeywords.some(kw =>
                        venueFoundTypes.includes(kw) || venueName.includes(kw)
                    );

                    // If we're searching for a bar and we found a restaurant, we MUST have a strong keyword match
                    const isRestaurantCategoryOnly = venueFoundTypes.includes("restaurant") &&
                        !venueFoundTypes.includes("bar") &&
                        !venueFoundTypes.includes("pub");

                    if (requestedType.includes("bar") && isRestaurantCategoryOnly) {
                        const hasStrongSignature = barKeywords.some(kw => venueName.includes(kw) || venueFoundTypes.includes(kw));
                        if (!hasStrongSignature) {
                            rejectionAudit.accuracy++;
                            return false;
                        }
                    }

                    if (!matchesTypeOrName && !requestedType.includes("restaurant")) {
                        rejectionAudit.accuracy++;
                        return false;
                    }
                }

                // 3. EXPLICIT CAFE EXCLUSION for Bar searches (User Request)
                const isBarSearch = requestedType.includes("bar") || requestedType === "pub" || requestedType === "nightclub" || requestedType === "lounge";
                const isCafeResult = venueFoundTypes.includes("cafe") || venueFoundTypes.includes("coffee");

                if (isBarSearch && isCafeResult) {
                    // Only allow if the name or categories explicitly contains "bar"/"pub" etc.
                    const hasStrongBarIndicator = venueName.includes("bar") || venueName.includes("pub") ||
                        venueName.includes("taphouse") || venueName.includes("nightclub") ||
                        venueFoundTypes.includes("pub") || venueFoundTypes.includes("nightclub");

                    const matchesSpecificSubtype = specificityKeywords.some(kw => !["bar", "pub"].includes(kw) && venueName.includes(kw));

                    if (!hasStrongBarIndicator && !matchesSpecificSubtype) {
                        rejectionAudit.cafeExclusion++;
                        return false;
                    }
                }

                console.log(`[search-venues] PASSED: ${v.name}`);
                return true;
            });

            const auditStr = `Audit: Bounds=${rejectionAudit.outOfBounds}, Generic=${rejectionAudit.generic}, Chain=${rejectionAudit.chain}, Keyword=${rejectionAudit.keyword}, Accuracy=${rejectionAudit.accuracy}, Days=${rejectionAudit.openDays}`;
            debugLogs.push(`Rule "${venueTypeStr}" Result: ${filtered.length} passed. ${auditStr}`);
            console.log(`[search-venues] Audit Summary for "${venueTypeStr}":`, JSON.stringify(rejectionAudit, null, 2));

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
                    fsq_id: v.place_id || "",
                    name: v.name || v.formatted || "Unnamed Venue",
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

        // 1. Record this specific search in the tracking table first
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

        // 2. Determine final status based on how many rules have been searched
        const { count: searchedCount } = await supabase
            .from("neighborhood_searches")
            .select("*", { count: 'exact', head: true })
            .eq("neighborhood_id", neighborhoodId);

        const { count: totalRulesCount } = await supabase
            .from("campaign_rules")
            .select("*", { count: 'exact', head: true })
            .eq("campaign_id", campaignId);

        // If searched >= total, it's completed. If > 0 but < total, it's searching. 
        // Note: searchedCount will be at least 1 here because we just recorded it.
        const newStatus = (searchedCount || 0) >= (totalRulesCount || 1) ? "completed" : "searching";

        // 3. Update neighborhood
        await supabase
            .from("neighborhoods")
            .update({
                venues_found: (neighborhood.venues_found || 0) + allNewVenues.length,
                searched_at: new Date().toISOString(),
                status: newStatus
            })
            .eq("id", neighborhoodId);

        return NextResponse.json({
            totalFound,
            filtered: totalFiltered,
            duplicatesSkipped: totalDupsSkipped,
            newVenues: allNewVenues.length,
            venues: allNewVenues,
            debug: debugLogs
        });
    } catch (err: any) {
        console.error("[search-venues]", err);

        // Reset status to allow retry if it failed
        if (typeof neighborhoodId !== 'undefined') {
            await supabase
                .from("neighborhoods")
                .update({ status: "pending" })
                .eq("id", neighborhoodId);
        }

        return NextResponse.json(
            { error: "Failed to search venues (Server trace): " + err.message },
            { status: 500 }
        );
    }
}
