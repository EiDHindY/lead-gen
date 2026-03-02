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
    aiSearchRules?: string | null,
    venuePhone?: string | null
): Promise<ResearchResult> {
    const prompt = buildPrompt(venueName, venueAddress, venueTypes, productDescription, aiSearchRules, venuePhone);

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
            console.warn(`[AI] Error on Gemini ${modelName}:`, err?.message || err);

            if (isQuotaError(err)) {
                console.warn(`[AI] Quota depleted for ${modelName}`);
                depletedModels.add(modelName);
            }

            // Always try next model for ALMOST ANY ERROR in the loop
            // Fatal errors would likely kill all models anyway, but transient errors shouldn't stop the whole chain
            console.warn(`[AI] ${modelName} failed, trying next Gemini model...`);
            await sleep(1000);
            continue;
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
        if (depletedModels.has(modelName)) {
            console.log(`[AI-Phone] Skipping depleted: ${modelName}`);
            continue;
        }

        try {
            console.log(`[AI-Phone] Trying ${modelName} for "${venueName}"`);
            // Add a small delay for phone-specific search as well to avoid rapid-fire hits
            await sleep(1000);

            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();

            console.log(`[AI-Phone] Raw response from ${modelName}:`, text);

            if (text === "NONE" || text.toLowerCase().includes("none")) {
                console.log(`[AI-Phone] ${modelName} returned NONE for "${venueName}". Checking next model...`);
                continue; // Try next model to be sure
            }

            // Basic phone format check (digits and special chars)
            if (/[\d\+\-\s\(\)]{7,}/.test(text)) {
                // Return cleaned number (just digits and +) if it's too messy? 
                // No, let's keep the AI format for now but at least we found something.
                return text;
            }

            console.warn(`[AI-Phone] ${modelName} returned invalid format: "${text}"`);
            continue;
        } catch (err: any) {
            console.warn(`[AI-Phone] Error on ${modelName}:`, err?.message || err);

            if (isQuotaError(err)) {
                depletedModels.add(modelName);
            }

            if (isSafetyError(err)) {
                console.warn(`[AI-Phone] Safety block on ${modelName}`);
            }

            continue;
        }
    }

    // Fallback to Groq
    console.log(`[AI-Phone] All Gemini models failed for "${venueName}". Trying Groq fallback...`);
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

        if (!res.ok) {
            console.warn(`[AI-Phone] Groq error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || "").trim();
        console.log(`[AI-Phone] Raw response from Groq:`, text);

        if (text === "NONE" || text.toLowerCase().includes("none")) return null;
        return text;
    } catch (err) {
        console.error("[AI-Phone] Groq fallback failed:", err);
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
    aiSearchRules?: string | null,
    venuePhone?: string | null
): string {
    const rulesSection = aiSearchRules && typeof aiSearchRules === 'string' && aiSearchRules.trim()
        ? `\nAI SEARCH RULES / CONSTRAINTS (MUST FOLLOW):\n${aiSearchRules}\n`
        : "";

    const phoneSection = venuePhone ? `- Phone: ${venuePhone}\n` : "";

    return `You are a strict and highly precise lead generation research assistant. Your task is to research the following venue and find ALL key decision-makers (owner, general manager, director, operations manager, etc.).

VENUE INFORMATION:
- Name: ${venueName}
- Address: ${venueAddress}
- Type: ${venueTypes.join(", ")}
${phoneSection}

PRODUCT BEING SOLD:
${productDescription}
${rulesSection}
CRITICAL INSTRUCTIONS TO PREVENT HALLUCINATIONS:
1. VALIDATE AGAINST AI SEARCH RULES: If AI SEARCH RULES are provided above, first verify if this venue strictly matches those rules. 
2. OPTIMISTIC COMPLIANCE (POPULARITY): If a rule mentions a "review count" or "popularity" limit (e.g., 'under 400 reviews'):
   - IF CERTAIN it is a major landmark, large chain flagship, or viral tourist trap that FAR EXCEEDS the limit: set "matchesRules" to false and return an empty personnel list.
   - IF IT IS A REGULAR LOCAL BUSINESS or you are UNCERTAIN of the exact count: set "matchesRules" to true and PROCEED with research. Note the lack of exact data in the 'reason' but DO NOT skip valid local leads.
3. RESEARCH OVER SKIPPING: For small local venues, it is ALWAYS preferred to find the owners even if you are not 100% sure about the exact review count.
4. MODEL RELIABILITY & UNCERTAINTY: Use the confidence score to reflect your certainty. If you have low data (Confidence Score < 6), still provide the leads but mention "Low certainty" in the 'justification'.
5. VERIFIABLE SOURCES ONLY: Prioritize finding information from LinkedIn, official company websites, and recent (last 12-24 months) news or press releases.
6. TEMPORAL CONTEXT: Ensure the person currently holds the position. If you find multiple people for the same role, prioritize the one with the most recent verifiable data.
7. CONFIDENCE SCORING: For each person found, provide a "confidence_score" from 1 (lowest) to 10 (highest) and a brief "justification" (e.g., "Found on official 'About Us' page", "LinkedIn profile confirms current role").
8. ONLY return personnel if you are ABSOLUTELY CERTAIN they currently work at this specific location and you can discover their actual FULL NAMES (e.g., 'John Doe', 'Jane Smith').
9. DO NOT guess, fabricate, or hallucinate names. It is completely unacceptable to return fake people.
10. DO NOT return generic placeholders like 'General Manager' or 'Owner' if you cannot find a specific person's verifiable FULL NAME.
11. If you cannot find any specific personnel with verifiable names for this exact venue, return an empty personnel list.
12. Include any specific phone numbers or emails you can find, but do not hallucinate them if unknown.

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
    const msg = String(err).toLowerCase();
    return (
        msg.includes("safety") ||
        msg.includes("finish_reason_safety") ||
        msg.includes("blocked") ||
        msg.includes("candidate")
    );
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
