"use client";

import { useState } from "react";

export default function GoogleSheetsPage() {
  const [sheetId, setSheetId] = useState("");
  const [markdownData, setMarkdownData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message: string;
    exportedCount?: number;
    totalFound?: number;
    errors?: string[];
  } | null>(null);

  const checkConnection = async () => {
    if (!sheetId) {
      setResult({ success: false, message: "Enter Google Sheet ID first." });
      return;
    }

    setIsValidating(true);
    setResult(null);

    try {
      const res = await fetch("/api/sheets/sync-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheetId.trim(), validateOnly: true })
      });

      const data = await res.json();
      if (data.success) {
        const sheetDisplay = data.tabTitle ? `"${data.sheetTitle}" (Tab: ${data.tabTitle})` : `"${data.sheetTitle}"`;
        setResult({ success: true, message: `Connected to ${sheetDisplay} successfully! ✅` });
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
    if (!sheetId || !markdownData) {
      setResult({ success: false, message: "Please fill in all fields." });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/sheets/sync-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: sheetId.trim(),
          markdownText: markdownData
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sync to Google Sheets");
      }

      setResult({
        success: true,
        message: `Successfully processed!`,
        exportedCount: data.exportedCount,
        totalFound: data.totalFound,
        errors: data.errors
      });

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
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-600/20 flex items-center justify-center">
            <span className="text-2xl">📊</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground">Google Sheets Sync</h1>
            <p className="text-muted">Push your Markdown table data directly to a Google Spreadsheet.</p>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted mb-2">Google Sheet ID</label>
                <input
                  type="text"
                  placeholder="e.g. 1BxiMVs0XRYFgwnTE..."
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-green-500 transition-colors"
                />
              </div>
            </div>

            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 text-xs text-green-500/80 flex gap-2 items-start">
              <span>💡</span>
              <p>
                <strong>Pro Tip:</strong> The Sheet ID is the long string of characters in the URL of your Google Sheet. Make sure you share the sheet with the Service Account email!
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={checkConnection}
                disabled={isValidating || !sheetId}
                className="text-xs font-medium text-green-500 hover:text-green-400 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isValidating ? (
                  <div className="w-3 h-3 border border-green-500/20 border-t-green-500 rounded-full animate-spin" />
                ) : (
                  <span>🔗</span>
                )}
                Check Connection
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-2">
              Markdown Data (2-Row Format)
            </label>
            <textarea
              rows={10}
              placeholder={"| Venue | Contacts | Activity & Reviews | Status |\n| Link | Personnel | | |"}
              value={markdownData}
              onChange={(e) => setMarkdownData(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground font-mono text-sm focus:outline-none focus:border-green-500 transition-colors resize-y min-h-[200px]"
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
                className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Syncing...
                  </>
                ) : (
                  "Sync to Google Sheets"
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
