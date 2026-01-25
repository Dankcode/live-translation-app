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

export async function translateText(text, from, to, llmModel = 'none') {
    if (!text || text.trim().length === 0) return '';

    try {
        const sl = from ? from.split('-')[0] : 'auto';
        const tl = to ? to.split('-')[0] : 'en';

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, from: sl, to: tl, llmModel })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return data.text || text;
    } catch (err) {
        console.error('[Translator] API translation error:', err);
        return text; // Return original on failure
    }
}
