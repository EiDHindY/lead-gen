import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-lite',
            tools: [{ googleSearch: {} } as any]
        });
        const result = await model.generateContent("Is Cuppy's Corner at 614 Main St Bridge, Daytona Beach permanently closed on Google Maps? Respond yes or no.");
        console.log("Result:", result.response.text());
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

test();
