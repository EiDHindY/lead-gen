import { Fragment, useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type Venue, type VenuePersonnel, type Campaign } from "@/lib/supabase";
import {
    ClipboardList,
    ChevronDown,
    ChevronUp,
    Import,
    CheckCircle2,
    Rocket,
    Download,
    X,
    FileText,
    Upload,
    Search,
    User,

    Phone,
    SkipForward,
    MapPin,
    ExternalLink,
    Star,
    Eye,
    Plus,
    Mail,
    Lightbulb,
    Hash,
    Loader2,
    Database,
    Settings,
    Trash2,
    RotateCcw,
    Pencil,
    Save
} from "lucide-react";

interface VenueListProps {
    venues: Venue[];
    selectedNeighborhood: string | null;
    showImport: boolean;
    setShowImport: (show: boolean) => void;
    importText: string;
    setImportText: (text: string) => void;
    importing: boolean;
    importProgress: number;
    importResult: string | null;
    importSourceName: string;
    setImportSourceName: (name: string) => void;
    importVenues: () => void;
    handleFileUploads: (files: FileList) => void;
    markAllCalled: () => void;
    researchAll: () => void;
    stopResearch: () => void;
    resetSkippedVenues: () => void;
    researchProgress: number | null;
    researchMessage?: string;
    exportCSV: () => void;
    personnelMap: Record<string, VenuePersonnel[]>;
    expandedVenue: string | null;
    setExpandedVenue: (id: string | null) => void;
    researchPersonnel: (id: string) => void;
    researchingVenue: string | null;
    updateVenueStatus: (id: string, status: "called" | "skipped" | "new") => void;
    updateVenuePhone: (id: string, phone: string) => void;
    deleteVenue: (id: string) => void;
    campaign: Campaign;
    onOpenNotionSettings: () => void;
    exportToNotion: (token: string, dbId: string, venueIds: string[]) => void;
    notionExporting: boolean;
    notionExportProgress: { current: number; total: number } | null;
    syncVenueBasics: (id: string) => Promise<any>;
    syncingVenue: string | null;
    syncAllBasics: () => void;
    searchVenuesInNeighborhood: (neighborhoodId: string, ruleId?: string, customType?: string) => Promise<void>;
    searchingVenues: string | null;
}

export function VenueList({
    venues,
    selectedNeighborhood,
    showImport,
    setShowImport,
    importText,
    setImportText,
    importing,
    importProgress,
    importResult,
    importSourceName,
    setImportSourceName,
    importVenues,
    markAllCalled,
    researchAll,
    stopResearch,
    resetSkippedVenues,
    researchProgress,
    researchMessage,
    exportCSV,
    personnelMap,
    expandedVenue,
    setExpandedVenue,
    researchPersonnel,
    researchingVenue,
    updateVenueStatus,
    updateVenuePhone,
    deleteVenue,
    handleFileUploads,
    campaign,
    onOpenNotionSettings,
    exportToNotion,
    notionExporting,
    notionExportProgress,
    syncVenueBasics,
    syncingVenue,
    syncAllBasics,
    searchVenuesInNeighborhood,
    searchingVenues
}: VenueListProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [visibleCount, setVisibleCount] = useState(50);
    const [viewMode, setViewMode] = useState<'ai' | 'manual'>(
        (searchParams.get("view") as 'ai' | 'manual') || 'manual'
    );
    const [selectedVenueForPanel, setSelectedVenueForPanel] = useState<Venue | null>(null);
    const [lastKeptVenueId, setLastKeptVenueId] = useState<string | null>(
        searchParams.get("lastKept")
    );

    // Sync selections to URL
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());

        // Persist view mode
        params.set("view", viewMode);

        // Persist selected venue
        if (selectedVenueForPanel) {
            params.set("venue", selectedVenueForPanel.id);
        } else {
            params.delete("venue");
        }

        // Persist last kept venue
        if (lastKeptVenueId) {
            params.set("lastKept", lastKeptVenueId);
        } else {
            params.delete("lastKept");
        }

        const newSearch = params.toString();
        const currentSearch = searchParams.toString();

        if (newSearch !== currentSearch) {
            router.replace(`?${newSearch}`, { scroll: false });
        }
    }, [viewMode, selectedVenueForPanel, lastKeptVenueId, router, searchParams]);

    // Initialize venue from URL
    useEffect(() => {
        const venueId = searchParams.get("venue");
        if (venueId && !selectedVenueForPanel && venues.length > 0) {
            const venue = venues.find(v => v.id === venueId);
            if (venue) {
                setSelectedVenueForPanel(venue);
            }
        }
    }, [venues, searchParams, selectedVenueForPanel]);

    const [editingPhoneVenueId, setEditingPhoneVenueId] = useState<string | null>(null);
    const [phoneInput, setPhoneInput] = useState("");
    const [manualSearchType, setManualSearchType] = useState("");
    const [lastThrownVenueId, setLastThrownVenueId] = useState<string | null>(null);
    const [keptVenueIds, setKeptVenueIds] = useState<Set<string>>(new Set());

    function getBestType(types: string[]): string {
        if (!types || types.length === 0) return "";
        // Favor specific types (dotted or long) over generic 'catering'
        const candidate = [...types]
            .filter(t => t !== 'catering' && t !== 'amenity')
            .sort((a, b) => {
                const aDots = (a.match(/\./g) || []).length;
                const bDots = (b.match(/\./g) || []).length;
                if (bDots !== aDots) return bDots - aDots;
                return b.length - a.length;
            })[0] || types[0] || "";

        return candidate.split('.').pop()?.replace(/_/g, ' ') || "";
    }

    useEffect(() => {
        if (campaign?.id) {
            const stored = localStorage.getItem(`kept_venues_${campaign.id}`);
            if (stored) {
                try {
                    setKeptVenueIds(new Set(JSON.parse(stored)));
                } catch { }
            }
        }
    }, [campaign?.id]);

    const filteredVenues = useMemo(() => {
        return venues.filter(
            v => v.status !== "skipped" &&
                (!selectedNeighborhood || v.neighborhood_id === selectedNeighborhood)
        );
    }, [venues, selectedNeighborhood]);

    const { displayedVenues, hasMore } = useMemo(() => {
        return {
            displayedVenues: filteredVenues.slice(0, visibleCount),
            hasMore: filteredVenues.length > visibleCount
        };
    }, [filteredVenues, visibleCount]);

    const moveToNextVenue = () => {
        if (!selectedVenueForPanel) return;
        const currentIndex = filteredVenues.findIndex(v => v.id === selectedVenueForPanel.id);
        if (currentIndex < filteredVenues.length - 1) {
            setSelectedVenueForPanel(filteredVenues[currentIndex + 1]);
        } else {
            setSelectedVenueForPanel(null);
        }
    };

    const handleKeep = () => {
        if (!selectedVenueForPanel) return;
        const currentId = selectedVenueForPanel.id;

        setLastKeptVenueId(currentId);

        setKeptVenueIds(prev => {
            const next = new Set(prev);
            next.add(currentId);
            if (campaign?.id) {
                localStorage.setItem(`kept_venues_${campaign.id}`, JSON.stringify(Array.from(next)));
            }
            return next;
        });

        moveToNextVenue();
    };

    const handlePrevious = () => {
        if (!selectedVenueForPanel) return;
        const currentIndex = filteredVenues.findIndex(v => v.id === selectedVenueForPanel.id);
        if (currentIndex > 0) {
            setSelectedVenueForPanel(filteredVenues[currentIndex - 1]);
        }
    };

    const handleUndo = async () => {
        if (!lastThrownVenueId) return;
        const venue = venues.find(v => v.id === lastThrownVenueId);
        if (venue) {
            await updateVenueStatus(lastThrownVenueId, "new");
            setSelectedVenueForPanel(venue);
            setLastThrownVenueId(null);
        }
    };

    const handleThrow = () => {
        if (!selectedVenueForPanel) return;
        const currentId = selectedVenueForPanel.id;
        setLastThrownVenueId(currentId);

        setKeptVenueIds(prev => {
            const next = new Set(prev);
            next.delete(currentId);
            if (campaign?.id) {
                localStorage.setItem(`kept_venues_${campaign.id}`, JSON.stringify(Array.from(next)));
            }
            return next;
        });

        moveToNextVenue();
        updateVenueStatus(currentId, "skipped");
    };

    return (
        <div className="flex gap-6 items-start">
            <div className={`transition-all duration-500 ease-in-out ${selectedVenueForPanel ? "flex-1 min-w-0" : "w-full"}`}>
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="text-lg font-bold text-foreground hover:text-primary transition-all flex items-center gap-3 group"
                            >
                                <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                    <ClipboardList className="w-5 h-5" />
                                </div>
                                Venues ({filteredVenues.length} / {venues.length})
                                <span className={`text-muted transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}>
                                    <ChevronDown className="w-4 h-4" />
                                </span>
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-surface/50 p-1 rounded-lg border border-border/50 mr-2">
                                <button
                                    onClick={() => setViewMode('ai')}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'ai'
                                        ? "bg-primary text-white shadow-sm"
                                        : "text-muted hover:text-foreground"
                                        }`}
                                >
                                    <Rocket className="w-3 h-3" />
                                    AI View
                                </button>
                                <button
                                    onClick={() => setViewMode('manual')}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'manual'
                                        ? "bg-secondary text-white shadow-sm"
                                        : "text-muted hover:text-foreground"
                                        }`}
                                >
                                    <User className="w-3 h-3" />
                                    Manual Mode
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {viewMode === 'ai' ? (
                                    <>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowImport(!showImport)}
                                                className={`btn-premium ${showImport
                                                    ? "bg-muted text-foreground"
                                                    : "text-warning bg-warning/5 border-warning/20 hover:bg-warning/10"
                                                    }`}
                                            >
                                                {showImport ? <X className="w-4 h-4" /> : <Import className="w-4 h-4" />}
                                                {showImport ? "Close" : "Import"}
                                            </button>
                                            {venues.some((v) => v.status === "new" || v.status === "researched") && (
                                                <button
                                                    onClick={markAllCalled}
                                                    className="btn-premium text-success bg-success/5 border-success/20 hover:bg-success/10 whitespace-nowrap shrink-0"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    <span className="hidden sm:inline">Mark All Called</span>
                                                </button>
                                            )}
                                            {venues.length > 0 && venues.some(v => v.status === 'skipped') && (
                                                <button
                                                    onClick={resetSkippedVenues}
                                                    className="px-3 py-2 text-xs font-medium bg-surface hover:bg-surface-hover border border-border rounded-lg text-muted hover:text-foreground transition-colors flex items-center gap-2"
                                                    title="Reset all skipped venues back to 'new' for re-research"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Reset Skipped</span>
                                                </button>
                                            )}
                                            {venues.some((v) => v.status === "new") && (
                                                <button
                                                    onClick={researchAll}
                                                    className="btn-secondary-premium whitespace-nowrap shrink-0"
                                                >
                                                    <Rocket className="w-4 h-4 animate-pulse" />
                                                    <span className="hidden sm:inline">Research All</span>
                                                </button>
                                            )}
                                        </div>

                                        {venues.length > 0 && (
                                            <div className="flex items-center gap-2 ml-auto">
                                                <button
                                                    onClick={exportCSV}
                                                    className="btn-primary-premium shadow-lg"
                                                    title="Export to CSV"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    <span className="hidden sm:inline">CSV</span>
                                                </button>

                                                <div className="flex bg-surface border border-border rounded-lg overflow-hidden shadow-lg">
                                                    <button
                                                        onClick={() => {
                                                            if (campaign.notion_token && campaign.notion_database_id) {
                                                                const activeVenues = filteredVenues.filter(v => v.status !== 'skipped');
                                                                if (activeVenues.length === 0) {
                                                                    alert("No active venues to export.");
                                                                    return;
                                                                }

                                                                const unexportedVenues = activeVenues.filter(v => !v.notion_exported);
                                                                const alreadyExportedCount = activeVenues.length - unexportedVenues.length;
                                                                let venueIdsToExport = activeVenues.map(v => v.id);

                                                                if (alreadyExportedCount > 0) {
                                                                    if (unexportedVenues.length === 0) {
                                                                        if (!window.confirm(`All ${activeVenues.length} leads have already been pushed to Notion. Push them again?`)) return;
                                                                    } else {
                                                                        const pushOnlyNew = window.confirm(
                                                                            `${alreadyExportedCount} leads were already pushed, while ${unexportedVenues.length} are new.\n\n` +
                                                                            `Click OK to export ONLY the ${unexportedVenues.length} new leads.\n` +
                                                                            `Click Cancel to export ALL ${activeVenues.length} leads again.`
                                                                        );
                                                                        if (pushOnlyNew) venueIdsToExport = unexportedVenues.map(v => v.id);
                                                                    }
                                                                } else {
                                                                    if (!window.confirm(`Export all ${venueIdsToExport.length} leads to Notion?`)) return;
                                                                }

                                                                exportToNotion(campaign.notion_token, campaign.notion_database_id, venueIdsToExport);
                                                            } else {
                                                                onOpenNotionSettings();
                                                            }
                                                        }}
                                                        disabled={notionExporting}
                                                        className="px-4 py-2 text-sm font-medium hover:bg-surface-hover flex items-center gap-2 border-r border-border text-foreground transition-colors"
                                                    >
                                                        {notionExporting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Database className="w-4 h-4 text-foreground" />}
                                                        <span className="hidden sm:inline">
                                                            {notionExporting ? `Notion (${notionExportProgress?.current}/${notionExportProgress?.total})` : "Notion"}
                                                        </span>
                                                    </button>
                                                    <button
                                                        onClick={onOpenNotionSettings}
                                                        className="px-2 py-2 hover:bg-surface-hover flex items-center justify-center transition-colors bg-surface"
                                                        title="Notion Integration Settings"
                                                    >
                                                        <Settings className="w-4 h-4 text-muted hover:text-foreground" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex gap-2">
                                        {venues.some(v => v.status === 'new' || !v.rating) && (
                                            <button
                                                onClick={syncAllBasics}
                                                className="btn-premium text-primary bg-primary/5 border-primary/20 hover:bg-primary/10 whitespace-nowrap shrink-0"
                                                title="Fetch official Google info for all unresearched venues"
                                            >
                                                <RotateCcw className={`w-4 h-4 ${researchProgress !== null ? "animate-spin" : ""}`} />
                                                <span className="hidden sm:inline">Fetch Google Venue Types</span>
                                            </button>
                                        )}

                                        {selectedNeighborhood && (
                                            <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border/50 shrink-0">
                                                <input
                                                    type="text"
                                                    value={manualSearchType}
                                                    onChange={(e) => setManualSearchType(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchVenuesInNeighborhood(selectedNeighborhood, undefined, manualSearchType)}
                                                    placeholder="Type (e.g. Cafe)"
                                                    className="w-24 px-2 py-1.5 rounded-lg bg-surface-hover border border-border focus:border-primary/50 focus:outline-none text-[10px] text-foreground placeholder:text-muted"
                                                />
                                                <button
                                                    onClick={() => searchVenuesInNeighborhood(selectedNeighborhood, undefined, manualSearchType)}
                                                    disabled={searchingVenues !== null || !manualSearchType.trim()}
                                                    className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all border border-primary/20 disabled:opacity-50 shrink-0"
                                                    title="Fetch this type from Google Maps"
                                                >
                                                    {searchingVenues ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Import Panel */}
                {showImport && (
                    <div className="mb-6 p-4 rounded-lg bg-surface border border-border">
                        <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            Paste Existing Venues
                        </h3>
                        <p className="text-xs text-muted mb-3">
                            Paste venue names and addresses — one venue name per line, followed by its address on the next line.
                        </p>

                        <div className="mb-3">
                            <label className="block text-xs font-medium text-foreground mb-1">
                                Source / List Name (Optional)
                            </label>
                            <input
                                type="text"
                                value={importSourceName}
                                onChange={(e) => setImportSourceName(e.target.value)}
                                placeholder="e.g., March 2024 Trade Show List"
                                className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted"
                            />
                        </div>

                        <textarea
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder={`Bondi Public Bar\n180 Campbell Parade, Bondi Beach NSW 2026\n\nSalty's Bondi\n108 Campbell Parade, Bondi Beach NSW 2026`}
                            rows={8}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted font-mono resize-none mb-3"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={importVenues}
                                disabled={importing || !importText.trim()}
                                className="btn-primary-premium"
                            >
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {importing ? "Importing..." : "Import Paste"}
                            </button>

                            <input
                                type="file"
                                multiple
                                accept=".md,.txt"
                                onChange={(e) => e.target.files && handleFileUploads(e.target.files)}
                                className="hidden"
                                id="venue-file-upload"
                            />
                            <label
                                htmlFor="venue-file-upload"
                                className={`btn-premium text-secondary bg-secondary/5 border-secondary/20 hover:bg-secondary/10 cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <Upload className="w-4 h-4" />
                                Upload Files (.md, .txt)
                            </label>

                            {importing && (
                                <div className="mt-4">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                                            Import Progress
                                        </span>
                                        <span className="text-xs font-mono text-primary">
                                            {importProgress}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-surface-hover rounded-full overflow-hidden border border-border/50">
                                        <div
                                            className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                                            style={{ width: `${importProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {importResult && (
                                <div className="mt-3">
                                    <span className={`text-sm ${importResult.includes('❌') ? 'text-danger' : 'text-success'}`}>
                                        {importResult}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {researchProgress !== null && (
                    <div className="mb-6 p-4 rounded-xl bg-secondary/5 border border-secondary/20 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-secondary animate-pulse-glow">🤖</span>
                                    <span className="text-sm font-medium text-foreground">
                                        {researchMessage || "AI Researching Venues..."}
                                    </span>
                                </div>
                                <button
                                    onClick={stopResearch}
                                    className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 rounded transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                                >
                                    <X className="w-2.5 h-2.5" />
                                    Stop
                                </button>
                            </div>
                            <span className="text-xs font-mono text-secondary">{researchProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary/10 rounded-full overflow-hidden border border-secondary/20">
                            <div
                                className="h-full bg-secondary transition-all duration-500 ease-out shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                                style={{ width: `${researchProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {!isCollapsed && (
                    <>
                        {venues.length === 0 ? (
                            <p className="text-center text-muted py-12">
                                No venues yet. Add neighborhoods and search, or paste existing venues!
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th className="w-12 text-center">
                                                    <Hash className="w-3 h-3 mx-auto" />
                                                </th>
                                                <th>Venue</th>

                                                {viewMode === 'ai' && (
                                                    <>
                                                        <th>Phone</th>
                                                        <th>Personnel</th>
                                                        <th>Status</th>
                                                    </>
                                                )}
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedVenues.map((venue, index) => {
                                                const personnel = personnelMap[venue.id] || [];
                                                const isExpanded = expandedVenue === venue.id;

                                                return (
                                                    <Fragment key={venue.id}>
                                                        <tr
                                                            className={`cursor-pointer transition-colors ${selectedVenueForPanel?.id === venue.id
                                                                ? "bg-primary/20 hover:bg-primary/30"
                                                                : "hover:bg-surface-hover/50"
                                                                }`}
                                                            onClick={() =>
                                                                setExpandedVenue(
                                                                    isExpanded ? null : venue.id
                                                                )
                                                            }
                                                        >
                                                            <td className="text-center text-muted font-mono text-xs relative group/kept">
                                                                {keptVenueIds.has(venue.id) ? (
                                                                    <div className="flex flex-col items-center justify-center">
                                                                        <CheckCircle2 className="w-3 h-3 text-success animate-in fade-in zoom-in duration-300" />
                                                                        <span className="text-[7px] text-success font-bold uppercase tracking-tighter mt-0.5">Kept</span>
                                                                    </div>
                                                                ) : (
                                                                    index + 1
                                                                )}
                                                            </td>
                                                            <td>
                                                                <div className="flex items-center gap-2">
                                                                    {(() => {
                                                                        try {
                                                                            const raw = JSON.parse(venue.ai_research_raw || "{}");
                                                                            if (raw.is_permanently_closed) {
                                                                                return (
                                                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-danger/10 border border-danger/20 text-danger text-[9px] font-bold uppercase tracking-wider mb-1">
                                                                                        <X className="w-2.5 h-2.5" />
                                                                                        Permanently Closed
                                                                                    </div>
                                                                                );
                                                                            }
                                                                        } catch (e) { }
                                                                        return null;
                                                                    })()}
                                                                    <div className={`font-medium text-foreground ${(() => {
                                                                        try {
                                                                            const raw = JSON.parse(venue.ai_research_raw || "{}");
                                                                            return raw.is_permanently_closed ? "line-through opacity-50" : "";
                                                                        } catch (e) { return "" }
                                                                    })()}`}>
                                                                        {venue.name}
                                                                    </div>
                                                                    {venue.ai_research_raw && (() => {
                                                                        try {
                                                                            const raw = JSON.parse(venue.ai_research_raw);
                                                                            const isSynced = raw.synced_basics;
                                                                            if (isSynced) {
                                                                                return (
                                                                                    <span title={`Synced with Google Maps${raw.synced_at ? ` on ${new Date(raw.synced_at).toLocaleDateString()}` : ""}${raw.status_reason ? `\n\nAI Status: ${raw.status_reason}` : ""}`}>
                                                                                        <CheckCircle2 className="w-3.5 h-3.5 text-success/70" />
                                                                                    </span>
                                                                                );
                                                                            }
                                                                        } catch (e) {
                                                                            // Fallback: If it's not valid JSON but has AI research results, we don't show the maps check
                                                                            return null;
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                    {(venue.name.toLowerCase().includes("unknown") || venue.name === "Venue") && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                syncVenueBasics(venue.id);
                                                                            }}
                                                                            className={`p-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-primary/20 ${syncingVenue === venue.id ? "animate-pulse" : ""}`}
                                                                            title="Try to find official name on Google Maps"
                                                                            disabled={syncingVenue === venue.id}
                                                                        >
                                                                            {syncingVenue === venue.id ? (
                                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                            ) : (
                                                                                <Search className="w-3 h-3" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-muted truncate max-w-[200px]">
                                                                    {venue.address}
                                                                </div>
                                                            </td>

                                                            {viewMode === 'ai' && (
                                                                <td>
                                                                    <div className="flex items-center gap-2 group">
                                                                        {editingPhoneVenueId === venue.id ? (
                                                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                                <input
                                                                                    autoFocus
                                                                                    type="text"
                                                                                    value={phoneInput}
                                                                                    onChange={(e) => setPhoneInput(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') {
                                                                                            updateVenuePhone(venue.id, phoneInput);
                                                                                            setEditingPhoneVenueId(null);
                                                                                        } else if (e.key === 'Escape') {
                                                                                            setEditingPhoneVenueId(null);
                                                                                        }
                                                                                    }}
                                                                                    className="bg-surface border border-primary/50 text-foreground text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary w-32"
                                                                                />
                                                                                <button
                                                                                    onClick={() => {
                                                                                        updateVenuePhone(venue.id, phoneInput);
                                                                                        setEditingPhoneVenueId(null);
                                                                                    }}
                                                                                    className="p-1 text-success hover:bg-success/10 rounded"
                                                                                >
                                                                                    <Save className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                {venue.phone ? (
                                                                                    <a
                                                                                        href={`tel:${venue.phone}`}
                                                                                        className="flex items-center gap-1.5 text-info hover:text-info/80 font-medium transition-colors"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <Phone className="w-3.5 h-3.5" />
                                                                                        {venue.phone}
                                                                                    </a>
                                                                                ) : (
                                                                                    <span className="text-muted/50">—</span>
                                                                                )}
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setEditingPhoneVenueId(venue.id);
                                                                                        setPhoneInput(venue.phone || "");
                                                                                    }}
                                                                                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-surface-hover rounded transition-all text-muted hover:text-foreground"
                                                                                    title="Edit phone number"
                                                                                >
                                                                                    <Pencil className="w-3 h-3" />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {viewMode === 'ai' && (
                                                                <>
                                                                    <td>
                                                                        {personnel.length > 0 ? (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <User className="w-3.5 h-3.5 text-secondary" />
                                                                                <span className="badge badge-researched text-[10px]">
                                                                                    {personnel.length} found
                                                                                </span>
                                                                                {venue.model_used && (
                                                                                    <span className="text-[9px] text-muted-foreground/60 bg-muted/20 px-1 rounded-sm border border-muted/30" title="Model used for research">
                                                                                        {venue.model_used.includes('pro') ? '💎 Pro' : '⚡ Flash'}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : venue.status === "new" ? (
                                                                            <span className="text-muted/50 text-[10px] italic">
                                                                                Not researched
                                                                            </span>
                                                                        ) : venue.status === "researched" ? (
                                                                            <span className="text-muted/50 text-[10px]">
                                                                                0 found
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-muted/50">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td>
                                                                        <span className={`badge badge-${venue.status}`}>
                                                                            {venue.status}
                                                                        </span>
                                                                    </td>
                                                                </>
                                                            )}
                                                            <td onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex gap-1">
                                                                    {viewMode === 'ai' && venue.status === "new" && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                researchPersonnel(venue.id);
                                                                            }}
                                                                            disabled={researchingVenue === venue.id}
                                                                            className="p-1.5 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all border border-secondary/20 disabled:opacity-50"
                                                                            title="Research personnel"
                                                                        >
                                                                            {researchingVenue === venue.id
                                                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                : <Rocket className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                    )}
                                                                    {viewMode === 'ai' && venue.status !== "called" && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                updateVenueStatus(venue.id, "called");
                                                                            }}
                                                                            className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-all border border-success/20"
                                                                            title="Mark as called"
                                                                        >
                                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                    {viewMode === 'ai' && venue.status !== "skipped" && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                updateVenueStatus(venue.id, "skipped");
                                                                            }}
                                                                            className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-all border border-danger/20"
                                                                            title="Skip"
                                                                        >
                                                                            <SkipForward className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                    {venue.google_maps_url && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setSelectedVenueForPanel(venue);
                                                                            }}
                                                                            className="p-1.5 rounded-lg bg-info/10 text-info hover:bg-info/20 transition-all border border-info/20"
                                                                            title="View on Map"
                                                                        >
                                                                            <MapPin className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                    {viewMode === 'ai' && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (venue.notion_exported) {
                                                                                    if (!window.confirm("This venue has already been pushed to Notion. Push it again?")) return;
                                                                                }
                                                                                if (campaign.notion_token && campaign.notion_database_id) {
                                                                                    exportToNotion(campaign.notion_token, campaign.notion_database_id, [venue.id]);
                                                                                } else {
                                                                                    onOpenNotionSettings();
                                                                                }
                                                                            }}
                                                                            disabled={notionExporting}
                                                                            className={`p-1.5 rounded-lg transition-all border ${venue.notion_exported
                                                                                ? "bg-secondary/20 text-secondary border-secondary/30 hover:bg-secondary/30"
                                                                                : "bg-foreground/5 text-foreground hover:bg-foreground/10 border-border"
                                                                                }`}
                                                                            title={venue.notion_exported ? "Push to Notion again" : "Export to Notion"}
                                                                        >
                                                                            {notionExporting && notionExportProgress?.total === 1 ? (
                                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                            ) : (
                                                                                <Database className="w-3.5 h-3.5" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            deleteVenue(venue.id);
                                                                        }}
                                                                        className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-all border border-danger/20"
                                                                        title="Delete venue permanently"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {/* Expanded details */}
                                                        {isExpanded && (
                                                            <tr key={`${venue.id}-details`}>
                                                                <td colSpan={viewMode === 'ai' ? 6 : 3} className="!p-0">
                                                                    <div className="bg-surface/50 p-6 border-t border-border">
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                            {/* Venue Info */}
                                                                            <div>
                                                                                <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                                                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                                                    Venue Details
                                                                                </h4>
                                                                                <dl className="space-y-2 text-sm">
                                                                                    <div>
                                                                                        <dt className="text-muted">Address</dt>
                                                                                        <dd>{venue.address || "—"}</dd>
                                                                                    </div>
                                                                                    <div>
                                                                                        <dt className="text-muted">Phone</dt>
                                                                                        <dd>{venue.phone || "—"}</dd>
                                                                                    </div>
                                                                                    <div>
                                                                                        <dt className="text-muted">Website</dt>
                                                                                        <dd>
                                                                                            {venue.website ? (
                                                                                                <a
                                                                                                    href={venue.website}
                                                                                                    target="_blank"
                                                                                                    rel="noopener noreferrer"
                                                                                                    className="text-info hover:underline"
                                                                                                >
                                                                                                    {venue.website}
                                                                                                </a>
                                                                                            ) : (
                                                                                                "—"
                                                                                            )}
                                                                                        </dd>
                                                                                    </div>
                                                                                    <div>
                                                                                        <dt className="text-muted">
                                                                                            Days Open
                                                                                        </dt>
                                                                                        <dd>
                                                                                            {venue.opening_days_count
                                                                                                ? `${venue.opening_days_count} days/week`
                                                                                                : "—"}
                                                                                        </dd>
                                                                                    </div>
                                                                                    <div>
                                                                                        <dt className="text-muted">
                                                                                            Categories
                                                                                        </dt>
                                                                                        <dd>
                                                                                            {venue.types?.join(", ") || "—"}
                                                                                        </dd>
                                                                                    </div>
                                                                                </dl>
                                                                            </div>

                                                                            {/* Personnel */}
                                                                            <div>
                                                                                <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                                                                                    <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
                                                                                    Key Personnel
                                                                                </h4>
                                                                                {personnel.length > 0 ? (
                                                                                    <div className="space-y-3">
                                                                                        {personnel.map((p) => (
                                                                                            <div
                                                                                                key={p.id}
                                                                                                className="p-3 rounded-lg bg-background border border-border"
                                                                                            >
                                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                                    <span className="font-medium text-foreground">
                                                                                                        {p.name}
                                                                                                    </span>
                                                                                                    {p.title && (
                                                                                                        <span className="badge badge-new">
                                                                                                            {p.title}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                {p.phone && (
                                                                                                    <div className="flex items-center gap-2 text-xs text-info hover:text-info/80 transition-colors mt-1 font-medium">
                                                                                                        <Phone className="w-3 h-3" />
                                                                                                        {p.phone}
                                                                                                    </div>
                                                                                                )}
                                                                                                {p.email && (
                                                                                                    <div className="flex items-center gap-2 text-xs text-info hover:text-info/80 transition-colors mt-1 font-medium">
                                                                                                        <Mail className="w-3 h-3" />
                                                                                                        {p.email}
                                                                                                    </div>
                                                                                                )}
                                                                                                {p.recommended_pitch && (
                                                                                                    <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-foreground/80 italic flex gap-2">
                                                                                                        <Lightbulb className="w-4 h-4 text-primary shrink-0" />
                                                                                                        <span>{p.recommended_pitch}</span>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="space-y-4">
                                                                                        <p className="text-sm text-muted">
                                                                                            {venue.status === "new"
                                                                                                ? "No personnel found yet. Click 🤖 to research."
                                                                                                : "AI could not find any verifiable personnel for this venue."}
                                                                                        </p>

                                                                                        {venue.ai_research_raw && (
                                                                                            <div className="p-3 rounded-lg bg-surface border border-border/50">
                                                                                                <div className="text-[10px] uppercase tracking-wider text-muted mb-2 font-bold">AI Research Notes</div>
                                                                                                <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">
                                                                                                    {(() => {
                                                                                                        try {
                                                                                                            const raw = venue.ai_research_raw;
                                                                                                            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
                                                                                                            const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
                                                                                                            const parsed = JSON.parse(jsonStr);
                                                                                                            return parsed.reason || raw;
                                                                                                        } catch {
                                                                                                            return venue.ai_research_raw;
                                                                                                        }
                                                                                                    })()}
                                                                                                </p>
                                                                                            </div>
                                                                                        )}

                                                                                        {venue.status === "researched" && (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    researchPersonnel(venue.id);
                                                                                                }}
                                                                                                disabled={researchingVenue === venue.id}
                                                                                                className="text-xs text-primary hover:underline flex items-center gap-1 mt-2"
                                                                                            >
                                                                                                {researchingVenue === venue.id ? (
                                                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                                                ) : (
                                                                                                    <RotateCcw className="w-3 h-3" />
                                                                                                )}
                                                                                                Try Research Again
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {hasMore && (
                                    <div className="mt-6 flex flex-col items-center gap-3 border-t border-border pt-6">
                                        <p className="text-xs text-muted">
                                            Showing {displayedVenues.length} of {filteredVenues.length} venues
                                        </p>
                                        <button
                                            onClick={() => setVisibleCount(prev => prev + 50)}
                                            className="btn-premium px-8"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Load More (50)
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
            {selectedVenueForPanel && (
                <div className="w-full max-w-lg sticky top-24 animate-in slide-in-from-right duration-500 px-1">
                    <div className="bg-surface border border-border shadow-2xl rounded-2xl flex flex-col h-[calc(100vh-10rem)] overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-surface/50 backdrop-blur-md">
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-foreground truncate">{selectedVenueForPanel?.name}</h2>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    <p className="text-[10px] text-muted flex items-center gap-1.5 truncate">
                                        <MapPin className="w-3 h-3" />
                                        {selectedVenueForPanel?.address}
                                    </p>
                                    {selectedVenueForPanel?.types && selectedVenueForPanel.types.length > 0 && (
                                        <div className="flex gap-1.5">
                                            <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider border border-primary/20 shadow-sm">
                                                {getBestType(selectedVenueForPanel.types)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => selectedVenueForPanel && syncVenueBasics(selectedVenueForPanel.id)}
                                    className={`p-1.5 rounded-lg transition-all border shrink-0 ${syncingVenue === selectedVenueForPanel?.id
                                        ? "bg-primary/20 text-primary animate-pulse border-primary/30"
                                        : "bg-surface-hover text-primary hover:bg-primary hover:text-white border-border"
                                        }`}
                                    title="Sync Official Name & Info from Google"
                                    disabled={!selectedVenueForPanel || syncingVenue === selectedVenueForPanel.id}
                                >
                                    {syncingVenue === selectedVenueForPanel?.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RotateCcw className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={() => setSelectedVenueForPanel(null)}
                                    className="p-1.5 rounded-lg bg-surface-hover text-muted hover:text-foreground transition-all border border-border"
                                    title="Collapse Panel"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden p-4 custom-scrollbar flex flex-col">
                            {/* Embedded Map Section */}
                            <div className="rounded-xl border border-border overflow-hidden bg-surface-hover flex-1 min-h-[300px] relative shadow-inner group">
                                {(() => {
                                    const venue = selectedVenueForPanel;
                                    if (!venue) return null;
                                    return (
                                        <iframe
                                            className="w-full h-full border-0 grayscale-[0.2] contrast-[1.1]"
                                            src={`https://maps.google.com/maps?q=${encodeURIComponent(
                                                (venue.name || "") + " " +
                                                (getBestType(venue.types || [])) + " " +
                                                (venue.address || "")
                                            )}&output=embed`}
                                            allowFullScreen
                                            loading="lazy"
                                        />
                                    );
                                })()}
                                <div className="absolute top-2 right-2 group-hover:opacity-100 opacity-0 transition-opacity">
                                    <a
                                        href={selectedVenueForPanel?.google_maps_url || "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-premium py-1 px-2 text-[8px]"
                                    >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        Full Map
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-border bg-surface/50 space-y-3">
                            <div className="flex gap-2 mb-2">
                                {lastThrownVenueId ? (
                                    <button
                                        onClick={handleUndo}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 outline-none rounded-xl bg-orange-500/10 hover:bg-orange-500 border border-orange-500/20 hover:border-orange-500 text-orange-500 hover:text-white font-bold transition-all shadow-sm active:scale-[0.98]"
                                        title="Undo last throw and bring venue back"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Undo Throw
                                    </button>
                                ) : (
                                    <div className="flex-1"></div>
                                )}
                                <button
                                    onClick={handlePrevious}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 outline-none rounded-xl bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary text-primary hover:text-white font-bold transition-all shadow-sm active:scale-[0.98]"
                                    title="Go to previous venue"
                                >
                                    <ChevronUp className="w-4 h-4" />
                                    Previous
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleThrow}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 outline-none rounded-xl bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 text-red-500 hover:text-white font-bold transition-all shadow-sm active:scale-[0.98]"
                                    title="Delete this venue and move to next"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Throw
                                </button>
                                <button
                                    onClick={handleKeep}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 outline-none rounded-xl bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary text-primary hover:text-white font-bold transition-all shadow-sm active:scale-[0.98]"
                                    title="Keep this venue and move to next"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Keep
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
}
