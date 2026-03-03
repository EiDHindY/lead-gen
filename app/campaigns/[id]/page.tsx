"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCampaignData } from "./hooks/useCampaignData";
import { useNeighborhoods } from "./hooks/useNeighborhoods";
import { useVenues } from "./hooks/useVenues";
import { NeighborhoodPanel } from "./components/NeighborhoodPanel";
import { VenueList } from "./components/VenueList";
import { CampaignRulesDropdown } from "./components/CampaignRulesDropdown";
import { NotionSettingsDialog } from "./components/NotionSettingsDialog";

export default function CampaignDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [showNotionSettings, setShowNotionSettings] = useState(false);

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
        deleteBulkNeighborhoods,
        fetchingSubAreas,
        stagedAreas,
        fetchSubAreas,
        addBulkNeighborhoods,
        addingBulk,
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
        researchMessage,
        searchVenuesInNeighborhood,
        researchPersonnel,
        researchAll,
        stopResearch,
        resetSkippedVenues,
        markAllCalled,
        updateVenueStatus,
        updateVenuePhone,
        deleteVenue,
        exportCSV,
        importVenues,
        handleFileUploads,
        exportToNotion,
        notionExporting,
        notionExportProgress,
        syncVenueBasics,
        syncAllBasics,
        syncingVenue
    } = useVenues(id, venues, loadCampaign, selectedNeighborhood);

    if (loading && !campaign) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] text-muted font-medium">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                    <p className="animate-pulse">Loading campaign...</p>
                </div>
            </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 max-w-4xl">
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
                        deleteBulkNeighborhoods={deleteBulkNeighborhoods}
                        campaignRules={campaignRules}
                        completedSearches={completedSearches}
                        fetchingSubAreas={fetchingSubAreas}
                        stagedAreas={stagedAreas}
                        fetchSubAreas={fetchSubAreas}
                        addBulkNeighborhoods={addBulkNeighborhoods}
                        addingBulk={addingBulk}
                        discardStagedAreas={discardStagedAreas}
                        researchProgress={researchProgress}
                        researchMessage={researchMessage}
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
                    stopResearch={stopResearch}
                    resetSkippedVenues={resetSkippedVenues}
                    researchProgress={researchProgress}
                    researchMessage={researchMessage}
                    exportCSV={exportCSV}
                    personnelMap={personnelMap}
                    expandedVenue={expandedVenue}
                    setExpandedVenue={setExpandedVenue}
                    researchPersonnel={researchPersonnel}
                    researchingVenue={researchingVenue}
                    updateVenueStatus={updateVenueStatus}
                    updateVenuePhone={updateVenuePhone}
                    handleFileUploads={handleFileUploads}
                    campaign={campaign}
                    onOpenNotionSettings={() => setShowNotionSettings(true)}
                    exportToNotion={exportToNotion}
                    notionExporting={notionExporting}
                    notionExportProgress={notionExportProgress}
                    deleteVenue={deleteVenue}
                    syncVenueBasics={syncVenueBasics}
                    syncAllBasics={syncAllBasics}
                    syncingVenue={syncingVenue}
                    searchVenuesInNeighborhood={searchVenuesInNeighborhood}
                    searchingVenues={searchingVenues}
                />
            </div>

            {showNotionSettings && (
                <NotionSettingsDialog
                    campaignId={campaign.id}
                    initialToken={campaign.notion_token}
                    initialDatabaseId={campaign.notion_database_id}
                    onClose={() => setShowNotionSettings(false)}
                    onSaved={() => {
                        setShowNotionSettings(false);
                        loadCampaign();
                    }}
                />
            )}
        </div>
    );
}
