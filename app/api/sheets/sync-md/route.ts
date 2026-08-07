import { NextRequest, NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

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
                continue;
            }
        }

        if (cells.length >= 2) {
            dataRows.push(cells);
        }
    }

    return dataRows;
}

function parseActivityVenues(dataRows: string[][]): any[] {
    const parsedVenues: any[] = [];

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
                link: link || "",
                activities,
                reviews,
                status: row[3] && !row[3].toLowerCase().includes("found") ? clean(row[3]) : "",
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
                    link: link || "",
                    activities,
                    reviews,
                    status: row[3] && !row[3].toLowerCase().includes("found") ? clean(row[3]) : "",
                });
                i += 2;
            } else {
                const { activities, reviews } = splitActivityReviews(cell2);
                parsedVenues.push({
                    venueAndLocation: clean(cell0),
                    contactsAndPersonnel: clean(cell1),
                    link: "",
                    activities,
                    reviews,
                    status: row[3] && !row[3].toLowerCase().includes("found") ? clean(row[3]) : "",
                });
                i++;
            }
        }
    }

    return parsedVenues;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sheetId, validateOnly, markdownText } = body;

        if (!sheetId) {
            return NextResponse.json({ error: "Missing sheetId" }, { status: 400 });
        }

        const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
        const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

        if (!clientEmail || !privateKey) {
            return NextResponse.json({ error: "Google credentials not configured on server" }, { status: 500 });
        }

        // Authenticate with Google
        const auth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const doc = new GoogleSpreadsheet(sheetId, auth);
        
        try {
            await doc.loadInfo(); 
        } catch (e: any) {
             return NextResponse.json({ error: `Could not access spreadsheet. Did you share it with ${clientEmail}? Error: ${e.message}` }, { status: 403 });
        }

        if (validateOnly) {
            return NextResponse.json({ success: true, sheetTitle: doc.title });
        }

        if (!markdownText) {
             return NextResponse.json({ error: "Missing markdownText" }, { status: 400 });
        }

        const dataRows = extractDataRows(markdownText);
        
        if (dataRows.length === 0) {
            return NextResponse.json(
                { error: "No data rows found in Markdown. Please check your table format." },
                { status: 400 }
            );
        }

        const parsedVenues = parseActivityVenues(dataRows);
        const sheet = doc.sheetsByIndex[0]; // Append to first tab
        
        // Ensure headers exist
        await sheet.loadHeaderRow().catch(async () => {
            // If the sheet is completely blank, we initialize the headers
            await sheet.setHeaderRow(["Venue_Location", "Contacts"]);
        });

        const errors: string[] = [];
        let exportedCount = 0;
        
        // Track the row numbers where we insert the hyperlinks so we can remove the underline
        const hyperlinkedRowIndices: number[] = [];

        for (const venue of parsedVenues) {
            try {
                let venueNameCell = venue.venueAndLocation;
                if (venue.link) {
                    const parts = venue.venueAndLocation.split('\n');
                    const venueName = parts[0] ? parts[0].trim() : '';
                    const address = parts.length > 1 ? parts.slice(1).join(', ').trim() : '';
                    
                    const safeName = venueName.replace(/"/g, '""'); // Escape quotes
                    const safeAddress = address.replace(/"/g, '""'); // Escape quotes
                    
                    if (address) {
                        venueNameCell = `=HYPERLINK("${venue.link}", "📍${safeName}") & CHAR(10) & "${safeAddress}"`;
                    } else {
                        venueNameCell = `=HYPERLINK("${venue.link}", "📍${safeName}")`;
                    }
                }

                // Insert Row: Everything in one cell per column
                const row1 = await sheet.addRow({
                    Venue_Location: venueNameCell,
                    Contacts: venue.contactsAndPersonnel
                });
                
                if (venue.link) {
                    hyperlinkedRowIndices.push(row1.rowNumber - 1); // 0-indexed for getCell
                }
                
                exportedCount++;
            } catch (err: any) {
                 errors.push(`Failed on ${venue.venueAndLocation.substring(0,20)}: ${err.message}`);
            }
        }
        
        // Post-processing: Remove underlines from the hyperlinks
        if (hyperlinkedRowIndices.length > 0) {
            try {
                const minRow = Math.min(...hyperlinkedRowIndices);
                const maxRow = Math.max(...hyperlinkedRowIndices);
                
                // Load only the cells in Column A that we just added
                await sheet.loadCells(`A${minRow + 1}:A${maxRow + 1}`);
                
                for (const rowIndex of hyperlinkedRowIndices) {
                    const cell = sheet.getCell(rowIndex, 0);
                    // Explicitly set underline to false without spreading to ensure it applies
                    cell.textFormat = { underline: false };
                }
                
                // Save the formatting changes back to Google Sheets
                await sheet.saveUpdatedCells();
            } catch (formatErr) {
                console.error("Failed to format underlines:", formatErr);
            }
        }

        return NextResponse.json({
            success: true,
            totalFound: parsedVenues.length,
            exportedCount,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error: any) {
        console.error("[sheets/sync-md] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
