"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
    supabase,
    type Campaign,
    type CampaignRule,
    type Neighborhood,
    type Venue,
    type VenuePersonnel,
} from "@/lib/supabase";

export default function CampaignDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignRules, setCampaignRules] = useState<CampaignRule[]>([]);
    const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [personnelMap, setPersonnelMap] = useState<
        Record<string, VenuePersonnel[]>
    >({});
    const [loading, setLoading] = useState(true);

    // ── Neighborhood search state ──
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

    // ── Venue search state ──
    const [searchingVenues, setSearchingVenues] = useState<string | null>(null);

    // ── Personnel research state ──
    const [researchingVenue, setResearchingVenue] = useState<string | null>(null);

    // ── Expanded venue for details ──
    const [expandedVenue, setExpandedVenue] = useState<string | null>(null);

    // ── Import state ──
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState("");
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<string | null>(null);

    const loadCampaign = useCallback(async () => {
        setLoading(true);

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

        const { data: venueData } = await supabase
            .from("venues")
            .select("*")
            .eq("campaign_id", id)
            .order("rating", { ascending: false });

        if (venueData) {
            setVenues(venueData);

            // Load personnel for all venues
            const venueIds = venueData.map((v) => v.id);
            if (venueIds.length > 0) {
                const { data: personnelData } = await supabase
                    .from("venue_personnel")
                    .select("*")
                    .in("venue_id", venueIds);

                const grouped: Record<string, VenuePersonnel[]> = {};
                if (personnelData) {
                    for (const p of personnelData) {
                        if (!grouped[p.venue_id]) grouped[p.venue_id] = [];
                        grouped[p.venue_id].push(p);
                    }
                }
                setPersonnelMap(grouped);
            }
        }

        setLoading(false);
    }, [id]);

    useEffect(() => {
        loadCampaign();
    }, [loadCampaign]);

    // ── Search for areas via OpenStreetMap ──
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

    // ── Add a neighborhood ──
    async function addNeighborhood(area: (typeof areaResults)[0]) {
        const { error } = await supabase.from("neighborhoods").insert({
            campaign_id: id,
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

    // ── Search venues in a neighborhood ──
    async function searchVenuesInNeighborhood(neighborhoodId: string) {
        setSearchingVenues(neighborhoodId);

        try {
            const res = await fetch("/api/search-venues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId: id, neighborhoodId }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert("Search failed: " + (data.error || "Unknown error"));
            }
        } catch {
            alert("Failed to search venues");
        }

        setSearchingVenues(null);
        loadCampaign();
    }

    // ── Research personnel for a venue ──
    async function researchPersonnel(venueId: string) {
        setResearchingVenue(venueId);

        try {
            const res = await fetch("/api/get-personnel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ venueId }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert("Research failed: " + (data.error || "Unknown error"));
            }
        } catch {
            alert("Failed to research personnel");
        }

        setResearchingVenue(null);
        loadCampaign();
    }

    // ── Research ALL unresearched venues ──
    async function researchAll() {
        const unresearched = venues.filter((v) => v.status === "new");
        for (const venue of unresearched) {
            await researchPersonnel(venue.id);
        }
    }

    // ── Update venue status ──
    async function updateVenueStatus(
        venueId: string,
        status: "called" | "skipped"
    ) {
        await supabase.from("venues").update({ status }).eq("id", venueId);
        loadCampaign();
    }

    // ── Export CSV ──
    async function exportCSV() {
        window.open(
            `/api/export-csv?campaignId=${id}`,
            "_blank"
        );
    }

    // ── Delete neighborhood ──
    async function deleteNeighborhood(neighborhoodId: string) {
        if (!confirm("Delete this neighborhood and its venues?")) return;

        // Delete venues first (cascade doesn't work via client)
        await supabase
            .from("venues")
            .delete()
            .eq("neighborhood_id", neighborhoodId);

        await supabase.from("neighborhoods").delete().eq("id", neighborhoodId);

        loadCampaign();
    }

    // ── Import venues from pasted text ──
    async function importVenues() {
        if (!importText.trim()) return;
        setImporting(true);
        setImportResult(null);

        try {
            const res = await fetch("/api/import-venues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId: id, text: importText }),
            });

            const data = await res.json();

            if (!res.ok) {
                setImportResult(`❌ ${data.error || "Import failed"}`);
            } else {
                setImportResult(
                    `✅ Imported ${data.imported} venues (${data.duplicatesSkipped} duplicates skipped)`
                );
                setImportText("");
                loadCampaign();
            }
        } catch {
            setImportResult("❌ Failed to import venues");
        }

        setImporting(false);
    }

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
                <div className="flex flex-wrap gap-2 mt-2">
                    {campaignRules.map((rule) => (
                        <span key={rule.id} className="badge badge-new">
                            {rule.venue_type.replace(/_/g, " ")}
                            {rule.min_rating > 0 && ` ⭐${rule.min_rating}+`}
                            {rule.min_opening_days > 0 && ` 📅${rule.min_opening_days}d+`}
                            {rule.exclude_chains && " 🚫chains"}
                        </span>
                    ))}
                </div>
                {campaign.product_description && (
                    <p className="text-sm text-muted mt-2 max-w-2xl">
                        Product: {campaign.product_description}
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── LEFT: Neighborhoods Panel ── */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">
                            🗺️ Neighborhoods
                        </h2>

                        {/* Add neighborhood */}
                        <div className="mb-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={areaQuery}
                                    onChange={(e) => setAreaQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleAreaSearch()}
                                    placeholder="Search area..."
                                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted"
                                />
                                <button
                                    onClick={handleAreaSearch}
                                    disabled={searchingArea}
                                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50"
                                >
                                    {searchingArea ? "..." : "🔍"}
                                </button>
                            </div>

                            {/* Area search results */}
                            {areaResults.length > 0 && (
                                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                                    {areaResults.map((area) => (
                                        <button
                                            key={area.osmId}
                                            onClick={() => addNeighborhood(area)}
                                            className="w-full text-left p-3 rounded-lg bg-surface hover:bg-surface-hover border border-border text-sm transition-colors"
                                        >
                                            <div className="font-medium text-foreground">
                                                {area.name}
                                            </div>
                                            <div className="text-xs text-muted truncate">
                                                {area.displayName}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Neighborhood list */}
                        <div className="space-y-2">
                            {neighborhoods.map((nb) => (
                                <div
                                    key={nb.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">
                                            {nb.name}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`badge badge-${nb.status}`}>
                                                {nb.status}
                                            </span>
                                            {nb.venues_found > 0 && (
                                                <span className="text-xs text-muted">
                                                    {nb.venues_found} leads
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        {nb.status !== "completed" && (
                                            <button
                                                onClick={() => searchVenuesInNeighborhood(nb.id)}
                                                disabled={searchingVenues === nb.id}
                                                className="px-3 py-1.5 rounded-md bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium disabled:opacity-50"
                                                title="Search venues"
                                            >
                                                {searchingVenues === nb.id ? (
                                                    <span className="animate-pulse-glow">⏳</span>
                                                ) : (
                                                    "🔍"
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteNeighborhood(nb.id)}
                                            className="px-2 py-1.5 rounded-md hover:bg-danger/20 text-danger/60 hover:text-danger text-xs"
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {neighborhoods.length === 0 && (
                                <p className="text-sm text-muted text-center py-4">
                                    Search and add neighborhoods above
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Venues Table ── */}
                <div className="lg:col-span-2">
                    <div className="glass-card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-foreground">
                                📋 Venues ({venues.length})
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowImport(!showImport)}
                                    className="px-4 py-2 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning text-sm font-medium transition-colors"
                                >
                                    📋 Import
                                </button>
                                {venues.some((v) => v.status === "new") && (
                                    <button
                                        onClick={researchAll}
                                        className="px-4 py-2 rounded-lg bg-secondary/20 hover:bg-secondary/30 text-secondary text-sm font-medium transition-colors"
                                    >
                                        🤖 Research All
                                    </button>
                                )}
                                {venues.length > 0 && (
                                    <button
                                        onClick={exportCSV}
                                        className="px-4 py-2 rounded-lg bg-success/20 hover:bg-success/30 text-success text-sm font-medium transition-colors"
                                    >
                                        📥 Export CSV
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Import Panel */}
                        {showImport && (
                            <div className="mb-6 p-4 rounded-lg bg-surface border border-border">
                                <h3 className="text-sm font-medium text-foreground mb-2">
                                    📋 Paste Existing Venues
                                </h3>
                                <p className="text-xs text-muted mb-3">
                                    Paste venue names and addresses — one venue name per line, followed by its address on the next line.
                                </p>
                                <textarea
                                    value={importText}
                                    onChange={(e) => setImportText(e.target.value)}
                                    placeholder={`Bondi Public Bar\n180 Campbell Parade, Bondi Beach NSW 2026\n\nSalty's Bondi\n108 Campbell Parade, Bondi Beach NSW 2026`}
                                    rows={8}
                                    className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted font-mono resize-none mb-3"
                                />
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={importVenues}
                                        disabled={importing || !importText.trim()}
                                        className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium disabled:opacity-50"
                                    >
                                        {importing ? "Importing..." : "Import Venues"}
                                    </button>
                                    {importResult && (
                                        <span className="text-sm">{importResult}</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {venues.length === 0 ? (
                            <p className="text-center text-muted py-12">
                                No venues yet. Add neighborhoods and search, or paste existing venues!
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Venue</th>
                                            <th>Rating</th>
                                            <th>Phone</th>
                                            <th>Personnel</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {venues.map((venue) => {
                                            const personnel = personnelMap[venue.id] || [];
                                            const isExpanded = expandedVenue === venue.id;

                                            return (
                                                <>
                                                    <tr
                                                        key={venue.id}
                                                        className="cursor-pointer"
                                                        onClick={() =>
                                                            setExpandedVenue(
                                                                isExpanded ? null : venue.id
                                                            )
                                                        }
                                                    >
                                                        <td>
                                                            <div className="font-medium text-foreground">
                                                                {venue.name}
                                                            </div>
                                                            <div className="text-xs text-muted truncate max-w-[200px]">
                                                                {venue.address}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {venue.rating ? (
                                                                <span className="text-warning font-medium">
                                                                    ⭐ {venue.rating}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted">—</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {venue.phone ? (
                                                                <a
                                                                    href={`tel:${venue.phone}`}
                                                                    className="text-info hover:underline"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {venue.phone}
                                                                </a>
                                                            ) : (
                                                                <span className="text-muted">—</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {personnel.length > 0 ? (
                                                                <span className="badge badge-researched">
                                                                    {personnel.length} found
                                                                </span>
                                                            ) : venue.status === "new" ? (
                                                                <span className="text-muted text-xs">
                                                                    Not researched
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted">—</span>
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
                                                                        onClick={() =>
                                                                            researchPersonnel(venue.id)
                                                                        }
                                                                        disabled={researchingVenue === venue.id}
                                                                        className="px-2 py-1 rounded text-xs bg-secondary/20 text-secondary hover:bg-secondary/30 disabled:opacity-50"
                                                                        title="Research personnel"
                                                                    >
                                                                        {researchingVenue === venue.id
                                                                            ? "⏳"
                                                                            : "🤖"}
                                                                    </button>
                                                                )}
                                                                {venue.status !== "called" && (
                                                                    <button
                                                                        onClick={() =>
                                                                            updateVenueStatus(venue.id, "called")
                                                                        }
                                                                        className="px-2 py-1 rounded text-xs bg-success/20 text-success hover:bg-success/30"
                                                                        title="Mark as called"
                                                                    >
                                                                        ✅
                                                                    </button>
                                                                )}
                                                                {venue.status !== "skipped" && (
                                                                    <button
                                                                        onClick={() =>
                                                                            updateVenueStatus(venue.id, "skipped")
                                                                        }
                                                                        className="px-2 py-1 rounded text-xs bg-danger/20 text-danger hover:bg-danger/30"
                                                                        title="Skip"
                                                                    >
                                                                        ⏭️
                                                                    </button>
                                                                )}
                                                                {venue.google_maps_url && (
                                                                    <a
                                                                        href={venue.google_maps_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="px-2 py-1 rounded text-xs bg-info/20 text-info hover:bg-info/30"
                                                                        title="Open in Maps"
                                                                    >
                                                                        🗺️
                                                                    </a>
                                                                )}
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
                                                                            <h4 className="text-sm font-semibold text-foreground mb-3">
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
                                                                            <h4 className="text-sm font-semibold text-foreground mb-3">
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
                                                                                                <div className="text-xs text-muted">
                                                                                                    📞 {p.phone}
                                                                                                </div>
                                                                                            )}
                                                                                            {p.email && (
                                                                                                <div className="text-xs text-muted">
                                                                                                    ✉️ {p.email}
                                                                                                </div>
                                                                                            )}
                                                                                            {p.recommended_pitch && (
                                                                                                <div className="mt-2 text-xs text-muted italic border-t border-border pt-2">
                                                                                                    💡 {p.recommended_pitch}
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
                                                </>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
