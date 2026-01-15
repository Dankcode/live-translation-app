import translate from 'google-translate-api-next';
import { geminiTranslate, geminiRefine } from '@/lib/gemini';

export async function POST(request) {
    const { text, from, to, llmModel } = await request.json();

    try {
        let resultText = '';

        // Use Gemini for Chinese translation if it fails or if specifically requested
        if (to === 'zh' || to.startsWith('zh-')) {
            resultText = await geminiTranslate(text, from, to, llmModel || 'gemini-1.5-flash');
        }

        // If not Chinese or if Gemini failed, use the default translator
        if (!resultText) {
            const res = await translate(text, { from, to });
            resultText = res.text;
        }

        // Apply LLM refinement if a model is selected and it's not already handled by Gemini translation refinedly
        if (llmModel && llmModel !== 'none') {
            resultText = await geminiRefine(text, resultText, from, to, llmModel);
        }

        return new Response(JSON.stringify({ text: resultText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('API Translation error:', err);
        return new Response(JSON.stringify({ error: 'Translation failed', text }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
