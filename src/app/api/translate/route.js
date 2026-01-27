import translate from 'google-translate-api-next';
import { geminiTranslate, geminiRefine } from '@/lib/gemini';

export async function POST(request) {
    try {
        const body = await request.json();
        const { text, from, to, llmModel, apiKey } = body;

        if (!text) {
            return new Response(JSON.stringify({ error: "Text is required" }), { status: 400 });
        }

        let resultText = '';

        // Use Gemini for Chinese translation if it fails or if specifically requested
        if (to === 'zh' || to.startsWith('zh-')) {
            console.log("[API] Using Gemini for Chinese translation...");
            resultText = await geminiTranslate(text, from, to, llmModel || 'gemini-1.5-flash', apiKey);
        }

        // If not Chinese or if Gemini failed, use the default translator
        if (!resultText) {
            console.log("[API] Using fallback google-translate-api-next...");
            // google-translate-api-next requires 'zh-CN' or 'zh-TW', 'zh' is not supported
            const sourceLang = from === 'zh' ? 'zh-CN' : from;
            const targetLang = to === 'zh' ? 'zh-CN' : to;
            const res = await translate(text, { from: sourceLang, to: targetLang });
            resultText = res.text;
        }

        // Apply LLM refinement if a model is selected and it's not already handled by Gemini translation refinedly
        if (llmModel && llmModel !== 'none') {
            console.log(`[API] Applying Gemini refinement with model: ${llmModel}`);
            resultText = await geminiRefine(text, resultText, from, to, llmModel, apiKey);
        }

        return new Response(JSON.stringify({ text: resultText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error("[API] Translation Route Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
