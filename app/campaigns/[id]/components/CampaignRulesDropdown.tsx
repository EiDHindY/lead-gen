import { useState } from "react";
import { type CampaignRule } from "@/lib/supabase";
import { ClipboardList, ChevronUp, ChevronDown, Edit2, Star, Calendar, Ban, FileText, X, Settings } from "lucide-react";

interface CampaignRulesDropdownProps {
    rules: CampaignRule[];
    updateRule: (ruleId: string, updates: Partial<CampaignRule>) => Promise<void>;
}

export function CampaignRulesDropdown({ rules, updateRule }: CampaignRulesDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

    // Form state for editing
    const [editForm, setEditForm] = useState<Partial<CampaignRule>>({});

    const handleEditClick = (rule: CampaignRule) => {
        setEditingRuleId(rule.id);
        setEditForm({
            min_rating: rule.min_rating,
            min_opening_days: rule.min_opening_days,
            exclude_chains: rule.exclude_chains,
            custom_notes: rule.custom_notes || "",
        });
    };

    const handleSave = async (ruleId: string) => {
        await updateRule(ruleId, editForm);
        setEditingRuleId(null);
    };

    const handleCancel = () => {
        setEditingRuleId(null);
        setEditForm({});
    };

    return (
        <div className="w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full btn-premium justify-between"
            >
                <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" />
                    Campaign Rules ({rules.length} active)
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm">
                    <div className="w-[95vw] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden glass-card flex flex-col h-[85vh]">
                        <div className="p-4 bg-background/50 border-b border-border flex justify-between items-center shrink-0">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <ClipboardList className="w-4 h-4 text-primary" />
                                Target Venue Rules
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-muted hover:text-foreground p-1 hover:bg-surface-hover rounded-md transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto p-4 space-y-4 flex-1">
                            {rules.map((rule) => {
                                const isEditing = editingRuleId === rule.id;

                                return (
                                    <div key={rule.id} className="p-4 rounded-xl bg-background border border-border transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-medium text-primary capitalize flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                {rule.venue_type.replace(/_/g, " ")}
                                            </div>
                                            {!isEditing && (
                                                <button
                                                    onClick={() => handleEditClick(rule)}
                                                    className="text-[10px] px-2 py-1 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 flex items-center gap-1 transition-colors font-medium border border-secondary/20"
                                                >
                                                    <Edit2 className="w-3 h-3" />
                                                    Edit Rule
                                                </button>
                                            )}
                                        </div>

                                        {isEditing ? (
                                            <div className="space-y-4 mt-4 text-sm bg-surface/50 p-4 rounded-xl border border-border animate-in fade-in zoom-in-95 duration-200">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-semibold text-muted mb-1 uppercase tracking-wider">
                                                            Min Rating
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min="0"
                                                            max="5"
                                                            value={editForm.min_rating ?? 0}
                                                            onChange={(e) => setEditForm({ ...editForm, min_rating: parseFloat(e.target.value) || 0 })}
                                                            className="w-full px-3 py-1.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none transition-colors"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-semibold text-muted mb-1 uppercase tracking-wider">
                                                            Min Days Open
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="7"
                                                            value={editForm.min_opening_days ?? 0}
                                                            onChange={(e) => setEditForm({ ...editForm, min_opening_days: parseInt(e.target.value) || 0 })}
                                                            className="w-full px-3 py-1.5 rounded-lg bg-background border border-border focus:border-primary focus:outline-none transition-colors"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id={`exclude-chains-${rule.id}`}
                                                        checked={editForm.exclude_chains ?? false}
                                                        onChange={(e) => setEditForm({ ...editForm, exclude_chains: e.target.checked })}
                                                        className="rounded border-border text-primary focus:ring-primary bg-background w-4 h-4"
                                                    />
                                                    <label htmlFor={`exclude-chains-${rule.id}`} className="text-xs text-foreground font-medium">
                                                        Exclude Chains/Franchises
                                                    </label>
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-semibold text-muted mb-1 uppercase tracking-wider">
                                                        AI Search Rules (Guides Research)
                                                    </label>
                                                    <textarea
                                                        value={editForm.custom_notes || ""}
                                                        onChange={(e) => setEditForm({ ...editForm, custom_notes: e.target.value })}
                                                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs focus:border-primary focus:outline-none transition-colors resizable-none"
                                                        rows={3}
                                                        placeholder="Example: Must be a specialty coffee shop, not a generic cafe..."
                                                    />
                                                </div>

                                                <div className="flex gap-3 justify-end pt-3 border-t border-border mt-4">
                                                    <button
                                                        onClick={handleCancel}
                                                        className="px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={() => handleSave(rule.id)}
                                                        className="btn-primary-premium py-2 px-5"
                                                    >
                                                        Save Changes
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm flex flex-wrap gap-2">
                                                {rule.min_rating > 0 && (
                                                    <span className="px-2 py-1 rounded-lg bg-surface border border-border text-[10px] flex items-center gap-1.5 font-medium shadow-sm">
                                                        <Star className="w-3 h-3 text-warning fill-warning/20" /> {rule.min_rating}+ required
                                                    </span>
                                                )}
                                                {rule.min_opening_days > 0 && (
                                                    <span className="px-2 py-1 rounded-lg bg-surface border border-border text-[10px] flex items-center gap-1.5 font-medium shadow-sm">
                                                        <Calendar className="w-3 h-3 text-primary" /> {rule.min_opening_days} days/week+
                                                    </span>
                                                )}
                                                {rule.exclude_chains && (
                                                    <span className="px-2 py-1 rounded-lg bg-surface border border-border text-[10px] flex items-center gap-1.5 font-medium shadow-sm">
                                                        <Ban className="w-3 h-3 text-danger" /> No Chains
                                                    </span>
                                                )}
                                                {rule.custom_notes && (
                                                    <span className="px-2 py-1 rounded-lg bg-surface border border-border text-[10px] flex items-center gap-1.5 font-medium shadow-sm">
                                                        <FileText className="w-3 h-3 text-secondary" /> {rule.custom_notes.slice(0, 40)}{rule.custom_notes.length > 40 ? "..." : ""}
                                                    </span>
                                                )}
                                                {!rule.min_rating && !rule.min_opening_days && !rule.exclude_chains && !rule.custom_notes && (
                                                    <span className="text-muted text-[10px] italic">No specific constraints</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
