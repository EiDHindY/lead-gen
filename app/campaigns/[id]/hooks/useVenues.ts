import { useState } from "react";
import { supabase, type Venue } from "@/lib/supabase";

export function useVenues(campaignId: string, venues: Venue[], loadCampaign: () => Promise<void>) {
    const [searchingVenues, setSearchingVenues] = useState<string | null>(null);
    const [researchingVenue, setResearchingVenue] = useState<string | null>(null);
    const [expandedVenue, setExpandedVenue] = useState<string | null>(null);

    // Import state
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState("");
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0); // 0 to 100
    const [importResult, setImportResult] = useState<string | null>(null);
    const [importSourceName, setImportSourceName] = useState("");

    const [researchProgress, setResearchProgress] = useState<number | null>(null); // null means not researching all

    async function searchVenuesInNeighborhood(neighborhoodId: string, ruleId?: string) {
        setSearchingVenues(neighborhoodId);

        try {
            const res = await fetch("/api/search-venues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId, neighborhoodId, ruleId }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert("Search failed: " + (data.error || "Unknown error"));
            } else {
                // Determine the name of the rule searched if we can, else just "venues"
                const typeStr = ruleId ? `for this venue type` : `overall`;
                alert(
                    `Search Complete!\n\n` +
                    `Foursquare found: ${data.totalFound} venues ${typeStr}.\n` +
                    `Filtered out (by rules/boundary): ${data.filtered}\n` +
                    `Duplicates skipped (already in DB): ${data.duplicatesSkipped}\n` +
                    `Brand new leads added: ${data.newVenues}`
                );
            }
        } catch {
            alert("Failed to search venues");
        }

        setSearchingVenues(null);
        loadCampaign();
    }

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

    async function researchAll() {
        const unresearched = venues.filter((v) => v.status === "new");
        if (unresearched.length === 0) return;

        setResearchProgress(0);
        let completed = 0;

        for (const venue of unresearched) {
            await researchPersonnel(venue.id);
            completed++;
            setResearchProgress(Math.round((completed / unresearched.length) * 100));
        }

        setResearchProgress(null);
    }

    async function markAllCalled() {
        const newVenues = venues.filter((v) => v.status === "new" || v.status === "researched");
        if (!confirm(`Mark ${newVenues.length} venues as called?`)) return;

        const ids = newVenues.map((v) => v.id);
        await supabase.from("venues").update({ status: "called" }).in("id", ids);

        loadCampaign();
    }

    async function updateVenueStatus(venueId: string, status: "called" | "skipped") {
        await supabase.from("venues").update({ status }).eq("id", venueId);
        loadCampaign();
    }

    async function exportCSV() {
        window.open(`/api/export-csv?campaignId=${campaignId}`, "_blank");
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
        searchVenuesInNeighborhood,
        researchPersonnel,
        researchAll,
        markAllCalled,
        updateVenueStatus,
        exportCSV,
        importVenues,
        handleFileUploads
    };
}
