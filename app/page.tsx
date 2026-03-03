"use client";

import { useState } from "react";

export default function NotionPage() {
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [markdownData, setMarkdownData] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message: string;
    exportedCount?: number;
    totalFound?: number;
    errors?: string[]
  } | null>(null);

  const checkConnection = async () => {
    if (!token || !databaseId) {
      setResult({ success: false, message: "Enter token and database ID first." });
      return;
    }

    setIsValidating(true);
    setResult(null);

    try {
      const res = await fetch("/api/notion/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationToken: token, databaseId: databaseId })
      });

      const data = await res.json();
      if (data.valid) {
        setResult({ success: true, message: `Connected to "${data.dbTitle}" successfully! ✅` });
      } else {
        setResult({ success: false, message: `Connection failed: ${data.error} ❌` });
      }
    } catch (err: any) {
      setResult({ success: false, message: "Network error during validation." });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSync = async () => {
    if (!token || !databaseId || !markdownData) {
      setResult({ success: false, message: "Please fill in all fields." });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/notion/sync-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationToken: token,
          databaseId: databaseId,
          markdownText: markdownData
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sync to Notion");
      }

      setResult({
        success: true,
        message: `Successfully processed!`,
        exportedCount: data.exportedCount,
        totalFound: data.totalFound,
        errors: data.errors
      });

      // Clear data on success if it worked
      if (data.exportedCount > 0) {
        setMarkdownData("");
      }

    } catch (err: any) {
      setResult({ success: false, message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <span className="text-2xl">📓</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground">Notion Sync</h1>
            <p className="text-muted">Push your Markdown table data directly to Notion.</p>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Integration Token</label>
                <input
                  type="password"
                  placeholder="secret_..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Database ID</label>
                <input
                  type="text"
                  placeholder="e.g. 30c203cbe..."
                  value={databaseId}
                  onChange={(e) => setDatabaseId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={checkConnection}
                disabled={isValidating || !token || !databaseId}
                className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isValidating ? (
                  <div className="w-3 h-3 border border-primary/20 border-t-primary rounded-full animate-spin" />
                ) : (
                  <span>🔗</span>
                )}
                Check Connection
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-2">Markdown Data (2-Row Format)</label>
            <textarea
              rows={10}
              placeholder={"| Venue | Contacts | Status | Pitch |\n| Link | Personnel | | |"}
              value={markdownData}
              onChange={(e) => setMarkdownData(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground font-mono text-sm focus:outline-none focus:border-primary transition-colors resize-y min-h-[200px]"
            />
          </div>

          <div className="flex flex-col gap-4 pt-2">
            <div className="flex items-center justify-between">
              {result ? (
                <div className={`text-sm ${result.success ? "text-green-400" : "text-red-400"}`}>
                  {result.message} {result.success && result.totalFound !== undefined && `(${result.exportedCount}/${result.totalFound} synced)`}
                </div>
              ) : (
                <div className="text-sm text-muted">Awaiting sync...</div>
              )}

              <button
                onClick={handleSync}
                disabled={isLoading}
                className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Syncing...
                  </>
                ) : (
                  "Sync to Database"
                )}
              </button>
            </div>

            {result?.errors && result.errors.length > 0 && (
              <div className="text-xs text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20 max-h-48 overflow-y-auto font-mono">
                <p className="font-bold mb-2 uppercase tracking-wider">Sync Errors ({result.errors.length})</p>
                <ul className="list-disc pl-5 space-y-1.5 ">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
