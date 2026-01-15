import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function geminiTranslate(text, from, to, modelName = "gemini-1.5-flash") {
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const Prompt = `Translate the following text from ${from} to ${to}. Only return the translated text without any explanations or extra characters.\n\nText: "${text}"`;

        const result = await model.generateContent(Prompt);
        const response = await result.response;
        return response.text().trim().replace(/^"|"$/g, '');
    } catch (error) {
        console.error("Gemini Translation Error:", error);
        return null;
    }
}

export async function geminiRefine(original, translated, from, to, modelName = "gemini-1.5-flash") {
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const Prompt = `You are a professional translator. Review the following translation from ${from} to ${to} and provide a more natural, accurate version if possible. If the translation is already perfect, return it as is. Only return the refined text.\n\nOriginal: "${original}"\nTranslated: "${translated}"`;

        const result = await model.generateContent(Prompt);
        const response = await result.response;
        return response.text().trim().replace(/^"|"$/g, '');
    } catch (error) {
        console.error("Gemini Refinement Error:", error);
        return translated;
    }
}
