import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function useNeighborhoods(campaignId: string, loadCampaign: () => Promise<void>) {
    const [areaQuery, setAreaQuery] = useState("");
    const [searchingArea, setSearchingArea] = useState(false);
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
        selectedNeighborhood,
        setSelectedNeighborhood,
        handleAreaSearch,
        addNeighborhood,
        deleteNeighborhood
    };
}
