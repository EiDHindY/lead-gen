import { NextRequest, NextResponse } from "next/server";
import { exportCustomVenueToNotion, discoverPropertyNames, CustomNotionVenue, exportCoffeeVenueToNotion, CoffeeNotionVenue } from "@/lib/notion";

console.log(`[sync-md] Server instance started at: ${new Date().toISOString()}`);

// ── Shared helpers ──

const headerKeywords = ["venue", "location", "contacts", "personnel", "status", "pitch", "link", "activity", "activities", "review", "reviews"];

const isSeparatorLine = (line: string) =>
    /^[|\s:-]+$/.test(line) && line.includes("---");

const splitCells = (line: string): string[] => {
    const stripped = line.replace(/^\|/, "").replace(/\|$/, "");
    return stripped.split("|").map((c: string) => c.trim()).filter(Boolean);
};

const clean = (text: string) => text.replace(/<br\s*\/?>/gi, "\n").replace(/\*\*/g, "").trim();

const extractLink = (text: string) => {
    const mdLinkMatch = text.match(/\[.*?\]\((https?:\/\/.*?)\)/);
    if (mdLinkMatch) return mdLinkMatch[1];
    const rawUrlMatch = text.match(/https?:\/\/[^\s|)]+/);
    return rawUrlMatch ? rawUrlMatch[0] : "";
};

function extractDataRows(markdownText: string): string[][] {
    const lines = markdownText.split("\n");
    const dataRows: string[][] = [];

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line || isSeparatorLine(line)) continue;
        if (!line.includes("|")) continue;

        const cells = splitCells(line);

        if (idx < 5 && cells.length >= 2) {
            const isHeaderCell = (cell: string) => {
                const cleaned = cell.toLowerCase().replace(/[&,]/g, " ").trim();
                if (cleaned.length > 40) return false;
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

    return dataRows;
}

// ── TLC Coffee parser ──

function parseCoffeeVenues(dataRows: string[][]): CoffeeNotionVenue[] {
    const venues: CoffeeNotionVenue[] = [];

    for (const row of dataRows) {
        const cell0 = row[0] || "";
        const cell1 = row[1] || "";

        // Extract link from first cell
        const link = extractLink(cell0);

        // Clean venue name: remove URLs and <br> tags
        const venueName = clean(
            cell0.replace(/\[.*?\]\(.*?\)/g, "").replace(/https?:\/\/[^\s|)]+/g, "")
        );

        // Clean contacts
        const contacts = clean(cell1);

        if (venueName) {
            venues.push({
                venueAndLocation: venueName,
                contactsAndPersonnel: contacts,
                link: link || undefined,
            });
        }
    }

    return venues;
}

// ── TLC Activity parser (existing logic) ──

function parseActivityVenues(dataRows: string[][]): CustomNotionVenue[] {
    const parsedVenues: CustomNotionVenue[] = [];

    const splitActivityReviews = (text: string) => {
        const activitiesMarker = "Activities:";
        const reviewsMarker = "Reviews:";
        let activities = "";
        let reviews = "";
        const upperText = text.replace(/<br\s*\/?>/gi, "\n").replace(/\*\*/g, "");
        const actIdx = upperText.indexOf(activitiesMarker);
        const revIdx = upperText.indexOf(reviewsMarker);

        if (actIdx !== -1 && revIdx !== -1) {
            if (actIdx < revIdx) {
                activities = upperText.substring(actIdx + activitiesMarker.length, revIdx).trim();
                reviews = upperText.substring(revIdx + reviewsMarker.length).trim();
            } else {
                reviews = upperText.substring(revIdx + reviewsMarker.length, actIdx).trim();
                activities = upperText.substring(actIdx + activitiesMarker.length).trim();
            }
        } else if (actIdx !== -1) {
            activities = upperText.substring(actIdx + activitiesMarker.length).trim();
        } else if (revIdx !== -1) {
            reviews = upperText.substring(revIdx + reviewsMarker.length).trim();
        } else {
            activities = upperText.trim();
        }
        return { activities, reviews };
    };

    let i = 0;
    while (i < dataRows.length) {
        const row = dataRows[i];
        const cell0 = row[0] || "";
        const cell1 = row[1] || "";
        const cell2 = row[2] || "";
        const hasLink = cell0.includes("http");
        const hasBr = /<br\s*\/?>/i.test(cell0);

        if (hasBr || hasLink) {
            const link = extractLink(cell0);
            const nameAndAddress = clean(cell0.replace(/\[.*?\]\(.*?\)/g, "").replace(/https?:\/\/[^\s|)]+/g, ""));
            const { activities, reviews } = splitActivityReviews(cell2);
            parsedVenues.push({
                venueAndLocation: nameAndAddress,
                contactsAndPersonnel: clean(cell1),
                link: link || undefined,
                activities,
                reviews,
                pitch: row[3] && !row[3].toLowerCase().includes("found") ? clean(row[3]) : undefined,
            });
            i++;
        } else {
            const nextRow = dataRows[i + 1];
            if (nextRow && nextRow[0].includes("http")) {
                const venueName = clean(cell0);
                const link = extractLink(nextRow[0]);
                const phone = clean(cell1);
                const personnel = clean(nextRow[1]);
                const { activities, reviews } = splitActivityReviews(cell2);
                parsedVenues.push({
                    venueAndLocation: venueName,
                    contactsAndPersonnel: `${phone}${personnel ? `\n${personnel}` : ""}`,
                    link: link || undefined,
                    activities,
                    reviews,
                    pitch: row[3] && !row[3].toLowerCase().includes("found") ? clean(row[3]) : undefined,
                });
                i += 2;
            } else {
                const { activities, reviews } = splitActivityReviews(cell2);
                parsedVenues.push({
                    venueAndLocation: clean(cell0),
                    contactsAndPersonnel: clean(cell1),
                    activities,
                    reviews,
                    pitch: row[3] && !row[3].toLowerCase().includes("found") ? clean(row[3]) : undefined,
                });
                i++;
            }
        }
    }

    return parsedVenues;
}

// ── Main handler ──

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { markdownText, integrationToken, databaseId, areaId, campaign } = body;
        const token = integrationToken?.trim();
        const dbId = databaseId?.trim();
        const aId = areaId?.trim();
        const isCoffee = campaign === "tlc-coffee";

        if (!markdownText || !token || !dbId) {
            return NextResponse.json(
                { error: "Missing required fields (markdownText, integrationToken, databaseId)" },
                { status: 400 }
            );
        }

        // 0. Discover property names
        const discovery = await discoverPropertyNames(token, dbId);
        if (!discovery.success) {
            return NextResponse.json(
                { error: `Property discovery failed: ${discovery.error}` },
                { status: 400 }
            );
        }

        // 1. Extract valid data rows (shared logic)
        const dataRows = extractDataRows(markdownText);

        if (dataRows.length === 0) {
            return NextResponse.json(
                { error: "No data rows found in Markdown. Please check your table format (Wait for it to load completely before syncing)." },
                { status: 400 }
            );
        }

        let exportedCount = 0;
        const errors: string[] = [];

        if (isCoffee) {
            // ── TLC Coffee branch ──
            const coffeeVenues = parseCoffeeVenues(dataRows);

            if (coffeeVenues.length === 0) {
                return NextResponse.json(
                    { error: "No coffee venue data found. Check your table format." },
                    { status: 400 }
                );
            }

            const coffeePropertyKeys = {
                venueKey: discovery.venueKey!,
                contactsKey: discovery.contactsKey!,
                areaKey: discovery.areaKey,
            };

            for (const venue of coffeeVenues) {
                console.log(`[sync-md][coffee] Exporting: ${venue.venueAndLocation.substring(0, 50)}...`);
                const res = await exportCoffeeVenueToNotion(token, dbId, venue, coffeePropertyKeys, aId);
                if (res.success) {
                    console.log(`[sync-md][coffee] Export success: ${res.pageId}`);
                    exportedCount++;
                } else {
                    console.error(`[sync-md][coffee] Export failed: ${res.error}`);
                    errors.push(`Failed on ${venue.venueAndLocation.split('\n')[0]}: ${res.error}`);
                }
                await new Promise((r) => setTimeout(r, 400));
            }

            return NextResponse.json({
                success: true,
                totalFound: coffeeVenues.length,
                exportedCount,
                discoveredKeys: coffeePropertyKeys,
                errors: errors.length > 0 ? errors : undefined,
            });
        } else {
            // ── TLC Activity branch (existing logic) ──
            const propertyKeys = {
                venueKey: discovery.venueKey!,
                contactsKey: discovery.contactsKey!,
                activitiesKey: discovery.activitiesKey,
                reviewsKey: discovery.reviewsKey,
                pitchKey: discovery.pitchKey,
                statusKey: discovery.statusKey,
                areaKey: discovery.areaKey,
            };

            const parsedVenues = parseActivityVenues(dataRows);

            if (parsedVenues.length === 0) {
                return NextResponse.json(
                    { error: "No data rows found in Markdown. Please check your table format (Wait for it to load completely before syncing)." },
                    { status: 400 }
                );
            }

            for (const venue of parsedVenues) {
                console.log(`[sync-md] Exporting: ${venue.venueAndLocation.substring(0, 50)}...`);
                const res = await exportCustomVenueToNotion(token, dbId, venue, propertyKeys, aId);
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
                discoveredKeys: propertyKeys,
                errors: errors.length > 0 ? errors : undefined,
            });
        }

    } catch (error: any) {
        console.error("[sync-md] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
