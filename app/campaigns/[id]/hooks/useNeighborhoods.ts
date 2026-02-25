import { useState } from "react";
import { supabase } from "@/lib/supabase";

import { SubAreaResult } from "@/app/api/fetch-sub-areas/route";

export function useNeighborhoods(campaignId: string, loadCampaign: () => Promise<void>) {
    const [areaQuery, setAreaQuery] = useState("");
    const [searchingArea, setSearchingArea] = useState(false);
    const [fetchingSubAreas, setFetchingSubAreas] = useState<{ id: number; loading: boolean }>({ id: 0, loading: false });
    const [stagedAreas, setStagedAreas] = useState<SubAreaResult[]>([]);
    const [areaResults, setAreaResults] = useState<
        Array<{
            osmId: number;
            name: string;
            displayName: string;
            lat: number;
            lng: number;
            boundingbox: string[];
            geojson: { type: string; coordinates: unknown };
        }>
    >([]);
    const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);

    async function handleAreaSearch() {
        if (!areaQuery.trim()) return;
        setSearchingArea(true);
        setAreaResults([]);

        try {
            const res = await fetch(
                `/api/search-area?query=${encodeURIComponent(areaQuery)}`
            );
            const data = await res.json();
            setAreaResults(data.areas || []);
        } catch {
            alert("Failed to search area");
        }

        setSearchingArea(false);
    }

    async function addNeighborhood(area: (typeof areaResults)[0]) {
        const { error } = await supabase.from("neighborhoods").insert({
            campaign_id: campaignId,
            name: area.name,
            display_name: area.displayName,
            boundary_polygon: {
                lat: area.lat,
                lng: area.lng,
                boundingbox: area.boundingbox,
                geojson: area.geojson,
            },
        });

        if (error) {
            alert("Failed to add neighborhood: " + error.message);
            return;
        }

        setAreaQuery("");
        setAreaResults([]);
        loadCampaign();
    }

    async function addBulkNeighborhoods(areas: SubAreaResult[]) {
        if (areas.length === 0) return;

        const inserts = areas.map(area => ({
            campaign_id: campaignId,
            name: area.name,
            display_name: area.displayName,
            boundary_polygon: {
                lat: area.lat,
                lng: area.lon,
                // Overpass centers don't have bounding boxes or geojson immediately.
                // We'd ideally need a Nominatim lookup for the strict polygon,
                // but for now we store the point + radius fallback behavior.
                boundingbox: null,
                geojson: null,
            },
        }));

        const { error } = await supabase.from("neighborhoods").insert(inserts);

        if (error) {
            alert("Failed to add neighborhoods in bulk: " + error.message);
            return;
        }

        loadCampaign();
    }

    async function fetchSubAreas(osmId: number, osmType: string, parentName: string) {
        setFetchingSubAreas({ id: osmId, loading: true });
        setStagedAreas([]); // clear previous

        try {
            const res = await fetch("/api/fetch-sub-areas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ osmId, osmType, parentName }),
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            setStagedAreas(data.subAreas || []);
        } catch (e: any) {
            alert("Failed to fetch sub-areas: " + e.message);
        } finally {
            setFetchingSubAreas({ id: 0, loading: false });
        }
    }

    function discardStagedAreas() {
        setStagedAreas([]);
    }

    async function deleteNeighborhood(neighborhoodId: string) {
        if (!confirm("Delete this neighborhood and its venues?")) return;

        // Delete venues first (cascade doesn't work via client)
        await supabase
            .from("venues")
            .delete()
            .eq("neighborhood_id", neighborhoodId);

        await supabase.from("neighborhoods").delete().eq("id", neighborhoodId);

        loadCampaign();
        if (selectedNeighborhood === neighborhoodId) {
            setSelectedNeighborhood(null);
        }
    }

    return {
        areaQuery,
        setAreaQuery,
        searchingArea,
        areaResults,
        setAreaResults,
        selectedNeighborhood,
        setSelectedNeighborhood,
        handleAreaSearch,
        addNeighborhood,
        deleteNeighborhood,
        fetchingSubAreas,
        stagedAreas,
        fetchSubAreas,
        addBulkNeighborhoods,
        discardStagedAreas
    };
}
