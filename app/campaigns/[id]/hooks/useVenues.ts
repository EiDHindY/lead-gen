import { useState, useRef } from "react";
import { supabase, type Venue } from "@/lib/supabase";

export function useVenues(campaignId: string, venues: Venue[], loadCampaign: () => Promise<void>, selectedNeighborhood: string | null) {
    const [searchingVenues, setSearchingVenues] = useState<string | null>(null);
    const [researchingVenue, setResearchingVenue] = useState<string | null>(null);
    const [syncingVenue, setSyncingVenue] = useState<string | null>(null);
    const [expandedVenue, setExpandedVenue] = useState<string | null>(null);

    // Import state
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState("");
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0); // 0 to 100
    const [importResult, setImportResult] = useState<string | null>(null);
    const [importSourceName, setImportSourceName] = useState("");

    const [notionExporting, setNotionExporting] = useState(false);
    const [notionExportProgress, setNotionExportProgress] = useState<{ current: number; total: number } | null>(null);

    const [researchProgress, setResearchProgress] = useState<number | null>(null); // null means not researching all
    const [researchMessage, setResearchMessage] = useState<string>("");
    const cancelRef = useRef(false);
    const [isResearchCancelled, setIsResearchCancelled] = useState(false);

    async function searchVenuesInNeighborhood(neighborhoodId: string, ruleId?: string, customType?: string, allRules?: any[]) {
        setSearchingVenues(neighborhoodId);

        // If we are searching ALL rules, we do it one by one to show progress
        if (!ruleId && !customType && allRules && allRules.length > 0) {
            cancelRef.current = false;
            setResearchProgress(0);

            let totalFound = 0;
            let totalFiltered = 0;
            let totalDupsSkipped = 0;
            let totalNewVenues = 0;
            let completed = 0;

            let data: any = null;
            for (const rule of allRules) {
                if (cancelRef.current) break;

                completed++;
                setResearchProgress(Math.round((completed / allRules.length) * 100));
                setResearchMessage(`Searching for ${rule.venue_type}... (${completed}/${allRules.length}) [New: ${totalNewVenues}]`);

                try {
                    const res = await fetch("/api/search-venues", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ campaignId, neighborhoodId, ruleId: rule.id }),
                    });

                    if (res.ok) {
                        data = await res.json();
                        totalFound += data.totalFound || 0;
                        totalFiltered += data.filtered || 0;
                        totalDupsSkipped += data.duplicatesSkipped || 0;
                        totalNewVenues += data.newVenues || 0;
                    }
                } catch (err) {
                    console.error("Failed rule:", rule.venue_type, err);
                }
            }

            let debugInfo = "";
            if (totalFound === 0 && data?.debug) {
                debugInfo = `\n\nDEBUG LOGS:\n` + (data.debug as string[]).join("\n");
            }

            alert(
                `Bulk Search Complete!\n\n` +
                `Total venues found: ${totalFound}\n` +
                `Venues that passed your rules & area: ${totalFiltered}\n` +
                `Duplicates already in your campaign: ${totalDupsSkipped}\n` +
                `Brand new leads added: ${totalNewVenues}` +
                debugInfo
            );

            setResearchProgress(null);
            setResearchMessage("");
            setSearchingVenues(null);
            loadCampaign();
            return;
        }

        // Standard single search behavior below
        try {
            const res = await fetch("/api/search-venues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId, neighborhoodId, ruleId, customType }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert("Search failed: " + (data.error || "Unknown error"));
            } else {
                // Determine the name of the rule searched if we can, else just "venues"
                alert(
                    `Search Complete!\n\n` +
                    `Total venues found: ${data.totalFound}\n` +
                    `Venues that passed your rules & area: ${data.filtered}\n` +
                    `Duplicates already in your campaign: ${data.duplicatesSkipped}\n` +
                    `Brand new leads added: ${data.newVenues}`
                );
            }

            setSearchingVenues(null);
            loadCampaign(); // Refresh in background immediately
        } catch {
            alert("Failed to search venues");
            setSearchingVenues(null);
            loadCampaign();
        }
    }

    async function researchPersonnel(venueId: string, silent = false) {
        setResearchingVenue(venueId);

        try {
            const res = await fetch("/api/get-personnel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ venueId }),
            });

            const data = await res.json();

            if (!res.ok) {
                const errorMsg = data.details ? `${data.error}: ${data.details}` : (data.error || "Unknown error");
                if (!silent) alert("Research failed: " + errorMsg);
                throw new Error(errorMsg);
            } else if (data.aborted) {
                if (!silent) alert(`Research for ${data.venue} aborted: ${data.message}`);
                console.log(`[useVenues] Research for ${data.venue} aborted: ${data.message}`);
            }

            return data.personnel || [];
        } catch (err: any) {
            if (!silent) alert("Failed to research personnel: " + (err.message || ""));
            throw err;
        } finally {
            setResearchingVenue(null);
            loadCampaign();
        }
    }

    async function syncVenueBasics(venueId: string, silent: boolean = false, skipRefresh: boolean = false) {
        setSyncingVenue(venueId);
        try {
            const res = await fetch("/api/sync-venue-basics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ venueId }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Sync failed");
            }

            if (!skipRefresh) {
                await loadCampaign();
            }
            return data.venue;
        } catch (err: any) {
            if (!silent) {
                alert("Failed to sync venue basics: " + err.message);
            }
            throw err;
        } finally {
            setSyncingVenue(null);
        }
    }

    async function syncAllBasics() {
        const filtered = selectedNeighborhood
            ? venues.filter((v) => v.neighborhood_id === selectedNeighborhood)
            : venues;

        // Let's only sync ones that don't have a google_category yet to save quota?
        // Or just let the user decide. For now, sync all unresearched or missing ratings.
        const toSync = filtered.filter(v => v.status === 'new' || !v.rating);
        if (toSync.length === 0) return;

        setResearchProgress(0); // Reuse researchProgress for the progress bar
        cancelRef.current = false;
        let completed = 0;

        for (const venue of toSync) {
            if (cancelRef.current) break;

            completed++;
            setResearchProgress(Math.round((completed / toSync.length) * 100));
            setResearchMessage(`Syncing Official Info... (${completed}/${toSync.length})`);

            try {
                await syncVenueBasics(venue.id, true, true);
            } catch (err) {
                setResearchMessage(`Failed for ${venue.name}. Continuing...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (completed < toSync.length) {
                // 4.5 second delay to stay strictly under 15 RPM Gemini limit for free tier
                await new Promise(resolve => setTimeout(resolve, 4500));
            }
        }

        await loadCampaign();
        setResearchProgress(null);
        setResearchMessage("");
    }

    async function researchAll() {
        const filtered = selectedNeighborhood
            ? venues.filter((v) => v.neighborhood_id === selectedNeighborhood)
            : venues;
        const unresearched = filtered.filter((v) => v.status === "new");
        if (unresearched.length === 0) return;

        setResearchProgress(0);
        cancelRef.current = false;
        let completed = 0;

        for (const venue of unresearched) {
            if (cancelRef.current) {
                console.log("[useVenues] Research cancelled");
                break;
            }

            try {
                await researchPersonnel(venue.id, true);
            } catch (err: any) {
                console.error(`[useVenues] Failed to research "${venue.name}":`, err.message);
            }

            completed++;
            setResearchProgress(Math.round((completed / unresearched.length) * 100));

            // 4-second throttle to stay under 20 RPM Gemini limit
            if (completed < unresearched.length) {
                await new Promise(resolve => setTimeout(resolve, 4000));
            }
        }

        setResearchProgress(null);
    }

    function stopResearch() {
        cancelRef.current = true;
        setResearchProgress(null);
    }

    async function markAllCalled() {
        const filtered = selectedNeighborhood
            ? venues.filter((v) => v.neighborhood_id === selectedNeighborhood)
            : venues;
        const newVenues = filtered.filter((v) => v.status === "new" || v.status === "researched");
        if (!confirm(`Mark ${newVenues.length} venues as called?`)) return;

        const ids = newVenues.map((v) => v.id);
        await supabase.from("venues").update({ status: "called" }).in("id", ids);

        loadCampaign();
    }

    async function updateVenueStatus(venueId: string, status: "called" | "skipped" | "new") {
        await supabase.from("venues").update({ status }).eq("id", venueId);
        loadCampaign();
    }

    async function updateVenuePhone(venueId: string, phone: string) {
        const { error } = await supabase
            .from("venues")
            .update({
                phone,
                status: "new",
                updated_at: new Date().toISOString()
            })
            .eq("id", venueId);

        if (error) {
            alert("Failed to update phone: " + error.message);
        } else {
            loadCampaign();
        }
    }

    async function resetSkippedVenues() {
        const filtered = selectedNeighborhood
            ? venues.filter((v) => v.neighborhood_id === selectedNeighborhood)
            : venues;
        const skipped = filtered.filter((v) => v.status === "skipped");
        if (skipped.length === 0) return;

        if (!confirm(`Reset ${skipped.length} skipped venues back to "new"? This will let you re-research them.`)) return;

        const ids = skipped.map((v) => v.id);
        const { error } = await supabase
            .from("venues")
            .update({ status: "new", ai_research_raw: null })
            .in("id", ids);

        if (error) {
            alert("Failed to reset venues: " + error.message);
        } else {
            loadCampaign();
        }
    }

    async function deleteVenue(venueId: string) {
        if (!confirm("Are you sure you want to permanently delete this venue? This will also delete all researched personnel for it.")) return;

        const { error } = await supabase.from("venues").delete().eq("id", venueId);
        if (error) {
            alert("Failed to delete venue: " + error.message);
        } else {
            loadCampaign();
        }
    }

    async function exportCSV() {
        window.open(`/api/export-csv?campaignId=${campaignId}`, "_blank");
    }

    async function exportToNotion(notionToken: string, notionDatabaseId: string, venueIds: string[]) {
        if (!confirm(`Export ${venueIds.length} venue(s) to Notion?`)) return;

        setNotionExporting(true);
        setNotionExportProgress({ current: 0, total: venueIds.length });

        try {
            const res = await fetch("/api/export-notion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaignId,
                    venueIds,
                    notionToken,
                    notionDatabaseId,
                    action: "export"
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert(`Export failed: ${data.error || "Unknown error"}`);
            } else {
                alert(`Export Complete!\n\nSuccessfully exported ${data.exported}/${data.total} venues to Notion.${data.errors ? `\n\nErrors encountered: ${data.errors.length}` : ""}`);
                loadCampaign(); // Refresh the venues list to reflect the new notion_exported status
            }
        } catch (err: any) {
            alert(`Failed to export to Notion: ${err.message}`);
        } finally {
            setNotionExporting(false);
            setNotionExportProgress(null);
        }
    }

    async function importVenues(textOverride?: string, sourceNameOverride?: string) {
        const textToImport = textOverride || importText;
        const sourceToImport = sourceNameOverride || importSourceName;

        if (!textToImport.trim()) return;
        setImporting(true);
        setImportProgress(0);
        setImportResult(null);

        try {
            const res = await fetch("/api/import-venues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaignId,
                    sourceName: sourceToImport.trim() || undefined,
                    text: textToImport
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setImportResult(`❌ ${data.error || "Import failed"}`);
                return false;
            } else {
                setImportResult(
                    `✅ Imported ${data.imported} venues (${data.duplicatesSkipped} duplicates skipped)`
                );
                setImportProgress(100);
                if (!textOverride) {
                    setImportText("");
                    setImporting(false); // Only set to false if not part of a bulk upload
                }
                loadCampaign();
                return true;
            }
        } catch {
            setImportResult("❌ Failed to import venues");
            return false;
        } finally {
            if (!textOverride) setImporting(false);
        }
    }

    async function handleFileUploads(files: FileList) {
        setImporting(true);
        setImportProgress(0);
        setImportResult(`Processing ${files.length} files...`);

        let count = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();

            const text = await new Promise<string>((resolve) => {
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsText(file);
            });

            // Improved name parsing: remove all dots/extensions and replace underscores/dashes with spaces
            let sourceName = file.name.split('.')[0] // Get first part before any dots
                .replace(/[_-]/g, " ")               // Replace underscores and dashes with spaces
                .trim();

            // Capitalize each word for a better display name
            sourceName = sourceName.split(/\s+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(" ");

            setImportResult(`Importing "${sourceName}" (${i + 1}/${files.length})...`);

            // We await the result from importVenues (which handles its own result reporting)
            const success = await importVenues(text, sourceName);
            if (success) count++;

            setImportProgress(Math.round(((i + 1) / files.length) * 100));
        }

        setImportResult(`✅ Successfully imported ${count}/${files.length} files.`);
        setImporting(false);
        loadCampaign();
    }

    return {
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
        isResearchCancelled,
        setIsResearchCancelled,
        searchVenuesInNeighborhood,
        researchPersonnel,
        researchAll,
        stopResearch,
        markAllCalled,
        resetSkippedVenues,
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
    };
}
