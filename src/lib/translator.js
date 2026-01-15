export async function translateText(text, from, to, llmModel = 'none') {
    try {
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, from, to, llmModel }),
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        return data.text;
    } catch (err) {
        console.error('Translation error:', err);
        return text; // Fallback to original text
    }
}
