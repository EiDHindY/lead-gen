import { createClient } from "@supabase/supabase-js";


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    const { data: neighborhoods, error } = await supabase
        .from('neighborhoods')
        .select('*')
        .ilike('name', '%Chatswood%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (!neighborhoods || neighborhoods.length === 0) {
        console.log("No Chatswood found");
        return;
    }

    for (const nb of neighborhoods) {
        console.log(`Neighborhood: ${nb.name}`);
        const bb = nb.boundary_polygon?.boundingbox;
        console.log(`Bounding Box:`, bb);

        if (bb) {
            const [south, north, west, east] = bb.map(Number);
            const centerLat = (south + north) / 2;
            const centerLng = (west + east) / 2;

            const latDiff = Math.abs(north - south);
            const lngDiff = Math.abs(east - west);
            const latMeters = latDiff * 111000;
            const lngMeters = lngDiff * 111000 * Math.cos(((south + north) / 2) * (Math.PI / 180));

            // Half the diagonal gives us a rough radius
            const initialRadius = Math.round(Math.sqrt(latMeters ** 2 + lngMeters ** 2) / 2);
            const cappedRadius = Math.min(initialRadius, 50000);

            console.log(`Center: ${centerLat}, ${centerLng}`);
            console.log(`Calculated Radius: ${initialRadius}m (Capped: ${cappedRadius}m)`);
            console.log("---");
        }
    }
}

main();
