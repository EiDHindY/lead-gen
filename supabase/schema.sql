-- =============================================
-- Lead Generation App — Database Schema
-- =============================================

-- Campaigns (e.g., "TLC USA")
CREATE TABLE campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  product_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-venue-type rules within a campaign
CREATE TABLE campaign_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  venue_type TEXT NOT NULL,              -- e.g., 'cafe', 'restaurant'
  min_rating NUMERIC DEFAULT 0,
  min_opening_days INTEGER DEFAULT 0,
  exclude_chains BOOLEAN DEFAULT false,
  exclude_keywords TEXT[] DEFAULT '{}',  -- e.g., ['Starbucks', 'Costa']
  custom_notes TEXT,                     -- free text fed to AI for filtering
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Neighborhoods to search within a campaign
CREATE TABLE neighborhoods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  boundary_polygon JSONB,
  status TEXT DEFAULT 'pending',
  venues_found INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Processed venues (deduplication via fsq_id)
CREATE TABLE venues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  neighborhood_id UUID REFERENCES neighborhoods(id),
  fsq_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  rating NUMERIC,
  total_ratings INTEGER,
  opening_hours JSONB,
  opening_days_count INTEGER,
  phone TEXT,
  website TEXT,
  google_maps_url TEXT,
  types TEXT[],
  ai_research_raw TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personnel found per venue (multiple people per venue)
CREATE TABLE venue_personnel (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  email TEXT,
  recommended_pitch TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_rules_campaign ON campaign_rules(campaign_id);
CREATE INDEX idx_venues_fsq_id ON venues(fsq_id);
CREATE INDEX idx_venues_campaign ON venues(campaign_id);
CREATE INDEX idx_personnel_venue ON venue_personnel(venue_id);
