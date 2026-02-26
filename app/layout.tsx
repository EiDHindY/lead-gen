import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeadGen — Venue Lead Generation",
  description: "Automate venue lead generation with AI-powered research",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <div className="min-h-screen gradient-bg">
          {/* ── Navigation ── */}
          <nav className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-md">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <Link href="/" className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <span className="text-white font-bold text-sm">LG</span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">LeadGen</span>
                </Link>
                <div className="flex items-center gap-6">
                  <Link
                    href="/"
                    className="text-sm text-muted hover:text-foreground transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/campaigns"
                    className="text-sm text-muted hover:text-foreground transition-colors"
                  >
                    Campaigns
                  </Link>
                  <Link
                    href="/campaigns/new"
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
                  >
                    + New Campaign
                  </Link>
                </div>
              </div>
            </div>
          </nav>

          {/* ── Main Content ── */}
          <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
