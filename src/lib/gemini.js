import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function geminiTranslate(text, from, to, modelName = 'gemini-1.5-flash', providedApiKey = null) {
    const apiKey = providedApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("Gemini API Key is not set. Skipping Gemini translation.");
        return null;
    }

    try {
        const genAIInstance = providedApiKey ? new GoogleGenerativeAI(providedApiKey) : genAI;
        const model = genAIInstance.getGenerativeModel({ model: modelName });
        const prompt = `Translate the following text from ${from} to ${to}. Only return the translated text.
        Text: ${text}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini translation error:", error);
        return null;
    }
}

export async function geminiRefine(original, translated, from, to, modelName = 'gemini-1.5-flash', providedApiKey = null) {
    const apiKey = providedApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("Gemini API Key is not set. Skipping Gemini refinement.");
        return translated;
    }

    try {
        const genAIInstance = providedApiKey ? new GoogleGenerativeAI(providedApiKey) : genAI;
        const model = genAIInstance.getGenerativeModel({ model: modelName });
        const prompt = `You are an expert translator. Refine the following translation to make it more natural and accurate while maintaining the original meaning.
        Original (${from}): ${original}
        Current Translation (${to}): ${translated}
        Only return the refined translation text.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini refinement error:", error);
        return translated;
    }
}

function normalizeModelId(name) {
    if (!name) return '';
    return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function hashKey(input) {
    // Simple non-crypto hash for in-memory cache keys.
    let hash = 5381;
    for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash) + input.charCodeAt(i);
    return (hash >>> 0).toString(16);
}

function parseRetryAfterSeconds(message) {
    if (typeof message !== 'string') return null;
    const match = message.match(/Please retry in\s+([0-9.]+)s/i);
    if (!match) return null;
    const seconds = Number(match[1]);
    return Number.isFinite(seconds) ? seconds : null;
}

const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const modelCache = new Map(); // key: `${apiVersion}:${hashKey(apiKey)}` => { modelId, updatedAt }
const DEFAULT_STT_MODEL = 'gemini-1.5-flash';

async function listModels(apiKey, apiVersion) {
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.models) ? data.models : [];
}

function pickModelId(models, preferredIds) {
    const available = new Map();
    for (const model of models) {
        const id = normalizeModelId(model?.name);
        if (!id) continue;
        const methods = model?.supportedGenerationMethods || [];
        available.set(id, methods);
    }

    for (const preferredId of preferredIds) {
        const id = normalizeModelId(preferredId);
        const methods = available.get(id);
        if (methods?.includes('generateContent')) return id;
    }

    // As a last resort, pick any model supporting generateContent.
    for (const [id, methods] of available.entries()) {
        if (methods?.includes('generateContent')) return id;
    }

    return null;
}

export async function geminiSTT(audioBase64, languageCode = 'en-US', modelName = DEFAULT_STT_MODEL, providedApiKey = null) {
    const apiKey = providedApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Gemini API Key is not set.");
    }

    try {
        const requestBody = {
            contents: [{
                parts: [
                    { inlineData: { mimeType: "audio/webm", data: audioBase64 } },
                    { text: `Transcribe the following audio in ${languageCode}. Only return the transcription.` }
                ]
            }]
        };

        const preferredModelIds = Array.from(new Set([
            modelName,
            DEFAULT_STT_MODEL,
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-2.0-flash-001',
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash-lite-001',
            'gemini-2.5-flash-lite',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash-002',
            'gemini-1.5-flash',
            'gemini-1.5-pro-latest',
            'gemini-1.5-pro',
            'gemini-pro',
        ].filter(Boolean)));

        let lastError = null;
        const apiVersions = ['v1', 'v1beta'];
        for (const apiVersion of apiVersions) {
            const cacheKey = `${apiVersion}:${hashKey(apiKey)}`;
            const cached = modelCache.get(cacheKey);

            let modelIdToUse = normalizeModelId(modelName || DEFAULT_STT_MODEL);
            const shouldPreferCache = modelIdToUse === DEFAULT_STT_MODEL || modelIdToUse.includes('1.5');
            if (cached && (Date.now() - cached.updatedAt) < MODEL_CACHE_TTL_MS && shouldPreferCache) {
                modelIdToUse = cached.modelId;
            }

            // First try the requested/default model ID.
            const directUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelIdToUse}:generateContent?key=${apiKey}`;
            console.log(`[Gemini STT] Calling ${modelIdToUse} at ${apiVersion}...`);

            const directResponse = await fetch(directUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (directResponse.ok) {
                const data = await directResponse.json();
                const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                modelCache.set(cacheKey, { modelId: modelIdToUse, updatedAt: Date.now() });
                return transcript.trim();
            }

            let directErrorData = null;
            try {
                directErrorData = await directResponse.json();
            } catch {
                // ignore
            }
            const log = directResponse.status === 404 ? console.warn : console.error;
            log("[Gemini STT API Error]:", directErrorData || { status: directResponse.status, statusText: directResponse.statusText });

            lastError = new Error(`Gemini STT Error: ${directErrorData?.error?.message || directResponse.statusText || `HTTP ${directResponse.status}`}`);
            lastError.status = directResponse.status;
            const retryAfterSeconds = parseRetryAfterSeconds(directErrorData?.error?.message);
            if (retryAfterSeconds != null) lastError.retryAfterSeconds = retryAfterSeconds;

            // Rate limit/quota: try fallback or throw.
            if (directResponse.status === 429) {
                if (modelIdToUse !== 'gemini-1.5-flash' && modelIdToUse !== 'gemini-1.5-flash-latest') {
                    console.warn(`[Gemini STT] ${modelIdToUse} hit 429. Trying fallback gemini-1.5-flash...`);
                    modelIdToUse = 'gemini-1.5-flash';
                    const retryUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelIdToUse}:generateContent?key=${apiKey}`;
                    const retryResponse = await fetch(retryUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                    });

                    if (retryResponse.ok) {
                        const data = await retryResponse.json();
                        const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        modelCache.set(cacheKey, { modelId: modelIdToUse, updatedAt: Date.now() });
                        return transcript.trim();
                    }
                    
                    try {
                        directErrorData = await retryResponse.json();
                    } catch { /* ignore */ }
                    throw new Error(`Gemini STT fallback failed: ${directErrorData?.error?.message || retryResponse.statusText}`);
                }
                throw lastError;
            }

            // If model is missing/unsupported, discover available models and retry once.
            if (directResponse.status === 404) {
                const models = await listModels(apiKey, apiVersion);
                if (models.length) {
                    const sample = models
                        .slice(0, 8)
                        .map((m) => normalizeModelId(m?.name))
                        .filter(Boolean)
                        .join(', ');
                    console.log(`[Gemini STT] ${apiVersion} ListModels returned ${models.length} models (sample: ${sample})`);
                } else {
                    console.log(`[Gemini STT] ${apiVersion} ListModels returned 0 models (API disabled or key restricted?)`);
                }
                const picked = pickModelId(models, preferredModelIds);
                if (picked && picked !== modelIdToUse) {
                    modelIdToUse = picked;
                    const retryUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelIdToUse}:generateContent?key=${apiKey}`;
                    console.log(`[Gemini STT] Retrying with discovered model ${modelIdToUse} at ${apiVersion}...`);

                    const retryResponse = await fetch(retryUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                    });

                    if (retryResponse.ok) {
                        const data = await retryResponse.json();
                        const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        modelCache.set(cacheKey, { modelId: modelIdToUse, updatedAt: Date.now() });
                        return transcript.trim();
                    }

                    let retryErrorData = null;
                    try {
                        retryErrorData = await retryResponse.json();
                    } catch {
                        // ignore
                    }

                    const retryLog = retryResponse.status === 404 ? console.warn : console.error;
                    retryLog("[Gemini STT API Error]:", retryErrorData || { status: retryResponse.status, statusText: retryResponse.statusText });
                    lastError = new Error(`Gemini STT Error: ${retryErrorData?.error?.message || retryResponse.statusText || `HTTP ${retryResponse.status}`}`);
                    lastError.status = retryResponse.status;
                    const retryAfterSeconds = parseRetryAfterSeconds(retryErrorData?.error?.message);
                    if (retryAfterSeconds != null) lastError.retryAfterSeconds = retryAfterSeconds;

                    if (retryResponse.status === 429) throw lastError;
                }
            }

            // Non-404 or no usable fallback: try next API version.
        }

        const hint = "Hint: ensure you are using a Google AI Studio (Gemini) API key with the Gemini API enabled; Google Cloud Speech-to-Text keys won't work here.";
        throw new Error(`${lastError?.message || "Gemini STT Error: Unknown error"}. ${hint}`);
    } catch (error) {
        console.error("Gemini STT terminal error:", error);
        throw error;
    }
}
