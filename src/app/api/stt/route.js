import { NextResponse } from 'next/server';
import { recognizeSpeech } from '@/lib/google-stt';
import { geminiSTT } from '@/lib/gemini';
import { checkAndIncrementUsage } from '@/lib/usage-tracker';

export async function POST(request) {
    try {
        const { audio, languageCode, apiKey, sttMode, modelName } = await request.json();

        if (!audio) {
            return NextResponse.json({ error: 'Audio data is required' }, { status: 400 });
        }

        let transcript = '';
        if (sttMode === 'cloud') {
            // Check usage limit before making the request
            // Audio is recorded in 4s chunks in page.js
            try {
                checkAndIncrementUsage(apiKey, 4);
            } catch (usageError) {
                if (usageError.status === 403) {
                    return NextResponse.json({ error: usageError.message }, { status: 403 });
                }
                throw usageError;
            }

            transcript = await recognizeSpeech(audio, languageCode || 'en-US', apiKey);
        } else {
            // Default to Gemini
            if (!apiKey) {
                return NextResponse.json({ error: 'Gemini API key is required when using Gemini STT' }, { status: 400 });
            }
            transcript = await geminiSTT(audio, languageCode || 'en-US', modelName || 'gemini-2.0-flash', apiKey);
        }

        return NextResponse.json({ transcript });
    } catch (error) {
        console.error('[STT API Error]:', error);
        const status = typeof error?.status === 'number' ? error.status : 500;
        const payload = { error: error?.message || 'STT failed' };
        if (typeof error?.retryAfterSeconds === 'number') payload.retryAfterSeconds = error.retryAfterSeconds;
        return NextResponse.json(payload, { status });
    }
}
