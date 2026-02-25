import { useState } from "react";
import { type Neighborhood } from "@/lib/supabase";
import { Map, ChevronUp, ChevronDown, Search, Loader2, Trash2, X, Plus } from "lucide-react";

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
    searchVenuesInNeighborhood: (id: string) => void;
    searchingVenues: string | null;
    deleteNeighborhood: (id: string) => void;
}

export function NeighborhoodPanel({
    areaQuery,
    setAreaQuery,
    searchingArea,
    areaResults,
    handleAreaSearch,
    addNeighborhood,
    neighborhoods,
    selectedNeighborhood,
    setSelectedNeighborhood,
    searchVenuesInNeighborhood,
    searchingVenues,
    deleteNeighborhood
}: NeighborhoodPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedNb = neighborhoods.find(n => n.id === selectedNeighborhood);

    return (
        <div className="relative w-full">
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
                <div className="absolute z-20 top-full left-0 mt-2 w-80 bg-surface border border-border rounded-lg shadow-xl overflow-hidden p-4 glass-card">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Map className="w-4 h-4 text-secondary" />
                            Neighborhoods
                        </h3>
                        <button onClick={() => setIsOpen(false)} className="text-muted hover:text-foreground p-1 hover:bg-surface-hover rounded-md transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

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
                            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                                {areaResults.map((area) => (
                                    <button
                                        key={area.osmId}
                                        onClick={() => addNeighborhood(area)}
                                        className="w-full text-left p-3 rounded-xl bg-background hover:bg-surface-hover border border-border text-xs transition-all flex items-center justify-between group"
                                    >
                                        <span className="font-medium text-foreground truncate max-w-[200px]">
                                            {area.name}
                                        </span>
                                        <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Existing neighborhoods */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
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
                        {neighborhoods.map((nb) => (
                            <div
                                key={nb.id}
                                onClick={() => {
                                    setSelectedNeighborhood(nb.id);
                                    setIsOpen(false);
                                }}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${selectedNeighborhood === nb.id
                                    ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                                    : "bg-background border-border hover:border-primary/50"
                                    }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-semibold text-foreground truncate">
                                        {nb.display_name || nb.name}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`badge badge-${nb.status} text-[9px] px-1.5 py-0.5`}>
                                            {nb.status}
                                        </span>
                                        {nb.venues_found > 0 && (
                                            <span className="text-[9px] text-muted font-medium">
                                                {nb.venues_found} leads
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2 ml-3">
                                    {nb.status !== "completed" && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                searchVenuesInNeighborhood(nb.id);
                                            }}
                                            disabled={searchingVenues === nb.id}
                                            className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-50"
                                            title="Search venues"
                                        >
                                            {searchingVenues === nb.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Search className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    )}
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
            )}
        </div>
    );
}
