import fs from "fs";
import path from "path";

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
    const token = notionToken.trim();
    const dbId = databaseId.trim();

    try {
        const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            cache: "no-store",
            body: JSON.stringify({
                parent: { database_id: dbId },
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
    const token = notionToken.trim();
    const dbId = databaseId.trim();

    try {
        const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Notion-Version": "2022-06-28",
            },
            cache: "no-store",
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

// --- New Custom Impl for Markdown Table Sync ---

export interface CustomNotionVenue {
    venueAndLocation: string; // The Name + Address
    contactsAndPersonnel: string; // The combined Phone + Personnel
    link?: string; // Optional clickable link
    activities?: string; // NEW: Dedicated activities field
    reviews?: string; // NEW: Dedicated reviews field
    pitch?: string; // Optional pitch string
}

/**
 * Fetch the database schema and find property names that match our expected columns.
 * This handles cases where properties have emoji prefixes or slight naming differences.
 */
export async function discoverPropertyNames(
    notionToken: string,
    databaseId: string
): Promise<{
    success: boolean;
    venueKey?: string;
    contactsKey?: string;
    activitiesKey?: string;
    reviewsKey?: string;
    pitchKey?: string;
    statusKey?: string;
    areaKey?: string;
    allProperties?: string[];
    error?: string;
}> {
    const token = notionToken.trim();
    const dbId = databaseId.trim();

    try {
        const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Notion-Version": "2022-06-28",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            const body = await res.json();
            return { success: false, error: body.message || `Notion API error: ${res.status}` };
        }

        const data = await res.json();
        const properties = data.properties || {};
        const propertyNames = Object.keys(properties);
        const propertyDetails = propertyNames.map(name => ({
            name,
            type: properties[name].type
        }));

        console.log("[notion] All property details found:", JSON.stringify(propertyDetails, null, 2));

        // Find matching properties using case-insensitive matching
        // Use multiple keywords per field to find the best match
        const findProp = (keywords: string[]) => {
            // First try to find a property that contains ALL keywords
            for (let k = keywords.length; k > 0; k--) {
                const match = propertyNames.find((name: string) => {
                    const lower = name.toLowerCase();
                    return keywords.slice(0, k).every(kw => lower.includes(kw.toLowerCase()));
                });
                if (match) return match;
            }
            return undefined;
        };

        const venueKey = findProp(["venue", "location"]) || findProp(["venue"]);
        const contactsKey = findProp(["contacts", "personnel"]) || findProp(["contacts"]);
        const activitiesKey = findProp(["activities"]) || findProp(["activity"]);
        const reviewsKey = findProp(["reviews"]) || findProp(["review"]);
        const pitchKey = findProp(["pitch", "recommended"]) || findProp(["recommended"]);
        const statusKey = findProp(["status", "notes", "task_notes"]) || findProp(["notes"]);
        let areaKey = findProp(["area"]) || findProp(["leads"]);

        // Fallback: If no "Area" found by name, look for ANY relation property
        if (!areaKey) {
            const firstRelation = propertyNames.find(name => properties[name].type === "relation");
            if (firstRelation) {
                console.log(`[notion] No "Area" found by name, but found a relation property: "${firstRelation}". Using it.`);
                areaKey = firstRelation;
            }
        }

        if (!venueKey || !contactsKey) {
            console.error(`[notion] Missing required properties. Available: [${propertyNames.join(", ")}]`);
            return {
                success: false,
                allProperties: propertyNames,
                error: `Could not find all required properties. Found: venue=${venueKey || "NOT FOUND"}, contacts=${contactsKey || "NOT FOUND"}. Available properties: [${propertyNames.join(", ")}]`,
            };
        }

        if (!areaKey) {
            console.warn(`[notion] areaKey NOT found. Available: [${propertyNames.join(", ")}]`);
        }

        console.log("[notion] All property names found:", propertyNames);
        console.log(`[notion] Matching results: venue="${venueKey}", contacts="${contactsKey}", area="${areaKey}"`);

        // Write to a debug file so I can read it
        try {
            const debugPath = "/home/dod/projects/lola/lead_gen/notion_debug.json";
            fs.writeFileSync(debugPath, JSON.stringify({
                found: propertyDetails,
                matching: { venueKey, contactsKey, areaKey }
            }, null, 2));
        } catch (e) {}

        return { success: true, venueKey, contactsKey, activitiesKey, reviewsKey, pitchKey, statusKey, areaKey, allProperties: propertyNames };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Export a single parsed markdown venue to the Notion database.
 * Uses dynamically discovered property names instead of hardcoded keys.
 */
export async function exportCustomVenueToNotion(
    notionToken: string,
    databaseId: string,
    venue: CustomNotionVenue,
    propertyKeys: { venueKey: string; contactsKey: string; activitiesKey?: string; reviewsKey?: string; pitchKey?: string; statusKey?: string; areaKey?: string },
    areaId?: string
): Promise<{ success: boolean; pageId?: string; error?: string }> {
    const token = notionToken.trim();
    const dbId = databaseId.trim();

    try {
        const body = {
            parent: { database_id: dbId },
            properties: {
                [propertyKeys.venueKey]: {
                    title: (() => {
                        const blocks: any[] = [
                            { text: { content: venue.venueAndLocation.substring(0, 2000) } },
                        ];
                        if (venue.link) {
                            blocks.push(
                                { text: { content: "\n" } },
                                {
                                    text: {
                                        content: venue.link.substring(0, 2000),
                                        link: { url: venue.link },
                                    },
                                }
                            );
                        }
                        return blocks;
                    })(),
                },
                [propertyKeys.contactsKey]: {
                    rich_text: [
                        {
                            text: {
                                content: venue.contactsAndPersonnel.substring(0, 2000),
                            },
                        },
                    ],
                },
                ...(propertyKeys.activitiesKey && venue.activities ? {
                    [propertyKeys.activitiesKey]: {
                        rich_text: [{ text: { content: venue.activities.substring(0, 2000) } }]
                    }
                } : {}),
                ...(propertyKeys.reviewsKey && venue.reviews ? {
                    [propertyKeys.reviewsKey]: {
                        rich_text: [{ text: { content: venue.reviews.substring(0, 2000) } }]
                    }
                } : {}),
                ...(propertyKeys.statusKey && (venue as any).status ? {
                    [propertyKeys.statusKey]: {
                        rich_text: [{ text: { content: (venue as any).status.substring(0, 2000) } }]
                    }
                } : {}),
                ...(propertyKeys.pitchKey && venue.pitch ? {
                    [propertyKeys.pitchKey]: {
                        rich_text: [{ text: { content: venue.pitch.substring(0, 2000) } }]
                    }
                } : {}),
                ...(areaId ? (() => {
                    // The Notion API doesn't expose relation properties in discovery for some databases.
                    // We bypass discovery and directly use the property name from Notion.
                    // Try the discovered areaKey first, fallback to "Areas" (exact name from user's DB).
                    const relPropName = propertyKeys.areaKey || "Areas";
                    return {
                        [relPropName]: {
                            relation: [{ id: areaId }]
                        }
                    };
                })() : {}),

            },
        };

        console.log(`[notion] Sending request to Notion:`, JSON.stringify(body, null, 2));
        console.log(`[notion] Area ID being sent: ${areaId}, Area Key: ${propertyKeys.areaKey}`);

        const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            cache: "no-store",
            body: JSON.stringify(body),
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

// ── TLC Coffee ──

export interface CoffeeNotionVenue {
    venueAndLocation: string;
    contactsAndPersonnel: string;
    link?: string;
}

/**
 * Export a single TLC Coffee venue to Notion.
 * Simpler than the Activity export — only writes Venue_Location + Contacts.
 */
export async function exportCoffeeVenueToNotion(
    notionToken: string,
    databaseId: string,
    venue: CoffeeNotionVenue,
    propertyKeys: { venueKey: string; contactsKey: string; areaKey?: string },
    areaId?: string
): Promise<{ success: boolean; pageId?: string; error?: string }> {
    const token = notionToken.trim();
    const dbId = databaseId.trim();

    try {
        const body = {
            parent: { database_id: dbId },
            properties: {
                [propertyKeys.venueKey]: {
                    title: (() => {
                        const blocks: any[] = [
                            { text: { content: venue.venueAndLocation.substring(0, 2000) } },
                        ];
                        if (venue.link) {
                            blocks.push(
                                { text: { content: "\n" } },
                                {
                                    text: {
                                        content: venue.link.substring(0, 2000),
                                        link: { url: venue.link },
                                    },
                                }
                            );
                        }
                        return blocks;
                    })(),
                },
                [propertyKeys.contactsKey]: {
                    rich_text: [
                        {
                            text: {
                                content: venue.contactsAndPersonnel.substring(0, 2000),
                            },
                        },
                    ],
                },
                ...(areaId ? (() => {
                    const relPropName = propertyKeys.areaKey || "Areas";
                    return {
                        [relPropName]: {
                            relation: [{ id: areaId }]
                        }
                    };
                })() : {}),
            },
        };

        console.log(`[notion][coffee] Sending request:`, JSON.stringify(body, null, 2));

        const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            cache: "no-store",
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const body = await res.json();
            console.error("[notion][coffee] API Error:", JSON.stringify(body, null, 2));
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
