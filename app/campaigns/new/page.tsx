"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

import { VENUE_GROUPS, RuleInput, emptyRule } from "./constants";

import { VenueRulesForm } from "./components/VenueRulesForm";

export default function NewCampaignPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [productDescription, setProductDescription] = useState("");
    const [rules, setRules] = useState<RuleInput[]>([{ ...emptyRule }]);
    const [saving, setSaving] = useState(false);
    const [customTypeInput, setCustomTypeInput] = useState<Record<number, string>>({});
    // Track which groups are expanded per rule
    const [expandedGroups, setExpandedGroups] = useState<
        Record<string, boolean>
    >({});

    function addRule() {
        setRules([...rules, { ...emptyRule, venue_types: [] }]);
    }

    function removeRule(index: number) {
        setRules(rules.filter((_, i) => i !== index));
    }

    function updateRule(index: number, field: keyof RuleInput, value: unknown) {
        const updated = [...rules];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updated[index] = { ...updated[index], [field]: value as any };
        setRules(updated);
    }

    function toggleVenueType(ruleIndex: number, type: string) {
        const current = rules[ruleIndex].venue_types;
        const updated = current.includes(type)
            ? current.filter((t) => t !== type)
            : [...current, type];
        updateRule(ruleIndex, "venue_types", updated);
    }

    function updateTypeNotes(ruleIndex: number, type: string, notes: string) {
        const current = { ...rules[ruleIndex].custom_notes_per_type };
        current[type] = notes;
        updateRule(ruleIndex, "custom_notes_per_type", current);
    }

    function updateTypeRating(ruleIndex: number, type: string, val: number) {
        const current = { ...rules[ruleIndex].min_rating_per_type };
        current[type] = val;
        updateRule(ruleIndex, "min_rating_per_type", current);
    }

    function updateTypeDays(ruleIndex: number, type: string, val: number) {
        const current = { ...rules[ruleIndex].min_days_per_type };
        current[type] = val;
        updateRule(ruleIndex, "min_days_per_type", current);
    }

    function addCustomType(ruleIndex: number) {
        const raw = (customTypeInput[ruleIndex] || "").trim().toLowerCase().replace(/\s+/g, "_");
        if (!raw) return;
        const current = rules[ruleIndex].venue_types;
        if (!current.includes(raw)) {
            updateRule(ruleIndex, "venue_types", [...current, raw]);
        }
        setCustomTypeInput((prev) => ({ ...prev, [ruleIndex]: "" }));
    }

    function toggleGroup(ruleIndex: number, groupLabel: string) {
        const key = `${ruleIndex}-${groupLabel}`;
        setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    function toggleAllInGroup(
        ruleIndex: number,
        types: string[],
        allSelected: boolean
    ) {
        const current = rules[ruleIndex].venue_types;
        let updated: string[];
        if (allSelected) {
            // Deselect all in group
            updated = current.filter((t) => !types.includes(t));
        } else {
            // Select all in group
            const toAdd = types.filter((t) => !current.includes(t));
            updated = [...current, ...toAdd];
        }
        updateRule(ruleIndex, "venue_types", updated);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const validRules = rules.filter((r) => r.venue_types.length > 0);
        if (!name || validRules.length === 0) {
            alert("Please enter a campaign name and select at least one venue type");
            return;
        }

        setSaving(true);

        // 1. Create campaign
        const { data: campaign, error: campErr } = await supabase
            .from("campaigns")
            .insert({
                name,
                product_description: productDescription || null,
            })
            .select()
            .single();

        if (campErr || !campaign) {
            alert("Failed to create campaign: " + campErr?.message);
            setSaving(false);
            return;
        }

        // 2. Create one rule row PER venue type (backend treats them individually)
        for (const rule of validRules) {
            const keywords = rule.exclude_keywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean);

            for (const venueType of rule.venue_types) {
                await supabase.from("campaign_rules").insert({
                    campaign_id: campaign.id,
                    venue_type: venueType,
                    min_rating: rule.min_rating_per_type[venueType] ?? 4.0,
                    min_opening_days: rule.min_days_per_type[venueType] ?? 5,
                    exclude_chains: rule.exclude_chains,
                    exclude_keywords: keywords,
                    custom_notes: rule.custom_notes_per_type[venueType] || null,
                });
            }
        }

        router.push(`/campaigns/${campaign.id}`);
    }

    return (
        <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-2">New Campaign</h1>
            <p className="text-muted mb-8">
                Set up your campaign with per-venue-type rules
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Campaign Name */}
                <div className="glass-card p-6">
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Campaign Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., TLC USA"
                        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-foreground placeholder:text-muted"
                        required
                    />
                </div>

                {/* Product Description */}
                <div className="glass-card p-6">
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Product Description
                    </label>
                    <p className="text-muted text-xs mb-3">
                        What are you selling? Used by AI to generate personalized pitches.
                    </p>
                    <textarea
                        value={productDescription}
                        onChange={(e) => setProductDescription(e.target.value)}
                        placeholder="e.g., A modern POS system for small to medium-sized food & beverage businesses..."
                        rows={3}
                        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-foreground placeholder:text-muted resize-none"
                    />
                </div>

                {/* Venue Rules */}
                <VenueRulesForm
                    rules={rules}
                    customTypeInput={customTypeInput}
                    expandedGroups={expandedGroups}
                    setCustomTypeInput={setCustomTypeInput}
                    addRule={addRule}
                    removeRule={removeRule}
                    updateRule={updateRule}
                    toggleVenueType={toggleVenueType}
                    updateTypeNotes={updateTypeNotes}
                    updateTypeRating={updateTypeRating}
                    updateTypeDays={updateTypeDays}
                    addCustomType={addCustomType}
                    toggleGroup={toggleGroup}
                    toggleAllInGroup={toggleAllInGroup}
                />

                {/* Submit */}
                <button
                    type="submit"
                    disabled={
                        saving || !name || !rules.some((r) => r.venue_types.length > 0)
                    }
                    className="w-full py-4 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? "Creating..." : "Create Campaign"}
                </button>
            </form>
        </div>
    );
}
