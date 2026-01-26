export async function recognizeSpeech(audioBase64, languageCode = 'en-US', providedApiKey = null) {
    const apiKey = providedApiKey || process.env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
        throw new Error('Google Cloud API Key is not configured (GOOGLE_CLOUD_API_KEY)');
    }

    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;

    const requestBody = {
        config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: languageCode,
            enableAutomaticPunctuation: true,
        },
        audio: {
            content: audioBase64,
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Cloud STT Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
        return data.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');
    }

    return '';
}
