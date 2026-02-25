import { VENUE_GROUPS, RuleInput } from "../constants";

interface VenueRulesFormProps {
    rules: RuleInput[];
    customTypeInput: Record<number, string>;
    expandedGroups: Record<string, boolean>;
    setCustomTypeInput: React.Dispatch<React.SetStateAction<Record<number, string>>>;
    addRule: () => void;
    removeRule: (index: number) => void;
    updateRule: (index: number, field: keyof RuleInput, value: unknown) => void;
    toggleVenueType: (ruleIndex: number, type: string) => void;
    updateTypeNotes: (ruleIndex: number, type: string, notes: string) => void;
    updateTypeRating: (ruleIndex: number, type: string, val: number) => void;
    updateTypeDays: (ruleIndex: number, type: string, val: number) => void;
    addCustomType: (ruleIndex: number) => void;
    toggleGroup: (ruleIndex: number, groupLabel: string) => void;
    toggleAllInGroup: (ruleIndex: number, types: string[], allSelected: boolean) => void;
}

export function VenueRulesForm({
    rules,
    customTypeInput,
    expandedGroups,
    setCustomTypeInput,
    addRule,
    removeRule,
    updateRule,
    toggleVenueType,
    updateTypeNotes,
    updateTypeRating,
    updateTypeDays,
    addCustomType,
    toggleGroup,
    toggleAllInGroup,
}: VenueRulesFormProps) {
    return (
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

                            {/* Custom type input */}
                            <div className="mt-3 flex items-center gap-2">
                                <input
                                    type="text"
                                    value={customTypeInput[i] || ""}
                                    onChange={(e) =>
                                        setCustomTypeInput((prev) => ({ ...prev, [i]: e.target.value }))
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addCustomType(i);
                                        }
                                    }}
                                    placeholder="Type a custom venue type..."
                                    className="flex-1 px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm text-foreground placeholder:text-muted"
                                />
                                <button
                                    type="button"
                                    onClick={() => addCustomType(i)}
                                    className="px-3 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-sm font-medium transition-colors"
                                >
                                    + Add
                                </button>
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

                            {/* Per-Type Settings */}
                            {rule.venue_types.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-foreground mb-2">
                                        Per-Type Settings
                                    </label>
                                    <p className="text-muted text-xs mb-3">
                                        Set rating, opening days, and AI notes for each type
                                    </p>
                                    <div className="space-y-3">
                                        {rule.venue_types.map((type) => {
                                            const rating = rule.min_rating_per_type[type] ?? 4.0;
                                            const days = rule.min_days_per_type[type] ?? 5;
                                            return (
                                                <div
                                                    key={type}
                                                    className="p-3 rounded-lg bg-background border border-border"
                                                >
                                                    <span className="text-xs font-semibold text-primary block mb-2">
                                                        {type.replace(/_/g, " ")}
                                                    </span>
                                                    <div className="grid grid-cols-2 gap-3 mb-2">
                                                        <div>
                                                            <label className="text-xs text-muted">
                                                                Rating: {rating} ⭐
                                                            </label>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="5"
                                                                step="0.5"
                                                                value={rating}
                                                                onChange={(e) =>
                                                                    updateTypeRating(i, type, parseFloat(e.target.value))
                                                                }
                                                                className="w-full accent-primary"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-muted">
                                                                Days: {days} 📅
                                                            </label>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="7"
                                                                step="1"
                                                                value={days}
                                                                onChange={(e) =>
                                                                    updateTypeDays(i, type, parseInt(e.target.value))
                                                                }
                                                                className="w-full accent-primary"
                                                            />
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={rule.custom_notes_per_type[type] || ""}
                                                        onChange={(e) =>
                                                            updateTypeNotes(i, type, e.target.value)
                                                        }
                                                        placeholder={`AI notes for ${type.replace(/_/g, " ")}...`}
                                                        className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border focus:border-primary focus:outline-none text-xs text-foreground placeholder:text-muted"
                                                    />
                                                </div>
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
    );
}
