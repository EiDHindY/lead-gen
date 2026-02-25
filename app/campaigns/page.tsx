"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type Campaign, type CampaignRule } from "@/lib/supabase";

interface CampaignWithRules extends Campaign {
    rules: CampaignRule[];
}

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<CampaignWithRules[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCampaigns();
    }, []);

    async function loadCampaigns() {
        const { data: campaignData } = await supabase
            .from("campaigns")
            .select("*")
            .order("created_at", { ascending: false });

        if (!campaignData) {
            setLoading(false);
            return;
        }

        const withRules: CampaignWithRules[] = [];
        for (const c of campaignData) {
            const { data: rules } = await supabase
                .from("campaign_rules")
                .select("*")
                .eq("campaign_id", c.id);

            withRules.push({
                ...c,
                rules: (rules as CampaignRule[]) || [],
            });
        }

        setCampaigns(withRules);
        setLoading(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">Campaigns</h1>
                    <p className="text-muted">Manage your lead generation campaigns</p>
                </div>
                <Link
                    href="/campaigns/new"
                    className="px-6 py-3 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
                >
                    + New Campaign
                </Link>
            </div>

            {loading ? (
                <div className="text-center text-muted py-16">Loading...</div>
            ) : campaigns.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="text-5xl mb-4">📋</div>
                    <h2 className="text-xl font-semibold mb-2">No campaigns yet</h2>
                    <p className="text-muted mb-6">Create one to get started</p>
                    <Link
                        href="/campaigns/new"
                        className="inline-flex px-6 py-3 rounded-lg bg-primary text-white font-medium"
                    >
                        + Create Campaign
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {campaigns.map((c) => (
                        <Link key={c.id} href={`/campaigns/${c.id}`}>
                            <div className="glass-card p-6 hover:border-primary/50 transition-all cursor-pointer mb-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-foreground">
                                            {c.name}
                                        </h3>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {c.rules.map((rule) => (
                                                <div key={rule.id} className="badge badge-new">
                                                    {rule.venue_type.replace(/_/g, " ")}
                                                    {rule.min_rating > 0 && ` ⭐${rule.min_rating}+`}
                                                    {rule.exclude_chains && " 🚫chains"}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-muted text-sm">
                                        {new Date(c.created_at).toLocaleDateString()}
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
