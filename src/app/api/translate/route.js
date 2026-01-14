import translate from 'google-translate-api-next';

export async function POST(request) {
    const { text, from, to } = await request.json();

    try {
        const res = await translate(text, { from, to });
        return new Response(JSON.stringify({ text: res.text }), {
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
