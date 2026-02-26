// Notion API helper — Export venues to Notion databases
// Each campaign can have its own Notion workspace/database

interface NotionVenueData {
    venueName: string;
    address: string;
    googleMapsUrl?: string;
    contacts: string;     // Formatted: "owner: Name\nvenue_number: +1..."
    recommended: string;  // Formatted: "Rating: X Stars\nSchedule: ...\nPitch: ..."
}

/**
 * Export a single venue to a Notion database
 */
export async function exportVenueToNotion(
    notionToken: string,
    databaseId: string,
    venue: NotionVenueData
): Promise<{ success: boolean; pageId?: string; error?: string }> {
    try {
        const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${notionToken}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            body: JSON.stringify({
                parent: { database_id: databaseId },
                properties: {
                    // Title column: Venue_Location
                    Venue_Location: {
                        title: [
                            {
                                text: {
                                    content: venue.venueName + "\n",
                                },
                            },
                            {
                                text: {
                                    content: venue.address + (venue.googleMapsUrl ? "\n" : ""),
                                },
                            },
                            ...(venue.googleMapsUrl
                                ? [
                                    {
                                        text: {
                                            content: venue.googleMapsUrl,
                                            link: { url: venue.googleMapsUrl },
                                        },
                                    },
                                ]
                                : []),
                        ],
                    },
                    // Rich text: Contacts
                    Contacts: {
                        rich_text: [
                            {
                                text: {
                                    content: venue.contacts.substring(0, 2000), // Notion limit
                                },
                            },
                        ],
                    },
                    // Rich text: Recommended
                    Recommended: {
                        rich_text: [
                            {
                                text: {
                                    content: venue.recommended.substring(0, 2000),
                                },
                            },
                        ],
                    },
                },
                // Page content: address as a block
                children: [
                    {
                        object: "block",
                        type: "paragraph",
                        paragraph: {
                            rich_text: [
                                {
                                    text: {
                                        content: venue.address,
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
        });

        if (!res.ok) {
            const body = await res.json();
            console.error("[notion] API Error:", JSON.stringify(body, null, 2));
            return {
                success: false,
                error: body.message || `Notion API error: ${res.status}`,
            };
        }

        const data = await res.json();
        return { success: true, pageId: data.id };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Export multiple venues to Notion with progress tracking
 */
export async function exportVenuesToNotion(
    notionToken: string,
    databaseId: string,
    venues: NotionVenueData[],
    onProgress?: (current: number, total: number) => void
): Promise<{ exported: number; errors: string[] }> {
    let exported = 0;
    const errors: string[] = [];

    for (let i = 0; i < venues.length; i++) {
        const result = await exportVenueToNotion(notionToken, databaseId, venues[i]);

        if (result.success) {
            exported++;
        } else {
            errors.push(`${venues[i].venueName}: ${result.error}`);
        }

        onProgress?.(i + 1, venues.length);

        // Rate limit: Notion allows ~3 requests/second
        await new Promise((r) => setTimeout(r, 350));
    }

    return { exported, errors };
}

/**
 * Validate Notion connection by trying to query the database
 */
export async function validateNotionConnection(
    notionToken: string,
    databaseId: string
): Promise<{ valid: boolean; dbTitle?: string; error?: string }> {
    try {
        const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
            headers: {
                Authorization: `Bearer ${notionToken}`,
                "Notion-Version": "2022-06-28",
            },
        });

        if (!res.ok) {
            const body = await res.json();
            return {
                valid: false,
                error: body.message || `Notion API error: ${res.status}`,
            };
        }

        const data = await res.json();
        const title = data.title?.[0]?.plain_text || "Untitled";
        return { valid: true, dbTitle: title };
    } catch (err: any) {
        return { valid: false, error: err.message };
    }
}
