import { Fragment, useState } from "react";
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
    Eye,
    Plus,
    Mail,
    Lightbulb,
    Hash,
    Loader2,
    Database,
    Settings,
    Trash2
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
    researchProgress: number | null;
    exportCSV: () => void;
    personnelMap: Record<string, VenuePersonnel[]>;
    expandedVenue: string | null;
    setExpandedVenue: (id: string | null) => void;
    researchPersonnel: (id: string) => void;
    researchingVenue: string | null;
    updateVenueStatus: (id: string, status: "called" | "skipped") => void;
    deleteVenue: (id: string) => void;
    campaign: Campaign;
    onOpenNotionSettings: () => void;
    exportToNotion: (token: string, dbId: string, venueIds: string[]) => void;
    notionExporting: boolean;
    notionExportProgress: { current: number; total: number } | null;
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
    researchProgress,
    exportCSV,
    personnelMap,
    expandedVenue,
    setExpandedVenue,
    researchPersonnel,
    researchingVenue,
    updateVenueStatus,
    deleteVenue,
    handleFileUploads,
    campaign,
    onOpenNotionSettings,
    exportToNotion,
    notionExporting,
    notionExportProgress
}: VenueListProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [visibleCount, setVisibleCount] = useState(50);

    const filteredVenues = venues.filter(
        v => !selectedNeighborhood || v.neighborhood_id === selectedNeighborhood
    );

    const displayedVenues = filteredVenues.slice(0, visibleCount);
    const hasMore = filteredVenues.length > visibleCount;

    return (
        <div className="lg:col-span-2">
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
                                className="btn-premium text-success bg-success/5 border-success/20 hover:bg-success/10"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Mark All Called</span>
                            </button>
                        )}
                        {venues.some((v) => v.status === "new") && (
                            <button
                                onClick={researchAll}
                                className="btn-secondary-premium"
                            >
                                <Rocket className="w-4 h-4 animate-pulse" />
                                <span className="hidden sm:inline">Research All</span>
                            </button>
                        )}
                        {venues.length > 0 && (
                            <>
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
                                                        // Case: All were already exported
                                                        if (!window.confirm(`All ${activeVenues.length} leads have already been pushed to Notion. Push them again?`)) {
                                                            return;
                                                        }
                                                    } else {
                                                        // Case: Mixed new and old
                                                        const pushOnlyNew = window.confirm(
                                                            `${alreadyExportedCount} leads were already pushed, while ${unexportedVenues.length} are new.\n\n` +
                                                            `Click OK to export ONLY the ${unexportedVenues.length} new leads.\n` +
                                                            `Click Cancel to export ALL ${activeVenues.length} leads again.`
                                                        );

                                                        if (pushOnlyNew) {
                                                            venueIdsToExport = unexportedVenues.map(v => v.id);
                                                        }
                                                    }
                                                } else {
                                                    // Case: All are new
                                                    if (!window.confirm(`Export all ${venueIdsToExport.length} leads to Notion?`)) {
                                                        return;
                                                    }
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
                            </>
                        )}
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
                            <div className="flex items-center gap-2">
                                <span className="text-secondary animate-pulse-glow">🤖</span>
                                <span className="text-sm font-medium text-foreground">AI Researching Venues...</span>
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

                                                <th>Phone</th>
                                                <th>Personnel</th>
                                                <th>Status</th>
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
                                                            className="cursor-pointer"
                                                            onClick={() =>
                                                                setExpandedVenue(
                                                                    isExpanded ? null : venue.id
                                                                )
                                                            }
                                                        >
                                                            <td className="text-center text-muted font-mono text-xs">
                                                                {index + 1}
                                                            </td>
                                                            <td>
                                                                <div className="font-medium text-foreground">
                                                                    {venue.name}
                                                                </div>
                                                                <div className="text-xs text-muted truncate max-w-[200px]">
                                                                    {venue.address}
                                                                </div>
                                                            </td>

                                                            <td>
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
                                                            </td>
                                                            <td>
                                                                {personnel.length > 0 ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <User className="w-3.5 h-3.5 text-secondary" />
                                                                        <span className="badge badge-researched text-[10px]">
                                                                            {personnel.length} found
                                                                        </span>
                                                                    </div>
                                                                ) : venue.status === "new" ? (
                                                                    <span className="text-muted/50 text-[10px] italic">
                                                                        Not researched
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
                                                            <td onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex gap-1">
                                                                    {venue.status === "new" && (
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
                                                                    {venue.status !== "called" && (
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
                                                                    {venue.status !== "skipped" && (
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
                                                                        <a
                                                                            href={venue.google_maps_url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="p-1.5 rounded-lg bg-info/10 text-info hover:bg-info/20 transition-all border border-info/20"
                                                                            title="Open in Maps"
                                                                        >
                                                                            <MapPin className="w-3.5 h-3.5" />
                                                                        </a>
                                                                    )}
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
                                                                <td colSpan={6} className="!p-0">
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
                                                                                    <p className="text-sm text-muted">
                                                                                        No personnel found yet. Click 🤖 to
                                                                                        research.
                                                                                    </p>
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
        </div>
    );
}
