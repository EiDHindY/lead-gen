// AI Research helper — Gemini first, Groq (Llama) as fallback
// Rate limited with 2s delay between calls

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Model fallback chain — each model has its OWN separate quota
const GEMINI_MODELS = [
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
];

// Track which models are depleted in this runtime session
const depletedModels = new Set<string>();

interface PersonnelResult {
    name: string;
    title: string;
    phone?: string;
    email?: string;
    recommended_pitch: string;
    confidence_score: number;
    justification: string;
}

interface ResearchResult {
    personnel: PersonnelResult[];
    matchesRules: boolean;
    reason?: string;
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
    productDescription: string,
    aiSearchRules?: string
): Promise<ResearchResult> {
    const prompt = buildPrompt(venueName, venueAddress, venueTypes, productDescription, aiSearchRules);

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
            const errMsg = err?.message || "";
            const shouldTryNext = isQuotaError(err) ||
                errMsg.includes("404") ||
                errMsg.includes("not found") ||
                errMsg.includes("not supported");

            if (shouldTryNext || isSafetyError(err)) {
                console.warn(`[AI] ${modelName} unavailable or blocked (Safety), trying next model...`);
                if (isQuotaError(err)) depletedModels.add(modelName);
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
    const prompt = `You are a strict research assistant. Find the official, current phone number for the following venue.
    
    VENUE: ${venueName}
    ADDRESS: ${venueAddress}
    TYPES: ${venueTypes.join(", ")}
    
    CRITICAL INSTRUCTION: Do not guess, fabricate, or hallucinate. If you cannot find a verifiable number for this specific location, return NONE.
    
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
    console.log(`[AI] Raw response from ${modelName}:`, text);
    const researchData = parsePersonnelFromResponse(text);
    return {
        personnel: researchData.personnel,
        matchesRules: researchData.matchesRules,
        reason: researchData.reason,
        raw_response: text
    };
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
                    content: "You are a highly precise lead generation research assistant. You MUST NOT hallucinate or guess names. If verifiable names cannot be found, return an empty personnel array. Always respond with valid JSON only.",
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
    console.log(`[AI] Raw response from Groq:`, text);
    const researchData = parsePersonnelFromResponse(text);
    return {
        personnel: researchData.personnel,
        matchesRules: researchData.matchesRules,
        reason: researchData.reason,
        raw_response: text
    };
}

// ── Shared utilities ──

function buildPrompt(
    venueName: string,
    venueAddress: string,
    venueTypes: string[],
    productDescription: string,
    aiSearchRules?: string
): string {
    const rulesSection = aiSearchRules && aiSearchRules.trim()
        ? `\nAI SEARCH RULES / CONSTRAINTS (MUST FOLLOW):\n${aiSearchRules}\n`
        : "";

    return `You are a strict and highly precise lead generation research assistant. Your task is to research the following venue and find ALL key decision-makers (owner, general manager, director, operations manager, etc.).

VENUE INFORMATION:
- Name: ${venueName}
- Address: ${venueAddress}
- Type: ${venueTypes.join(", ")}

PRODUCT BEING SOLD:
${productDescription}
${rulesSection}
CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
1. VALIDATE AGAINST AI SEARCH RULES: If AI SEARCH RULES are provided above, first verify if this venue strictly matches those rules. If it does not match, set "matchesRules" to false, explain why in "reason", and return an empty personnel list.
2. VERIFIABLE SOURCES ONLY: Prioritize finding information from LinkedIn, official company websites, and recent (last 12-24 months) news or press releases.
3. TEMPORAL CONTEXT: Ensure the person currently holds the position. If you find multiple people for the same role, prioritize the one with the most recent verifiable data.
4. CONFIDENCE SCORING: For each person found, provide a "confidence_score" from 1 (lowest) to 10 (highest) and a brief "justification" (e.g., "Found on official 'About Us' page", "LinkedIn profile confirms current role").
5. ONLY return personnel if you are ABSOLUTELY CERTAIN they currently work at this specific location and you can discover their actual FULL NAMES (e.g., 'John Doe', 'Jane Smith').
6. DO NOT guess, fabricate, or hallucinate names. It is completely unacceptable to return fake people.
7. DO NOT return generic placeholders like 'General Manager' or 'Owner' if you cannot find a specific person's verifiable FULL NAME.
8. If you cannot find any specific personnel with verifiable names for this exact venue, IT IS BETTER TO RETURN AN EMPTY LIST THAN TO GUESS. Return an empty list for the 'personnel' array.
9. For each person with a verifiable name, generate a concise, professional pitch tailored to their specific role.
10. Include any specific phone numbers or emails you can find, but do not hallucinate them if unknown.

Respond ONLY with valid JSON in this exact format:
{
  "matchesRules": true/false (defaults to true if no specific rules given),
  "reason": "Explain why it matches or why it was rejected",
  "personnel": [
    {
      "name": "Full Name",
      "title": "Their Title/Role",
      "phone": "phone number or null",
      "email": "email or null",
      "recommended_pitch": "A concise, personalized pitch for this person",
      "confidence_score": 1-10,
      "justification": "Short justification for the score"
    }
  ]
}

If the venue does not match the rules, or no verifiable people with specific names are found, return the appropriate "matchesRules" flag and an empty personnel list: {"matchesRules": false, "reason": "...", "personnel": []}`;
}

function parsePersonnelFromResponse(text: string): {
    personnel: PersonnelResult[];
    matchesRules: boolean;
    reason: string;
} {
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

        return {
            matchesRules: parsed.matchesRules ?? true,
            reason: parsed.reason || "",
            personnel: Array.isArray(parsed.personnel) ? parsed.personnel
                .map((p: Record<string, any>) => ({
                    name: (p.name || "").trim(),
                    title: (p.title || "Unknown").trim(),
                    phone: p.phone || undefined,
                    email: p.email || undefined,
                    recommended_pitch: p.recommended_pitch || "",
                    confidence_score: Number(p.confidence_score) || 0,
                    justification: (p.justification || "No justification provided").trim(),
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
                }) : []
        };
    } catch (e: any) {
        console.error("[AI] Failed to parse response:", e.message, text.slice(0, 200));
        return {
            matchesRules: true,
            reason: "Failed to parse AI response",
            personnel: []
        };
    }
}

function isSafetyError(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = (err.message || "").toLowerCase();
        return (
            msg.includes("safety") ||
            msg.includes("finish_reason_safety") ||
            msg.includes("blocked")
        );
    }
    return false;
}

export function isQuotaError(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message || "";
        return (
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("quota") ||
            msg.includes("rate_limit")
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
