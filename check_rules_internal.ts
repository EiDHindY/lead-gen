import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as dotenv from "dotenv";

// Load env from .env.local
const envFile = "/home/dod/projects/lead_gen/.env.local";
if (fs.existsSync(envFile)) {
    const envConfig = dotenv.parse(fs.readFileSync(envFile));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRules() {
    const campaignId = '9cacbfa7-4e83-4e61-b89f-e7b39e4802b7';
    console.log(`Checking rules for campaign: ${campaignId}`);

    const { data: rules, error } = await supabase
        .from("campaign_rules")
        .select("*")
        .eq("campaign_id", campaignId);

    if (error) {
        console.error("Supabase Error:", error);
        return;
    }

    console.log(`Found ${rules?.length || 0} rules:`);
    rules?.forEach(r => {
        console.log(`- Type: ${r.venue_type}, ID: ${r.id}`);
    });
}

checkRules().catch(console.error);
