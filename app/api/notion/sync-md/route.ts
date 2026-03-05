import { NextRequest, NextResponse } from "next/server";
import { exportCustomVenueToNotion, discoverPropertyNames, CustomNotionVenue } from "@/lib/notion";

console.log(`[sync-md] Server instance started at: ${new Date().toISOString()}`);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { markdownText, integrationToken, databaseId } = body;

        if (!markdownText || !integrationToken || !databaseId) {
            return NextResponse.json(
                { error: "Missing required fields (markdownText, integrationToken, databaseId)" },
                { status: 400 }
            );
        }

        // 0. Discover property names
        const discovery = await discoverPropertyNames(integrationToken, databaseId);
        if (!discovery.success) {
            return NextResponse.json(
                { error: `Property discovery failed: ${discovery.error}` },
                { status: 400 }
            );
        }

        const propertyKeys = {
            venueKey: discovery.venueKey!,
            contactsKey: discovery.contactsKey!,
            pitchKey: discovery.pitchKey,
            statusKey: discovery.statusKey,
        };

        // 1. Extract Valid Data Rows
        const lines = markdownText.split("\n");
        const dataRows: string[][] = [];

        // Header keywords to skip
        const headerKeywords = ["venue", "location", "contacts", "personnel", "status", "pitch", "link"];

        // Smart separator detection: matches lines like "---|---|---", "| --- | --- |", ":---:|:---:", etc.
        const isSeparatorLine = (line: string) =>
            /^[|\s:-]+$/.test(line) && line.includes("---");

        // Smart cell splitting that handles both formats:
        //   "| Cell1 | Cell2 |"  →  ["Cell1", "Cell2"]
        //   "Cell1 | Cell2"      →  ["Cell1", "Cell2"]
        const splitCells = (line: string): string[] => {
            // Strip leading/trailing pipes if present, then split on remaining pipes
            const stripped = line.replace(/^\|/, "").replace(/\|$/, "");
            return stripped.split("|").map((c: string) => c.trim()).filter(Boolean);
        };

        for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx].trim();

            // Skip empty lines and separator lines
            if (!line || isSeparatorLine(line)) continue;

            // A line must contain at least one pipe to be a table row
            if (!line.includes("|")) continue;

            const cells = splitCells(line);

            // Skip header-like rows (only check the first few lines)
            // A cell is only "header-like" if it's short and primarily a header keyword,
            // NOT a long data cell that happens to contain the word "Personnel" etc.
            if (idx < 5 && cells.length >= 2) {
                const isHeaderCell = (cell: string) => {
                    const cleaned = cell.toLowerCase().replace(/[&,]/g, " ").trim();
                    // Only count as header if the cell is short (just label text, not data)
                    if (cleaned.length > 40) return false;
                    // Split into words and check if most words are header keywords
                    const words = cleaned.split(/\s+/).filter(Boolean);
                    const keywordWords = words.filter((w) => headerKeywords.includes(w));
                    return keywordWords.length >= Math.ceil(words.length / 2);
                };

                const headerCellCount = cells.filter(isHeaderCell).length;

                if (headerCellCount >= Math.ceil(cells.length / 2)) {
                    console.log(`[sync-md] Skipping header-like row: "${line}"`);
                    continue;
                }
            }

            if (cells.length >= 2) {
                dataRows.push(cells);
            }
        }

        // 2. Flexible Chunk Processing
        const parsedVenues: CustomNotionVenue[] = [];

        // Strategy: First, clean up the data.
        // We need to decide if this is a 2-row format or a 1-row format.
        // A 1-row format usually has a <br> or markdown link in the first cell, 
        // OR the phone number is already in the second cell of the same row.

        let i = 0;
        while (i < dataRows.length) {
            const row = dataRows[i];

            // Cleanup helper
            const clean = (text: string) => text.replace(/<br\s*\/?>/gi, "\n").replace(/\*\*/g, "").trim();

            // Link extraction helper
            const extractLink = (text: string) => {
                const mdLinkMatch = text.match(/\[.*?\]\((https?:\/\/.*?)\)/);
                if (mdLinkMatch) return mdLinkMatch[1];
                const rawUrlMatch = text.match(/https?:\/\/[^\s|)]+/);
                return rawUrlMatch ? rawUrlMatch[0] : "";
            };

            const cell0 = row[0] || "";
            const cell1 = row[1] || "";

            const hasLink = cell0.includes("http");
            const hasBr = /<br\s*\/?>/i.test(cell0);

            if (hasBr || hasLink) {
                // 1-Row Format
                const link = extractLink(cell0);
                const nameAndAddress = clean(cell0.replace(/\[.*?\]\(.*?\)/g, "").replace(/https?:\/\/[^\s|)]+/g, ""));

                parsedVenues.push({
                    venueAndLocation: nameAndAddress,
                    contactsAndPersonnel: clean(cell1),
                    link: link || undefined,
                    status: row[2] ? clean(row[2]) : undefined,
                    pitch: row[3] ? clean(row[3]) : undefined,
                });
                i++;
            } else {
                // Potential 2-Row Format
                const nextRow = dataRows[i + 1];
                if (nextRow && nextRow[0].includes("http")) {
                    // Standard 2-row
                    const venueName = clean(cell0);
                    const link = extractLink(nextRow[0]);
                    const phone = clean(cell1);
                    const personnel = clean(nextRow[1]);

                    parsedVenues.push({
                        venueAndLocation: venueName,
                        contactsAndPersonnel: `${phone}${personnel ? `\n${personnel}` : ""}`,
                        link: link || undefined,
                        status: row[2] ? clean(row[2]) : undefined,
                        pitch: row[3] ? clean(row[3]) : undefined,
                    });
                    i += 2;
                } else {
                    // Single row without link
                    parsedVenues.push({
                        venueAndLocation: clean(cell0),
                        contactsAndPersonnel: clean(cell1),
                        status: row[2] ? clean(row[2]) : undefined,
                        pitch: row[3] ? clean(row[3]) : undefined,
                    });
                    i++;
                }
            }
        }

        if (parsedVenues.length === 0) {
            return NextResponse.json(
                { error: "No data rows found in Markdown. Please check your table format (Wait for it to load completely before syncing)." },
                { status: 400 }
            );
        }

        // 3. Sync
        let exportedCount = 0;
        const errors: string[] = [];

        for (const venue of parsedVenues) {
            console.log(`[sync-md] Exporting: ${venue.venueAndLocation.substring(0, 50)}...`);
            const res = await exportCustomVenueToNotion(integrationToken, databaseId, venue, propertyKeys);
            if (res.success) {
                console.log(`[sync-md] Export success: ${res.pageId}`);
                exportedCount++;
            } else {
                console.error(`[sync-md] Export failed: ${res.error}`);
                errors.push(`Failed on ${venue.venueAndLocation.split('\n')[0]}: ${res.error}`);
            }
            await new Promise((r) => setTimeout(r, 400));
        }

        return NextResponse.json({
            success: true,
            totalFound: parsedVenues.length,
            exportedCount,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error: any) {
        console.error("[sync-md] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
