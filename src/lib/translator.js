/**
 * This translator is 100% client-side and uses ONLY GET requests
 * to avoid Electron's chunked-POST network pipe errors (OnSizeReceived).
 */

async function googleTranslateGET(text, from, to) {
    if (!text || text.trim().length === 0) return '';

    try {
        // We use the gtx client which supports standard GET requests
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;

        console.log(`[Translator] Requesting GET translation for: "${text.substring(0, 30)}..."`);

        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-cache'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const translatedText = data[0].map(item => item[0]).join('');

        console.log(`[Translator] Received: "${translatedText.substring(0, 30)}..."`);
        return translatedText;
    } catch (err) {
        console.error('[Translator] Client-side GET translation error:', err);
        return text; // Return original on failure
    }
}

export async function translateText(text, from, to, llmModel = 'none', apiKey = null) {
    if (!text || text.trim().length === 0) return '';

    try {
        const sl = from ? from.split('-')[0] : 'auto';
        const tl = to ? to.split('-')[0] : 'en';

        // Use Gemini for Chinese translation or if LLM model is specified
        if ((tl === 'zh' || tl.startsWith('zh') || llmModel !== 'none') && apiKey) {
            const { geminiTranslate } = await import('./gemini.js');
            const result = await geminiTranslate(text, sl, tl, llmModel || 'gemini-1.5-flash', apiKey);
            if (result) return result;
        }

        // Default to Google Translate GET method
        return await googleTranslateGET(text, sl, tl);
    } catch (err) {
        console.error('[Translator] Translation error:', err);
        return text; // Return original on failure
    }
}
