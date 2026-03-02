import { useState, useCallback, useEffect } from "react";
import {
    supabase,
    type Campaign,
    type CampaignRule,
    type Neighborhood,
    type Venue,
    type VenuePersonnel,
} from "@/lib/supabase";

export function useCampaignData(id: string) {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignRules, setCampaignRules] = useState<CampaignRule[]>([]);
    const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [personnelMap, setPersonnelMap] = useState<Record<string, VenuePersonnel[]>>({});
    const [completedSearches, setCompletedSearches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadCampaign = useCallback(async () => {
        if (!campaign) setLoading(true);

        const { data: campaignData } = await supabase
            .from("campaigns")
            .select("*")
            .eq("id", id)
            .single();

        if (campaignData) setCampaign(campaignData);

        const { data: rulesData } = await supabase
            .from("campaign_rules")
            .select("*")
            .eq("campaign_id", id);

        if (rulesData) setCampaignRules(rulesData as CampaignRule[]);

        const { data: neighborhoodData } = await supabase
            .from("neighborhoods")
            .select("*")
            .eq("campaign_id", id)
            .order("created_at", { ascending: true });

        if (neighborhoodData) setNeighborhoods(neighborhoodData);

        const { data: searchHistoryData } = await supabase
            .from("neighborhood_searches")
            .select("*")
            .eq("campaign_id", id);

        if (searchHistoryData) setCompletedSearches(searchHistoryData);

        const { data: venueData } = await supabase
            .from("venues")
            .select("*")
            .eq("campaign_id", id)
            .order("created_at", { ascending: false })
            .limit(5000);

        if (venueData) {
            setVenues(venueData);

            // Load personnel for all venues (chunked to avoid URL length limits)
            const venueIds = venueData.map((v) => v.id);
            if (venueIds.length > 0) {
                const CHUNK_SIZE = 200;
                const allPersonnel: VenuePersonnel[] = [];

                for (let i = 0; i < venueIds.length; i += CHUNK_SIZE) {
                    const chunk = venueIds.slice(i, i + CHUNK_SIZE);
                    const { data: personnelData } = await supabase
                        .from("venue_personnel")
                        .select("*")
                        .in("venue_id", chunk);

                    if (personnelData) {
                        allPersonnel.push(...personnelData);
                    }
                }

                const grouped: Record<string, VenuePersonnel[]> = {};
                for (const p of allPersonnel) {
                    if (!grouped[p.venue_id]) grouped[p.venue_id] = [];
                    grouped[p.venue_id].push(p);
                }
                setPersonnelMap(grouped);
            }
        }

        setLoading(false);
    }, [id]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCampaign();
    }, [loadCampaign]);

    const updateRule = async (ruleId: string, updates: Partial<CampaignRule>) => {
        const { error } = await supabase
            .from("campaign_rules")
            .update(updates)
            .eq("id", ruleId);

        if (error) {
            console.error("Error updating rule:", error);
            alert("Failed to update rule.");
            return;
        }

        // Refresh campaign rules
        const { data: rulesData } = await supabase
            .from("campaign_rules")
            .select("*")
            .eq("campaign_id", id);

        if (rulesData) setCampaignRules(rulesData as CampaignRule[]);
    };

    return {
        campaign,
        campaignRules,
        neighborhoods,
        venues,
        personnelMap,
        completedSearches,
        loading,
        loadCampaign,
        updateRule
    };
}
