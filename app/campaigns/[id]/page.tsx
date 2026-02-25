"use client";

import { useParams } from "next/navigation";
import { useCampaignData } from "./hooks/useCampaignData";
import { useNeighborhoods } from "./hooks/useNeighborhoods";
import { useVenues } from "./hooks/useVenues";
import { NeighborhoodPanel } from "./components/NeighborhoodPanel";
import { VenueList } from "./components/VenueList";
import { CampaignRulesDropdown } from "./components/CampaignRulesDropdown";

export default function CampaignDetailPage() {
    const { id } = useParams<{ id: string }>();

    // Data Loading Hook
    const {
        campaign,
        campaignRules,
        neighborhoods,
        venues,
        personnelMap,
        completedSearches,
        loading,
        loadCampaign,
        updateRule
    } = useCampaignData(id);

    // Neighborhoods Hook
    const {
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
    } = useNeighborhoods(id, loadCampaign);

    // Venues Hook
    const {
        searchingVenues,
        researchingVenue,
        expandedVenue,
        setExpandedVenue,
        showImport,
        setShowImport,
        importText,
        setImportText,
        importing,
        importProgress,
        importResult,
        importSourceName,
        setImportSourceName,
        researchProgress,
        searchVenuesInNeighborhood,
        researchPersonnel,
        researchAll,
        markAllCalled,
        updateVenueStatus,
        exportCSV,
        importVenues,
        handleFileUploads
    } = useVenues(id, venues, loadCampaign);

    if (loading) {
        return (
            <div className="text-center text-muted py-16">Loading campaign...</div>
        );
    }

    if (!campaign) {
        return (
            <div className="text-center text-muted py-16">Campaign not found</div>
        );
    }

    return (
        <div>
            {/* ── Campaign Header ── */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                    {campaign.name}
                </h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-2xl">
                    <CampaignRulesDropdown rules={campaignRules} updateRule={updateRule} />
                    <NeighborhoodPanel
                        areaQuery={areaQuery}
                        setAreaQuery={setAreaQuery}
                        searchingArea={searchingArea}
                        areaResults={areaResults}
                        setAreaResults={setAreaResults}
                        handleAreaSearch={handleAreaSearch}
                        addNeighborhood={addNeighborhood}
                        neighborhoods={neighborhoods}
                        selectedNeighborhood={selectedNeighborhood}
                        setSelectedNeighborhood={setSelectedNeighborhood}
                        searchVenuesInNeighborhood={searchVenuesInNeighborhood}
                        searchingVenues={searchingVenues}
                        deleteNeighborhood={deleteNeighborhood}
                        campaignRules={campaignRules}
                        completedSearches={completedSearches}
                        fetchingSubAreas={fetchingSubAreas}
                        stagedAreas={stagedAreas}
                        fetchSubAreas={fetchSubAreas}
                        addBulkNeighborhoods={addBulkNeighborhoods}
                        discardStagedAreas={discardStagedAreas}
                    />
                </div>
                {campaign.product_description && (
                    <p className="text-sm text-muted mt-2 max-w-2xl">
                        Product: {campaign.product_description}
                    </p>
                )}
            </div>

            <div className="space-y-6">
                {/* ── Venues Table ── */}
                <VenueList
                    venues={venues}
                    selectedNeighborhood={selectedNeighborhood}
                    showImport={showImport}
                    setShowImport={setShowImport}
                    importText={importText}
                    setImportText={setImportText}
                    importing={importing}
                    importProgress={importProgress}
                    importResult={importResult}
                    importSourceName={importSourceName}
                    setImportSourceName={setImportSourceName}
                    importVenues={importVenues}
                    markAllCalled={markAllCalled}
                    researchAll={researchAll}
                    researchProgress={researchProgress}
                    exportCSV={exportCSV}
                    personnelMap={personnelMap}
                    expandedVenue={expandedVenue}
                    setExpandedVenue={setExpandedVenue}
                    researchPersonnel={researchPersonnel}
                    researchingVenue={researchingVenue}
                    updateVenueStatus={updateVenueStatus}
                    handleFileUploads={handleFileUploads}
                />
            </div>
        </div>
    );
}
