import baiduTranslate from 'baidu-translate-api';
import { geminiTranslate, geminiRefine } from '@/lib/gemini';
import translate from 'google-translate-api-next';

export async function POST(request) {
    const { text, from, to, llmModel } = await request.json();

    try {
        let resultText = '';

        // Use Baidu Translate API as primary
        try {
            const bFrom = from.split('-')[0].toLowerCase();
            const bTo = to.split('-')[0].toLowerCase();

            const res = await baiduTranslate(text, { from: bFrom, to: bTo });
            resultText = res.trans_result.dst;
        } catch (baiduErr) {
            console.error('Baidu API Error:', baiduErr);
            // Fallback to Gemini if Baidu fails
            try {
                resultText = await geminiTranslate(text, from, to, llmModel || 'gemini-1.5-flash');
            } catch (geminiErr) {
                console.error('Gemini fallback failed:', geminiErr);
            }
        }

        // If both Baidu and Gemini fail, use Google Translate as last resort
        if (!resultText) {
            try {
                const gFrom = from === 'zh' ? 'zh-CN' : from;
                const gTo = to === 'zh' ? 'zh-CN' : to;
                const res = await translate(text, { from: gFrom, to: gTo });
                resultText = res.text;
            } catch (googleErr) {
                console.error('Google fallback failed:', googleErr);
            }
        }

        // If absolutely everything fails, return original text
        if (!resultText) {
            resultText = text;
        }

        // Apply LLM refinement if a model is selected
        if (llmModel && llmModel !== 'none') {
            resultText = await geminiRefine(text, resultText, from, to, llmModel);
        }

        return new Response(JSON.stringify({ text: resultText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('API Translation Catch-all error:', err);
        return new Response(JSON.stringify({ error: 'Translation failed', text }), {
            status: 200, // Return 200 with original text to avoid crashing the frontend
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
