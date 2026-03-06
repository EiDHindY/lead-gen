import { NextRequest, NextResponse } from "next/server";
import { validateNotionConnection } from "@/lib/notion";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { integrationToken, databaseId } = body;
        const token = integrationToken?.trim();
        const dbId = databaseId?.trim();

        if (!token || !dbId) {
            return NextResponse.json(
                { error: "Missing required fields (integrationToken, databaseId)" },
                { status: 400 }
            );
        }

        const result = await validateNotionConnection(token, dbId);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[notion-validate] Error:", error);
        return NextResponse.json(
            { valid: false, error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
