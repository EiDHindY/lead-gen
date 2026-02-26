import { useState } from "react";
import { X, Save, CheckCircle2, Loader2, Database } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface NotionSettingsDialogProps {
    campaignId: string;
    initialToken: string | null;
    initialDatabaseId: string | null;
    onClose: () => void;
    onSaved: () => void;
}

export function NotionSettingsDialog({
    campaignId,
    initialToken,
    initialDatabaseId,
    onClose,
    onSaved
}: NotionSettingsDialogProps) {
    const [token, setToken] = useState(initialToken || "");
    const [databaseId, setDatabaseId] = useState(initialDatabaseId || "");
    const [saving, setSaving] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function handleTestAndSave() {
        if (!token.trim() || !databaseId.trim()) {
            setError("Both Token and Database ID are required.");
            return;
        }

        setError(null);
        setSuccess(null);
        setValidating(true);

        try {
            // Test connection
            const res = await fetch("/api/export-notion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "validate",
                    notionToken: token.trim(),
                    notionDatabaseId: databaseId.trim()
                })
            });

            const data = await res.json();

            if (!res.ok || !data.valid) {
                setError(data.error || "Failed to validate Notion connection.");
                setValidating(false);
                return;
            }

            setSuccess(`Connected to database: "${data.dbTitle}"`);

            // Save to campaign
            setSaving(true);
            const { error: updateError } = await supabase
                .from("campaigns")
                .update({
                    notion_token: token.trim(),
                    notion_database_id: databaseId.trim()
                })
                .eq("id", campaignId);

            if (updateError) throw updateError;

            setTimeout(() => {
                onSaved();
            }, 1000);

        } catch (err: any) {
            setError(err.message || "An error occurred");
        } finally {
            setValidating(false);
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Database className="w-5 h-5 text-primary" />
                        Notion Integration
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-muted hover:text-foreground transition-colors p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-muted">
                        Connect a specific Notion database to this campaign. The database must have columns named <code className="text-primary text-xs bg-primary/10 px-1 rounded">Venue_Location</code>, <code className="text-primary text-xs bg-primary/10 px-1 rounded">Contacts</code>, and <code className="text-primary text-xs bg-primary/10 px-1 rounded">Recommended</code>.
                    </p>

                    <div>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                            Internal Integration Token
                        </label>
                        <input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="ntn_..."
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-primary focus:outline-none placeholder:text-muted"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
                            Database ID
                        </label>
                        <input
                            type="text"
                            value={databaseId}
                            onChange={(e) => setDatabaseId(e.target.value)}
                            placeholder="e.g. 2f89c09195e98077bc..."
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-primary focus:outline-none placeholder:text-muted"
                        />
                        <p className="text-[10px] text-muted mt-1 text-right">
                            The 32-character string in your Notion URL
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success text-sm flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            {success}
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleTestAndSave}
                        disabled={validating || saving || !token || !databaseId}
                        className="btn-primary-premium shadow-lg inline-flex items-center gap-2 py-2"
                    >
                        {validating || saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Connection
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
