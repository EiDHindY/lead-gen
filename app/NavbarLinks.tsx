"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavbarLinks() {
    const pathname = usePathname();

    const links = [
        { href: "/", label: "Notion", strikethrough: false },
    ];

    return (
        <div className="flex items-center gap-6">
            {links.map((link) => {
                const isActive = pathname === link.href;
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`text-sm transition-all duration-200 ${link.strikethrough ? "line-through text-muted/50 cursor-not-allowed pointer-events-none" :
                                isActive
                                    ? "text-primary font-bold border-b-2 border-primary pb-1"
                                    : "text-muted hover:text-foreground"
                            }`}
                    >
                        {link.label}
                    </Link>
                );
            })}
        </div>
    );
}
