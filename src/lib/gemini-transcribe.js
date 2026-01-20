import { GoogleGenerativeAI } from "@google/generative-ai";

export async function geminiTranscribe(audioBuffer, apiKey, modelName = "gemini-1.5-flash") {
    try {
        console.log(`Transcribing with Gemini model: ${modelName} (API v1)`);
        // Use v1 instead of v1beta
        const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: "v1" });
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: "audio/webm",
                    data: audioBuffer.toString("base64"),
                },
            },
            { text: "Detailed transcription of this audio. Return ONLY the spoken text. No notes, no labels, no conversational filler." },
        ]);

        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini Transcription Error:", error);
        throw error;
    }
}
