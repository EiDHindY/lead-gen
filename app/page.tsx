"use client";

import { useState } from "react";

export default function NotionPage() {
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [markdownData, setMarkdownData] = useState("");
  const [campaign, setCampaign] = useState<"tlc-activity" | "tlc-coffee">("tlc-activity");

  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message: string;
    exportedCount?: number;
    totalFound?: number;
    errors?: string[];
    discoveredKeys?: Record<string, string>;
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
        body: JSON.stringify({ integrationToken: token.trim(), databaseId: databaseId.trim() })
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
          integrationToken: token.trim(),
          databaseId: databaseId.trim(),
          areaId: areaId.trim(),
          markdownText: markdownData,
          campaign
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
        errors: data.errors,
        discoveredKeys: data.discoveredKeys
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

        {/* ── Campaign Toggle ── */}
        <div className="glass-card p-2 flex gap-1 w-fit">
          <button
            onClick={() => setCampaign("tlc-activity")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              campaign === "tlc-activity"
                ? "bg-gradient-to-r from-primary to-primary-dim text-white shadow-lg shadow-primary/25"
                : "text-muted hover:text-foreground hover:bg-surface-hover"
            }`}
          >
            <span>🏃</span>
            TLC Activity
          </button>
          <button
            onClick={() => setCampaign("tlc-coffee")}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              campaign === "tlc-coffee"
                ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-600/25"
                : "text-muted hover:text-foreground hover:bg-surface-hover"
            }`}
          >
            <span>☕</span>
            TLC Coffee
          </button>
        </div>

        <div className="glass-card p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Area Page ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 19e982d3..."
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs text-primary/80 flex gap-2 items-start">
              <span>💡</span>
              <p>
                <strong>Pro Tip:</strong> Use the <strong>Master Database ID</strong> to sync. If you provide an <strong>Area Page ID</strong>, we'll automatically link every row to that Area for you!
              </p>
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
            <label className="block text-sm font-medium text-muted mb-2">
              Markdown Data {campaign === "tlc-coffee" ? "(Venue & Contacts)" : "(2-Row Format)"}
            </label>
            <textarea
              rows={10}
              placeholder={
                campaign === "tlc-coffee"
                  ? "Cafe Bartique <br> https://maps.app.goo.gl/... | Phone: (404) 343-1780 <br> Personnel: Angela Ingram - Founder & Owner | N/A | Active"
                  : "| Venue | Contacts | Activity & Reviews | Status |\n| Link | Personnel | | |"
              }
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
                  {result.success && result.discoveredKeys && (
                    <div className="mt-1 text-[10px] opacity-60 font-mono">
                      Keys: {Object.entries(result.discoveredKeys)
                        .filter(([_, v]) => v)
                        .map(([k, v]) => `${k.replace("Key", "")}:${v}`)
                        .join(", ")}
                    </div>
                  )}
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
