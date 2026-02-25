// Gemini AI helper — Pro first, falls back to Flash on quota error

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Track whether Pro quota is depleted for this runtime
let proQuotaDepleted = false;

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
}

/**
 * Research venue personnel using Gemini.
 * Tries Pro first (better quality), falls back to Flash on 429 quota error.
 */
export async function researchVenuePersonnel(
    venueName: string,
    venueAddress: string,
    venueTypes: string[],
    productDescription: string
): Promise<ResearchResult> {
    const prompt = buildPrompt(venueName, venueAddress, venueTypes, productDescription);

    try {
        if (!proQuotaDepleted) {
            return await callGemini("gemini-1.5-pro", prompt);
        }
        return await callGemini("gemini-2.0-flash", prompt);
    } catch (err: unknown) {
        // If Pro fails with quota error, switch to Flash
        if (!proQuotaDepleted && isQuotaError(err)) {
            console.log("[Gemini] Pro quota depleted, switching to Flash");
            proQuotaDepleted = true;
            return await callGemini("gemini-2.0-flash", prompt);
        }
        throw err;
    }
}

async function callGemini(
    modelName: string,
    prompt: string
): Promise<ResearchResult> {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse JSON from Gemini's response
    const personnel = parsePersonnelFromResponse(text);

    return { personnel, raw_response: text };
}

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

INSTRUCTIONS:
1. Find as many key personnel as possible (owner, manager, director, etc.)
2. For each person, generate a concise, professional pitch tailored to their specific role
3. Include any phone numbers or emails you can find

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
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

If you cannot find any specific personnel, return your best guess based on typical management structures for this type of venue, and note that in the pitch.`;
}

function parsePersonnelFromResponse(text: string): PersonnelResult[] {
    try {
        // Try to extract JSON from the response
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
            return parsed.personnel.map((p: Record<string, string>) => ({
                name: p.name || "Unknown",
                title: p.title || "Unknown",
                phone: p.phone || undefined,
                email: p.email || undefined,
                recommended_pitch: p.recommended_pitch || "",
            }));
        }

        return [];
    } catch {
        console.error("[Gemini] Failed to parse response:", text.slice(0, 200));
        return [];
    }
}

function isQuotaError(err: unknown): boolean {
    if (err instanceof Error) {
        return (
            err.message.includes("429") ||
            err.message.includes("RESOURCE_EXHAUSTED") ||
            err.message.includes("quota")
        );
    }
    return false;
}

/**
 * Reset the Pro quota flag (call this at start of day or on a schedule)
 */
export function resetProQuota(): void {
    proQuotaDepleted = false;
}
