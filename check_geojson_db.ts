import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as dotenv from "dotenv";

const envFile = "/home/dod/projects/lead_gen/.env.local";
if (fs.existsSync(envFile)) {
    const envConfig = dotenv.parse(fs.readFileSync(envFile));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function checkGeoJSON() {
    const campaignId = '9cacbfa7-4e83-4e61-b89f-e7b39e4802b7';
    const { data: nb } = await supabase.from("neighborhoods").select("*").eq("campaign_id", campaignId).eq("name", "Miami-Dade County").single();

    if (!nb) {
        console.log("Neighborhood not found by name, fetching all for campaign...");
        const { data: all } = await supabase.from("neighborhoods").select("*").eq("campaign_id", campaignId);
        console.log("Available neighborhoods:", all?.map(n => n.name));
        return;
    }

    console.log(`Neighborhood: ${nb.name}`);
    console.log(`GeoJSON Type: ${nb.boundary_polygon?.geojson?.type}`);
    console.log(`Bounding Box: ${JSON.stringify(nb.boundary_polygon?.boundingbox)}`);

    // Check if coordinates exist
    if (nb.boundary_polygon?.geojson?.coordinates) {
        console.log(`Coordinates depth: ${nb.boundary_polygon.geojson.coordinates.length} (first element length: ${nb.boundary_polygon.geojson.coordinates[0]?.length})`);
    } else {
        console.log("NO GEOJSON COORDINATES FOUND!");
    }
}

checkGeoJSON().catch(console.error);
