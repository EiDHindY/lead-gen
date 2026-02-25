"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Grouped venue type categories ──
const VENUE_GROUPS: Array<{ label: string; emoji: string; types: string[] }> = [
    {
        label: "Coffee & Tea",
        emoji: "☕",
        types: ["cafe", "coffeeshop", "tea_house"],
    },
    {
        label: "Bakery & Desserts",
        emoji: "🍞",
        types: ["bakery", "dessert_shop", "ice_cream"],
    },
    {
        label: "Restaurants",
        emoji: "🍽️",
        types: [
            "restaurant",
            "steakhouse",
            "seafood",
            "sushi",
            "mexican",
            "italian",
            "chinese",
            "indian",
            "thai",
        ],
    },
    {
        label: "Fast & Casual",
        emoji: "🍕",
        types: ["pizza", "fast_food", "deli", "juice_bar"],
    },
    {
        label: "Bars & Nightlife",
        emoji: "🍺",
        types: ["bar", "pub", "wine_bar", "brewery"],
    },
];

interface RuleInput {
    venue_types: string[]; // Multiple types per rule
    min_rating: number;
    min_opening_days: number;
    exclude_chains: boolean;
    exclude_keywords: string;
    custom_notes: string;
}

const emptyRule: RuleInput = {
    venue_types: [],
    min_rating: 4.0,
    min_opening_days: 5,
    exclude_chains: false,
    exclude_keywords: "",
    custom_notes: "",
};

export default function NewCampaignPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [productDescription, setProductDescription] = useState("");
    const [rules, setRules] = useState<RuleInput[]>([{ ...emptyRule }]);
    const [saving, setSaving] = useState(false);
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
                    min_rating: rule.min_rating,
                    min_opening_days: rule.min_opening_days,
                    exclude_chains: rule.exclude_chains,
                    exclude_keywords: keywords,
                    custom_notes: rule.custom_notes || null,
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
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">
                            📋 Venue Rules
                        </h2>
                        <button
                            type="button"
                            onClick={addRule}
                            className="px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-sm font-medium transition-colors"
                        >
                            + Add Rule
                        </button>
                    </div>

                    <div className="space-y-4">
                        {rules.map((rule, i) => {
                            const selectedCount = rule.venue_types.length;

                            return (
                                <div key={i} className="glass-card p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-muted">
                                                Rule {i + 1}
                                            </span>
                                            {selectedCount > 0 && (
                                                <span className="badge badge-new">
                                                    {selectedCount} type{selectedCount !== 1 ? "s" : ""}{" "}
                                                    selected
                                                </span>
                                            )}
                                        </div>
                                        {rules.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeRule(i)}
                                                className="text-xs text-danger hover:text-danger/80 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>

                                    {/* Grouped Venue Type Selector */}
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-foreground mb-3">
                                            Venue Types{" "}
                                            <span className="text-xs text-muted font-normal">
                                                (select multiple)
                                            </span>
                                        </label>

                                        <div className="space-y-2">
                                            {VENUE_GROUPS.map((group) => {
                                                const key = `${i}-${group.label}`;
                                                const isExpanded = expandedGroups[key] ?? false;
                                                const selectedInGroup = group.types.filter((t) =>
                                                    rule.venue_types.includes(t)
                                                );
                                                const allSelected =
                                                    selectedInGroup.length === group.types.length;
                                                const someSelected = selectedInGroup.length > 0;

                                                return (
                                                    <div
                                                        key={group.label}
                                                        className="rounded-lg border border-border overflow-hidden"
                                                    >
                                                        {/* Group header */}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(i, group.label)}
                                                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${someSelected
                                                                    ? "bg-primary/10 text-foreground"
                                                                    : "bg-surface text-muted hover:text-foreground"
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span>{group.emoji}</span>
                                                                <span>{group.label}</span>
                                                                {someSelected && (
                                                                    <span className="text-xs text-primary">
                                                                        ({selectedInGroup.length}/
                                                                        {group.types.length})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-muted text-xs">
                                                                {isExpanded ? "▲" : "▼"}
                                                            </span>
                                                        </button>

                                                        {/* Group items */}
                                                        {isExpanded && (
                                                            <div className="px-4 py-3 bg-background border-t border-border">
                                                                {/* Select All toggle */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        toggleAllInGroup(
                                                                            i,
                                                                            group.types,
                                                                            allSelected
                                                                        )
                                                                    }
                                                                    className="text-xs text-primary hover:text-primary-hover mb-3 block"
                                                                >
                                                                    {allSelected
                                                                        ? "Deselect all"
                                                                        : "Select all"}
                                                                </button>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {group.types.map((type) => {
                                                                        const isSelected =
                                                                            rule.venue_types.includes(type);
                                                                        return (
                                                                            <button
                                                                                key={type}
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    toggleVenueType(i, type)
                                                                                }
                                                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isSelected
                                                                                        ? "bg-primary text-white"
                                                                                        : "bg-surface border border-border text-muted hover:text-foreground hover:border-border-light"
                                                                                    }`}
                                                                            >
                                                                                {isSelected ? "✓ " : ""}
                                                                                {type.replace(/_/g, " ")}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Rating + Days */}
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs font-medium text-foreground mb-1">
                                                Min Rating: {rule.min_rating} ⭐
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="5"
                                                step="0.5"
                                                value={rule.min_rating}
                                                onChange={(e) =>
                                                    updateRule(
                                                        i,
                                                        "min_rating",
                                                        parseFloat(e.target.value)
                                                    )
                                                }
                                                className="w-full accent-primary"
                                            />
                                            <div className="flex justify-between text-xs text-muted">
                                                <span>Any</span>
                                                <span>5</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-foreground mb-1">
                                                Min Days: {rule.min_opening_days} 📅
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="7"
                                                step="1"
                                                value={rule.min_opening_days}
                                                onChange={(e) =>
                                                    updateRule(
                                                        i,
                                                        "min_opening_days",
                                                        parseInt(e.target.value)
                                                    )
                                                }
                                                className="w-full accent-primary"
                                            />
                                            <div className="flex justify-between text-xs text-muted">
                                                <span>Any</span>
                                                <span>7</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Exclude Chains */}
                                    <div className="mb-4">
                                        <label className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={rule.exclude_chains}
                                                onChange={(e) =>
                                                    updateRule(i, "exclude_chains", e.target.checked)
                                                }
                                                className="w-4 h-4 rounded accent-primary cursor-pointer"
                                            />
                                            <span className="text-sm text-foreground">
                                                Exclude big chains
                                            </span>
                                            <span className="text-xs text-muted">
                                                (Starbucks, McDonald&apos;s, etc.)
                                            </span>
                                        </label>
                                    </div>

                                    {/* Exclude Keywords */}
                                    <div className="mb-4">
                                        <label className="block text-xs font-medium text-foreground mb-1">
                                            Exclude Keywords
                                        </label>
                                        <input
                                            type="text"
                                            value={rule.exclude_keywords}
                                            onChange={(e) =>
                                                updateRule(i, "exclude_keywords", e.target.value)
                                            }
                                            placeholder="e.g., Merivale, Jamie Oliver (comma-separated)"
                                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted"
                                        />
                                    </div>

                                    {/* Custom Notes */}
                                    <div>
                                        <label className="block text-xs font-medium text-foreground mb-1">
                                            Custom Notes for AI
                                        </label>
                                        <p className="text-muted text-xs mb-2">
                                            Special criteria the AI should consider when evaluating
                                            venues
                                        </p>
                                        <input
                                            type="text"
                                            value={rule.custom_notes}
                                            onChange={(e) =>
                                                updateRule(i, "custom_notes", e.target.value)
                                            }
                                            placeholder="e.g., Only fancy restaurants, 200+ seats"
                                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

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
