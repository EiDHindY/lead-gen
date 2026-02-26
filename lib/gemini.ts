// AI Research helper — Gemini first, Groq (Llama) as fallback
// Rate limited with 2s delay between calls

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Model fallback chain — each model has its OWN separate quota
const GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
];

// Track which models are depleted in this runtime session
const depletedModels = new Set<string>();

interface PersonnelResult {
    name: string;
    title: string;
    phone?: string;
    email?: string;
    recommended_pitch: string;
}

interface ResearchResult {
    personnel: PersonnelResult[];
    raw_response: string;
    model_used?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Research venue personnel using AI.
 * Chain: Gemini models → Groq (Llama 3) as external fallback.
 * Includes 2s rate limiting between calls.
 */
export async function researchVenuePersonnel(
    venueName: string,
    venueAddress: string,
    venueTypes: string[],
    productDescription: string
): Promise<ResearchResult> {
    const prompt = buildPrompt(venueName, venueAddress, venueTypes, productDescription);

    // Rate limiting: wait 2 seconds before making a call
    await sleep(2000);

    // 1. Try each Gemini model
    for (const modelName of GEMINI_MODELS) {
        if (depletedModels.has(modelName)) {
            console.log(`[AI] Skipping depleted: ${modelName}`);
            continue;
        }

        try {
            console.log(`[AI] Trying Gemini ${modelName} for "${venueName}"`);
            const result = await callGemini(modelName, prompt);
            result.model_used = modelName;
            return result;
        } catch (err: any) {
            console.warn(`[AI] Error on Gemini ${modelName}:`, err.message);

            // If it's a quota error, a 404 (model not found), or other model-specific transient issues, try next
            const shouldTryNext = isQuotaError(err) ||
                err.message.includes("404") ||
                err.message.includes("not found") ||
                err.message.includes("not supported");

            if (shouldTryNext) {
                console.warn(`[AI] ${modelName} unavailable, trying next model...`);
                depletedModels.add(modelName);
                await sleep(1000);
                continue;
            }

            // For other critical errors (like invalid API key), throw immediately
            throw err;
        }
    }

    // 2. All Gemini models exhausted — fall back to Groq
    console.log(`[AI] All Gemini models exhausted. Falling back to Groq...`);
    try {
        const result = await callGroq(prompt);
        result.model_used = "groq/llama-3.3-70b-versatile";
        return result;
    } catch (err: any) {
        if (isQuotaError(err)) {
            throw new Error(
                "All AI providers exhausted (Gemini + Groq). Please wait for quota reset."
            );
        }
        throw err;
    }
}

/**
 * Specifically research a venue's phone number.
 * Returns the phone number string or null if not found.
 */
export async function researchVenuePhone(
    venueName: string,
    venueAddress: string,
    venueTypes: string[]
): Promise<string | null> {
    const prompt = `You are a research assistant. Find the official, current phone number for the following venue.
    
    VENUE: ${venueName}
    ADDRESS: ${venueAddress}
    TYPES: ${venueTypes.join(", ")}
    
    Respond ONLY with the phone number in international format (e.g. +1 555-0123) or the word "NONE" if you cannot verify a specific number for this specific location. No other text.`;

    // Try Gemini first
    for (const modelName of GEMINI_MODELS) {
        if (depletedModels.has(modelName)) continue;
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            if (text === "NONE") return null;
            // Basic phone format check (digits and special chars)
            if (/[\d\+\-\s\(\)]{7,}/.test(text)) return text;
            return null;
        } catch (err: any) {
            continue;
        }
    }

    // Fallback to Groq
    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return null;
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || "").trim();
        return text === "NONE" ? null : text;
    } catch (err) {
        return null;
    }
}


// ── Gemini caller ──

async function callGemini(
    modelName: string,
    prompt: string
): Promise<ResearchResult> {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const personnel = parsePersonnelFromResponse(text);
    return { personnel, raw_response: text };
}

// ── Groq caller (OpenAI-compatible API) ──

async function callGroq(prompt: string): Promise<ResearchResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY is not set");
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: "You are a lead generation research assistant. Always respond with valid JSON only.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 2000,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) {
            throw new Error(`Groq quota exceeded (429): ${body}`);
        }
        throw new Error(`Groq API error (${res.status}): ${body}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const personnel = parsePersonnelFromResponse(text);
    return { personnel, raw_response: text };
}

// ── Shared utilities ──

function buildPrompt(
    venueName: string,
    venueAddress: string,
    venueTypes: string[],
    productDescription: string
): string {
    return `You are a lead generation research assistant. Research the following venue and find ALL key decision-makers (owner, general manager, director, operations manager, etc.).

VENUE INFORMATION:
- Name: ${venueName}
- Address: ${venueAddress}
- Type: ${venueTypes.join(", ")}

PRODUCT BEING SOLD:
${productDescription}

1. ONLY find personnel if you can discover their actual FULL NAMES (e.g., 'John Doe', 'Jane Smith').
2. DO NOT return generic results like 'General Manager' or 'Owner' if you cannot find a specific person's name associated with that role.
3. If you cannot find any specific personnel with verifiable names, return an empty list for the 'personnel' array.
4. For each person with a name, generate a concise, professional pitch tailored to their specific role.
5. Include any specific phone numbers or emails you can find.

Respond ONLY with valid JSON in this exact format:
{
  "personnel": [
    {
      "name": "Full Name",
      "title": "Their Title/Role",
      "phone": "phone number or null",
      "email": "email or null",
      "recommended_pitch": "A concise, personalized pitch for this person"
    }
  ]
}

If no people with specific names are found, return exactly: {"personnel": []}`;
}

function parsePersonnelFromResponse(text: string): PersonnelResult[] {
    try {
        let jsonStr = text;

        // Remove markdown code blocks if present
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON object in the text
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            jsonStr = objectMatch[0];
        }

        const parsed = JSON.parse(jsonStr);

        if (parsed.personnel && Array.isArray(parsed.personnel)) {
            return parsed.personnel
                .map((p: Record<string, string>) => ({
                    name: (p.name || "").trim(),
                    title: (p.title || "Unknown").trim(),
                    phone: p.phone || undefined,
                    email: p.email || undefined,
                    recommended_pitch: p.recommended_pitch || "",
                }))
                .filter((p: any) => {
                    // Filter out "Unknown", generic placeholders, or cases where name is just the title
                    const lowerName = p.name.toLowerCase();
                    const lowerTitle = p.title.toLowerCase();

                    if (!p.name || lowerName === "unknown" || lowerName === "n/a") return false;

                    // If the name is exactly the same as the title (e.g. "General Manager" in both), it's a guess
                    if (lowerName === lowerTitle) return false;

                    // Filter out common generic role names appearing in the "name" field
                    const genericRoles = ["manager", "owner", "operator", "director", "coordinator", "founder", "ceo"];
                    if (genericRoles.includes(lowerName)) return false;

                    return true;
                });
        }

        return [];
    } catch (e: any) {
        console.error("[AI] Failed to parse response:", e.message, text.slice(0, 200));
        return [];
    }
}

function isQuotaError(err: unknown): boolean {
    if (err instanceof Error) {
        return (
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.includes("quota") ||
            err.message.includes("rate_limit")
        );
    }
    return false;
}

/**
 * Reset the depleted models set (call this at start of day or on a schedule)
 */
export function resetQuotaTracking(): void {
    depletedModels.clear();
}
