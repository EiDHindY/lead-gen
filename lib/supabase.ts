import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Type definitions matching our schema ──

export interface Campaign {
  id: string;
  name: string;
  product_description: string | null;
  created_at: string;
}

export interface CampaignRule {
  id: string;
  campaign_id: string;
  venue_type: string;
  min_rating: number;
  min_opening_days: number;
  exclude_chains: boolean;
  exclude_keywords: string[];
  custom_notes: string | null;
  created_at: string;
}

export interface Neighborhood {
  id: string;
  campaign_id: string;
  name: string;
  display_name: string | null;
  boundary_polygon: Record<string, unknown> | null;
  status: "pending" | "searching" | "completed";
  venues_found: number;
  searched_at: string | null;
  created_at: string;
}

export interface Venue {
  id: string;
  campaign_id: string;
  neighborhood_id: string | null;
  fsq_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  total_ratings: number | null;
  opening_hours: Record<string, unknown> | null;
  opening_days_count: number | null;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  types: string[] | null;
  ai_research_raw: string | null;
  status: "new" | "researched" | "called" | "skipped";
  created_at: string;
}

export interface VenuePersonnel {
  id: string;
  venue_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  recommended_pitch: string | null;
  created_at: string;
}
