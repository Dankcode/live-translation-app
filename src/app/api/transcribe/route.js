import { OpenAI } from 'openai';
import { geminiTranscribe } from '@/lib/gemini-transcribe';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('file');
        const provider = request.headers.get('x-transcription-provider') || 'whisper';
        const apiKey = request.headers.get('x-api-key');

        if (!audioFile) {
            return new Response(JSON.stringify({ error: 'No audio file provided' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Convert Blob to Buffer
        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let text = '';

        if (provider === 'gemini') {
            const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;
            if (!effectiveApiKey) throw new Error('Gemini API key is missing');
            text = await geminiTranscribe(buffer, effectiveApiKey);
        } else {
            // Default to Whisper
            const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY;
            if (!effectiveApiKey) throw new Error('OpenAI API key is missing');

            const openai = new OpenAI({ apiKey: effectiveApiKey });
            const file = new File([buffer], 'audio.webm', { type: 'audio/webm' });

            const translation = await openai.audio.translations.create({
                file: file,
                model: 'whisper-1',
            });
            text = translation.text;
        }

        return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('Transcription Error:', err);
        return new Response(JSON.stringify({ error: 'Transcription failed', message: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
