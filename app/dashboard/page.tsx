"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type Campaign, type CampaignRule } from "@/lib/supabase";

interface CampaignStats extends Campaign {
  rules: CampaignRule[];
  total_venues: number;
  total_neighborhoods: number;
  completed_neighborhoods: number;
}

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<CampaignStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    setLoading(true);

    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (!campaignData) {
      setLoading(false);
      return;
    }

    const stats: CampaignStats[] = [];

    for (const c of campaignData) {
      const { data: rules } = await supabase
        .from("campaign_rules")
        .select("*")
        .eq("campaign_id", c.id);

      const { count: venueCount } = await supabase
        .from("venues")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", c.id);

      const { data: neighborhoods } = await supabase
        .from("neighborhoods")
        .select("status")
        .eq("campaign_id", c.id);

      stats.push({
        ...c,
        rules: (rules as CampaignRule[]) || [],
        total_venues: venueCount || 0,
        total_neighborhoods: neighborhoods?.length || 0,
        completed_neighborhoods:
          neighborhoods?.filter((n) => n.status === "completed").length || 0,
      });
    }

    setCampaigns(stats);
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted">Your lead generation overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-6">
          <div className="text-muted text-sm mb-1">Total Campaigns</div>
          <div className="text-3xl font-bold text-foreground">
            {loading ? "..." : campaigns.length}
          </div>
        </div>
        <div className="glass-card p-6">
          <div className="text-muted text-sm mb-1">Total Leads</div>
          <div className="text-3xl font-bold text-primary">
            {loading ? "..." : campaigns.reduce((sum, c) => sum + c.total_venues, 0)}
          </div>
        </div>
        <div className="glass-card p-6">
          <div className="text-muted text-sm mb-1">Areas Covered</div>
          <div className="text-3xl font-bold text-secondary">
            {loading ? "..." : campaigns.reduce((sum, c) => sum + c.completed_neighborhoods, 0)}
          </div>
        </div>
      </div>

      {/* Campaign Cards */}
      {loading ? (
        <div className="text-center text-muted py-16">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            No Campaigns Yet
          </h2>
          <p className="text-muted mb-6">
            Create your first campaign to start finding leads
          </p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center px-6 py-3 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            + Create Campaign
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((campaign) => (
            <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
              <div className="glass-card p-6 hover:border-primary/50 transition-all cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {campaign.name}
                    </h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {campaign.rules.map((rule) => (
                        <span key={rule.id} className="badge badge-new">
                          {rule.venue_type.replace(/_/g, " ")}
                          {rule.min_rating > 0 && ` ⭐${rule.min_rating}+`}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {campaign.total_venues}
                    </div>
                    <div className="text-xs text-muted">leads</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>
                      {campaign.completed_neighborhoods} / {campaign.total_neighborhoods} areas
                    </span>
                    <span>{campaign.rules.length} rules</span>
                  </div>
                  <div className="w-full bg-border rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-primary to-secondary rounded-full h-2 transition-all"
                      style={{
                        width: `${campaign.total_neighborhoods > 0
                            ? (campaign.completed_neighborhoods / campaign.total_neighborhoods) * 100
                            : 0
                          }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
