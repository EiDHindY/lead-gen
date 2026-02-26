import { useState } from "react";
import { type Neighborhood, type CampaignRule } from "@/lib/supabase";
import { Map, ChevronUp, ChevronDown, Search, Loader2, Trash2, X, Plus, Network, CheckSquare } from "lucide-react";
import { SubAreaResult } from "@/app/api/fetch-sub-areas/route";

interface NeighborhoodPanelProps {
    areaQuery: string;
    setAreaQuery: (query: string) => void;
    searchingArea: boolean;
    areaResults: Array<{
        osmId: number;
        name: string;
        displayName: string;
        lat: number;
        lng: number;
        boundingbox: string[];
        geojson: { type: string; coordinates: unknown };
    }>;
    setAreaResults: (results: any[]) => void;
    handleAreaSearch: () => void;
    addNeighborhood: (area: {
        osmId: number;
        name: string;
        displayName: string;
        lat: number;
        lng: number;
        boundingbox: string[];
        geojson: { type: string; coordinates: unknown };
    }) => void;
    neighborhoods: Neighborhood[];
    selectedNeighborhood: string | null;
    setSelectedNeighborhood: (id: string | null) => void;
    searchVenuesInNeighborhood: (id: string, ruleId?: string) => void;
    searchingVenues: string | null;
    deleteNeighborhood: (id: string) => void;
    deleteBulkNeighborhoods: (ids: string[]) => void;
    campaignRules: CampaignRule[];
    completedSearches: any[];
    fetchingSubAreas: { id: number; loading: boolean };
    stagedAreas: SubAreaResult[];
    fetchSubAreas: (osmId: number, osmType: string, parentName: string) => void;
    addBulkNeighborhoods: (areas: SubAreaResult[]) => void;
    addingBulk: boolean;
    discardStagedAreas: () => void;
}

export function NeighborhoodPanel({
    areaQuery,
    setAreaQuery,
    searchingArea,
    areaResults,
    setAreaResults,
    handleAreaSearch,
    addNeighborhood,
    neighborhoods,
    selectedNeighborhood,
    setSelectedNeighborhood,
    searchVenuesInNeighborhood,
    searchingVenues,
    deleteNeighborhood,
    deleteBulkNeighborhoods,
    campaignRules,
    completedSearches,
    fetchingSubAreas,
    stagedAreas,
    fetchSubAreas,
    addBulkNeighborhoods,
    addingBulk,
    discardStagedAreas
}: NeighborhoodPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedRules, setSelectedRules] = useState<Record<string, string>>({});
    const [selectedStagedIds, setSelectedStagedIds] = useState<Set<number>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "searching" | "completed">("all");

    const selectedNb = neighborhoods.find(n => n.id === selectedNeighborhood);

    function toggleStagedSelection(id: number) {
        const next = new Set(selectedStagedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedStagedIds(next);
    }

    function toggleAllStaged() {
        if (selectedStagedIds.size === stagedAreas.length) {
            setSelectedStagedIds(new Set());
        } else {
            setSelectedStagedIds(new Set(stagedAreas.map(a => a.osmId)));
        }
    }

    const filteredNeighborhoods = neighborhoods.filter((nb) => {
        if (statusFilter === "all") return true;
        return nb.status === statusFilter;
    });

    const isAllSelected = filteredNeighborhoods.length > 0 && filteredNeighborhoods.every(nb => selectedIds.has(nb.id));

    function toggleSelection(id: string) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    }

    function toggleAll() {
        if (isAllSelected) {
            const next = new Set(selectedIds);
            filteredNeighborhoods.forEach(nb => next.delete(nb.id));
            setSelectedIds(next);
        } else {
            const next = new Set(selectedIds);
            filteredNeighborhoods.forEach(nb => next.add(nb.id));
            setSelectedIds(next);
        }
    }

    return (
        <div className="w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full btn-premium justify-between transition-all"
            >
                <span className="flex items-center gap-2">
                    <Map className="w-4 h-4 text-secondary" />
                    {selectedNb ? (selectedNb.display_name || selectedNb.name) : "Select Neighborhood"}
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm">
                    <div className="w-[95vw] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden glass-card flex flex-col h-[85vh]">
                        <div className="p-4 bg-background/50 border-b border-border flex justify-between items-center shrink-0">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Map className="w-4 h-4 text-secondary" />
                                Neighborhoods
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-muted hover:text-foreground p-1 hover:bg-surface-hover rounded-md transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-4 flex-1">
                            {/* Add neighborhood */}
                            <div className="mb-4">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={areaQuery}
                                        onChange={(e) => setAreaQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleAreaSearch()}
                                        placeholder="Search area (e.g. Sydney)..."
                                        className="flex-1 px-3 py-2 rounded-xl bg-background border border-border focus:border-primary focus:outline-none text-xs text-foreground placeholder:text-muted transition-colors"
                                    />
                                    <button
                                        onClick={handleAreaSearch}
                                        disabled={searchingArea}
                                        className="btn-primary-premium p-2 flex items-center justify-center shrink-0 min-w-[40px]"
                                    >
                                        {searchingArea ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    </button>
                                </div>

                                {/* Area search results */}
                                {areaResults.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {areaResults.map((area) => (
                                            <div
                                                key={area.osmId}
                                                className="w-full text-left p-3 rounded-xl bg-background hover:bg-surface-hover border border-border text-xs transition-all flex items-center justify-between group"
                                            >
                                                <span className="font-medium text-foreground truncate max-w-[200px]">
                                                    {area.name}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // Quick heuristic: Only ask Overpass for relations or ways. Most Nominatim results don't expose osm_type cleanly here, so we assume 'relation' for large areas by default unless we know otherwise. 
                                                            // In a real app we'd pass osmType from nominatim API. For now we assume relation.
                                                            fetchSubAreas(area.osmId, 'relation', area.name);
                                                        }}
                                                        disabled={fetchingSubAreas.loading && fetchingSubAreas.id === area.osmId}
                                                        className="p-1.5 rounded-lg hover:bg-primary/20 text-muted hover:text-primary transition-colors disabled:opacity-50"
                                                        title="Fetch Suburbs (Overpass)"
                                                    >
                                                        {fetchingSubAreas.loading && fetchingSubAreas.id === area.osmId ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                                        ) : (
                                                            <Network className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            addNeighborhood(area);
                                                            setStatusFilter("all"); // Ensure it's visible if they had "Completed" filter on
                                                        }}
                                                        className="w-full text-left p-1.5 rounded-lg hover:bg-primary/20 transition-all flex items-center justify-between group"
                                                        title="Add this area directly"
                                                    >
                                                        <Plus className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Staging Table */}
                                {stagedAreas.length > 0 && (
                                    <div className="mt-4 p-3 bg-surface border border-border rounded-xl">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-xs font-bold flex items-center gap-2 text-foreground">
                                                <Network className="w-3.5 h-3.5 text-primary" />
                                                Suburbs Staging ({stagedAreas.length})
                                            </h4>
                                            <button
                                                onClick={() => {
                                                    discardStagedAreas();
                                                    setSelectedStagedIds(new Set());
                                                }}
                                                className="text-[10px] text-danger/80 hover:text-danger hover:underline"
                                            >
                                                Discard
                                            </button>
                                        </div>
                                        <div className="border border-border rounded-lg bg-background">
                                            <table className="w-full text-[10px] text-left">
                                                <thead className="bg-surface sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-2 border-b border-border w-8 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedStagedIds.size === stagedAreas.length && stagedAreas.length > 0}
                                                                onChange={toggleAllStaged}
                                                                className="accent-primary"
                                                            />
                                                        </th>
                                                        <th className="p-2 border-b border-border font-semibold">Name</th>
                                                        <th className="p-2 border-b border-border font-semibold text-right">Size</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {stagedAreas
                                                        .filter(area => area.approxSizeSqKm >= 1.0)
                                                        .map((area, idx) => (
                                                            <tr key={area.osmId} className="border-b border-border hover:bg-surface-hover/50">
                                                                <td className="p-2 text-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedStagedIds.has(area.osmId)}
                                                                        onChange={() => toggleStagedSelection(area.osmId)}
                                                                        className="accent-primary"
                                                                    />
                                                                </td>
                                                                <td className="p-2 truncate max-w-[120px]" title={area.displayName}>
                                                                    {area.name}
                                                                </td>
                                                                <td className="p-2 text-right text-muted whitespace-nowrap">
                                                                    {area.approxSizeSqKm} km²
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="mt-2 flex justify-end">
                                            <button
                                                onClick={() => {
                                                    const selected = stagedAreas.filter(a => selectedStagedIds.has(a.osmId));
                                                    addBulkNeighborhoods(selected);
                                                    setStatusFilter("all");
                                                    // Note: We don't discard right away here anymore so the user sees the list while waiting.
                                                    // The hook's addBulkNeighborhoods will trigger a loadCampaign on success.
                                                    // We'll let the user manually close or we can add a useEffect to clear if needed,
                                                    // but for now keeping it simple.
                                                }}
                                                disabled={selectedStagedIds.size === 0 || addingBulk}
                                                className="btn-primary-premium py-1 px-3 text-[10px] flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {addingBulk ? (
                                                    <>
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        Fetching Boundaries...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="w-3 h-3" />
                                                        Add {selectedStagedIds.size} Selected
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Existing neighborhoods */}
                            <div className="space-y-2">
                                {/* Status Filters */}
                                <div className="flex gap-1 mb-3 bg-background/50 p-1 rounded-lg border border-border">
                                    {[
                                        { id: "all", label: "All" },
                                        { id: "pending", label: "Pending" },
                                        { id: "searching", label: "Searching" },
                                        { id: "completed", label: "Completed" }
                                    ].map((f) => (
                                        <button
                                            key={f.id}
                                            onClick={() => setStatusFilter(f.id as any)}
                                            className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition-all ${statusFilter === f.id
                                                ? "bg-primary text-primary-foreground shadow-sm"
                                                : "text-muted hover:text-foreground hover:bg-surface-hover"
                                                }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between p-2 bg-background/50 rounded-lg border border-border/50 mb-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleAll();
                                            }}
                                            className="w-4 h-4 rounded border border-border bg-background flex items-center justify-center transition-all group-hover:border-primary"
                                        >
                                            {isAllSelected && <CheckSquare className="w-3.5 h-3.5 text-primary" />}
                                        </div>
                                        <span className="text-[10px] text-muted group-hover:text-foreground transition-colors">Select All {statusFilter !== 'all' ? statusFilter : ''}</span>
                                    </label>

                                    {selectedIds.size > 0 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteBulkNeighborhoods(Array.from(selectedIds));
                                                setSelectedIds(new Set());
                                            }}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-danger/10 text-danger hover:bg-danger/20 text-[10px] font-medium transition-all"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            Delete {selectedIds.size}
                                        </button>
                                    )}
                                </div>

                                <div
                                    onClick={() => {
                                        setSelectedNeighborhood(null);
                                        setIsOpen(false);
                                    }}
                                    className={`p-2 rounded-lg border transition-colors cursor-pointer text-xs ${!selectedNeighborhood
                                        ? "bg-primary/20 border-primary"
                                        : "bg-background border-border hover:border-primary/50"
                                        }`}
                                >
                                    All Neighborhoods
                                </div>
                                {filteredNeighborhoods.map((nb) => (
                                    <div
                                        key={nb.id}
                                        onClick={() => {
                                            setSelectedNeighborhood(nb.id);
                                            setIsOpen(false);
                                        }}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${selectedNeighborhood === nb.id
                                            ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                                            : "bg-background border-border hover:border-primary/50"
                                            }`}
                                    >
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSelection(nb.id);
                                            }}
                                            className="w-4 h-4 rounded border border-border bg-background flex items-center justify-center shrink-0 transition-all hover:border-primary"
                                        >
                                            {selectedIds.has(nb.id) && <CheckSquare className="w-3.5 h-3.5 text-primary" />}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className="text-[13px] font-semibold text-foreground truncate">
                                                    {nb.display_name || nb.name}
                                                </div>
                                                <span className={`badge badge-${nb.status} text-[10px] px-1.5 py-0.5 shrink-0`}>
                                                    {nb.status}
                                                </span>
                                            </div>
                                            {nb.venues_found > 0 && (
                                                <div className="mt-0.5">
                                                    <span className="text-[10px] text-muted font-medium">
                                                        {nb.venues_found} leads found
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 ml-3 shrink-0">
                                            <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                                {campaignRules.length > 0 && (
                                                    <select
                                                        value={selectedRules[nb.id] || ""}
                                                        onChange={(e) => setSelectedRules(prev => ({ ...prev, [nb.id]: e.target.value }))}
                                                        className="px-2 py-1 text-xs rounded border border-border bg-background text-foreground"
                                                    >
                                                        <option value="" disabled>Select Type...</option>
                                                        {campaignRules.map(rule => {
                                                            const isCompleted = completedSearches.some(s => s.neighborhood_id === nb.id && s.rule_id === rule.id);
                                                            return (
                                                                <option key={rule.id} value={rule.id}>
                                                                    {isCompleted ? "✓ " : ""}{rule.venue_type}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const ruleToSearch = selectedRules[nb.id] || (campaignRules.length > 0 ? campaignRules[0].id : undefined);
                                                        if (!ruleToSearch && campaignRules.length > 0) {
                                                            alert("Please select a venue type to search");
                                                            return;
                                                        }
                                                        searchVenuesInNeighborhood(nb.id, ruleToSearch);
                                                    }}
                                                    disabled={searchingVenues === nb.id || campaignRules.length === 0}
                                                    className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-50"
                                                    title={campaignRules.length === 0 ? "Add rules first" : "Search specific venue type"}
                                                >
                                                    {searchingVenues === nb.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Search className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteNeighborhood(nb.id);
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-danger/20 text-danger/40 hover:text-danger transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {neighborhoods.length === 0 && (
                                    <p className="text-[10px] text-muted text-center py-2">
                                        Search and add neighborhoods above
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
