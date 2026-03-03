import { createClient } from "@supabase/supabase-js";


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    const { data: venues, error } = await supabase
        .from('venues')
        .select('name, types, ai_research_raw')
        .ilike('name', '%Kuma Don%')
        .limit(1);

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (!venues || venues.length === 0) {
        console.log("No Kuma Don found");
        return;
    }

    const v = venues[0];
    console.log(`Venue: ${v.name}`);
    console.log(`Types:`, JSON.stringify(v.types));
    console.log(`AI Raw:`, v.ai_research_raw);
}

main();
