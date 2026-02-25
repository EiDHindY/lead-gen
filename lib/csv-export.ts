import type { Venue, VenuePersonnel } from "./supabase";

interface ExportRow {
    venue: Venue;
    personnel: VenuePersonnel[];
}

/**
 * Generate CSV string from venue + personnel data
 */
export function generateCSV(rows: ExportRow[]): string {
    const headers = [
        "Venue Name",
        "Address",
        "Rating",
        "Total Ratings",
        "Opening Days",
        "Venue Phone",
        "Website",
        "Google Maps",
        "Categories",
        "Status",
        "Personnel Name",
        "Personnel Title",
        "Personnel Phone",
        "Personnel Email",
        "Recommended Pitch",
    ];

    const csvRows: string[] = [headers.join(",")];

    for (const { venue, personnel } of rows) {
        if (personnel.length === 0) {
            // Venue with no personnel — single row
            csvRows.push(
                formatRow([
                    venue.name,
                    venue.address || "",
                    venue.rating?.toString() || "",
                    venue.total_ratings?.toString() || "",
                    venue.opening_days_count?.toString() || "",
                    venue.phone || "",
                    venue.website || "",
                    venue.google_maps_url || "",
                    venue.types?.join("; ") || "",
                    venue.status,
                    "",
                    "",
                    "",
                    "",
                    "",
                ])
            );
        } else {
            // One row per personnel member
            for (const person of personnel) {
                csvRows.push(
                    formatRow([
                        venue.name,
                        venue.address || "",
                        venue.rating?.toString() || "",
                        venue.total_ratings?.toString() || "",
                        venue.opening_days_count?.toString() || "",
                        venue.phone || "",
                        venue.website || "",
                        venue.google_maps_url || "",
                        venue.types?.join("; ") || "",
                        venue.status,
                        person.name,
                        person.title || "",
                        person.phone || "",
                        person.email || "",
                        person.recommended_pitch || "",
                    ])
                );
            }
        }
    }

    return csvRows.join("\n");
}

/**
 * Escape and format a CSV row
 */
function formatRow(values: string[]): string {
    return values.map(escapeCSV).join(",");
}

function escapeCSV(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
