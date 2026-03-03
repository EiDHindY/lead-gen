import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('name, boundary_polygon')
        .ilike('name', '%Chatswood%')
        .limit(1)
        .single();

    if (!neighborhood) return console.log("Not found");

    console.log("Name:", neighborhood.name);
    console.log("Has GeoJSON:", !!neighborhood.boundary_polygon?.geojson);
    if (neighborhood.boundary_polygon?.geojson) {
        console.log("GeoJSON Type:", neighborhood.boundary_polygon.geojson.type);
        const coords = neighborhood.boundary_polygon.geojson.coordinates;
        console.log("Depth array check:");
        console.log("coords is Array?", Array.isArray(coords));
        if (Array.isArray(coords)) {
            console.log("coords[0] is Array?", Array.isArray(coords[0]));
            if (Array.isArray(coords[0])) {
                console.log("coords[0][0] is Array?", Array.isArray(coords[0][0]));
                if (Array.isArray(coords[0][0])) {
                    console.log("coords[0][0][0] is Array?", Array.isArray(coords[0][0][0]));
                }
            }
        }
    }
}
main();
