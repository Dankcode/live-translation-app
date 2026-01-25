import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function geminiTranslate(text, from, to, modelName = 'gemini-1.5-flash') {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is not set. Skipping Gemini translation.");
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Translate the following text from ${from} to ${to}. Only return the translated text.
        Text: ${text}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini translation error:", error);
        return null;
    }
}

export async function geminiRefine(original, translated, from, to, modelName = 'gemini-1.5-flash') {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY is not set. Skipping Gemini refinement.");
        return translated;
    }

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `You are an expert translator. Refine the following translation to make it more natural and accurate while maintaining the original meaning.
        Original (${from}): ${original}
        Current Translation (${to}): ${translated}
        Only return the refined translation text.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini refinement error:", error);
        return translated;
    }
}
