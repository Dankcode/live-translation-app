async function googleTranslate(text, from, to) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Google Translate failed');
        const data = await response.json();
        return data[0].map(item => item[0]).join('');
    } catch (err) {
        console.error('Google Translate error:', err);
        return null;
    }
}

export async function translateText(text, from, to, llmModel = 'none', mode = 'api') {
    // If fast mode is selected
    const isChinese = to === 'zh' || to.startsWith('zh-') || from === 'zh' || from.startsWith('zh-');

    // Use client-side Google only if NOT Chinese (Google Client is broken for Chinese)
    if (mode === 'fast' && !isChinese) {
        const fastResult = await googleTranslate(text, from, to);
        if (fastResult) return fastResult;
    }

    try {
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, from, to, llmModel }),
        });

        if (!response.ok) {
            console.warn('API translation failed, falling back to Google Translate');
            const fallbackResult = await googleTranslate(text, from, to);
            return fallbackResult || text;
        }

        const data = await response.json();
        return data.text;
    } catch (err) {
        console.error('Translation error:', err);
        const finalFallback = await googleTranslate(text, from, to);
        return finalFallback || text;
    }
}
