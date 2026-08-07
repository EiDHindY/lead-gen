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

        // Extract the actual ID if the user pasted a full URL
        let extractedSheetId = sheetId;
        const sheetIdMatch = sheetId.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (sheetIdMatch && sheetIdMatch[1]) {
            extractedSheetId = sheetIdMatch[1];
        } else {
            // Fallback: If they pasted just the ID with /edit?gid=...
            const fallbackMatch = sheetId.match(/^([a-zA-Z0-9-_]+)/);
            if (fallbackMatch && fallbackMatch[1]) {
                extractedSheetId = fallbackMatch[1];
            }
        }

        const doc = new GoogleSpreadsheet(extractedSheetId, auth);
        
        try {
            await doc.loadInfo(); 
        } catch (e: any) {
             return NextResponse.json({ error: `Could not access spreadsheet. Did you share it with ${clientEmail}? Error: ${e.message}` }, { status: 403 });
        }

        // Check if the URL specifies a particular tab via 'gid'
        const gidMatch = sheetId?.match(/gid=([0-9]+)/);
        let sheet;
        
        if (gidMatch && gidMatch[1]) {
            const gid = parseInt(gidMatch[1], 10);
            sheet = doc.sheetsById[gid];
            if (!sheet) {
                return NextResponse.json({ success: false, error: `Tab with ID ${gid} not found in this spreadsheet.` }, { status: 400 });
            }
        } else {
            // Default to the first tab
            sheet = doc.sheetsByIndex[0]; 
        }

        if (validateOnly) {
            return NextResponse.json({ success: true, sheetTitle: doc.title, tabTitle: sheet.title });
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
        
        // Ensure headers exist
        await sheet.loadHeaderRow().catch(async () => {
            // If the sheet is completely blank, we initialize the headers
            await sheet.setHeaderRow(["Venue_Location", "Phone", "Contacts"]);
        });

        const errors: string[] = [];
        let exportedCount = 0;

        for (const venue of parsedVenues) {
            try {
                let venueNameCell = venue.venueAndLocation;
                if (venue.link) {
                    // Send the raw URL so Google's AI-enhanced table can convert it to a Place Chip
                    venueNameCell = venue.link;
                }

                // Extract Phone and Contact Name
                let phone = "";
                let contactName = "";
                const contactParts = venue.contactsAndPersonnel.split('\n');
                for (const part of contactParts) {
                    if (part.toLowerCase().includes("phone:")) {
                        const val = part.replace(/phone:/i, "").trim();
                        phone = phone ? `${phone}\n${val}` : val;
                    } else if (part.toLowerCase().includes("personnel:")) {
                        let val = part.replace(/personnel:/i, "").trim();
                        
                        // Smart split: If multiple people are comma-separated (e.g. "John - Owner, Jane - Manager")
                        // this regex finds a comma that is followed by a capitalized Name and a hyphen, 
                        // and replaces that comma with a newline to stack them perfectly.
                        val = val.replace(/,\s+(?=[A-Z][\w\s&'-]+ -)/g, '\n');
                        
                        contactName = contactName ? `${contactName}\n${val}` : val;
                    } else if (part.trim() !== "") {
                        // Fallback if labels are missing
                        if (/\d/.test(part)) {
                            phone = phone ? `${phone}\n${part.trim()}` : part.trim();
                        } else {
                            contactName = contactName ? `${contactName}\n${part.trim()}` : part.trim();
                        }
                    }
                }
                
                // Prevent Google Sheets from treating phone numbers starting with + as formulas
                if (phone && (phone.startsWith('+') || phone.startsWith('-') || phone.startsWith('='))) {
                    phone = `'${phone}`;
                }

                // Insert Row: Everything in one cell per column
                await sheet.addRow({
                    Venue_Location: venueNameCell,
                    Phone: phone,
                    Contacts: contactName
                });
                
                exportedCount++;
            } catch (err: any) {
                 errors.push(`Failed on ${venue.venueAndLocation.substring(0,20)}: ${err.message}`);
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
