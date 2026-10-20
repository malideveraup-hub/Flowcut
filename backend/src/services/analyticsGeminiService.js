import { AppError } from '../middleware/errorHandler.js';
import { GoogleGenAI } from '@google/genai';

const REQUEST_TIMEOUT_MS = 60_000;
const RETRY_OPTIONS = { attempts: 2, initialDelay: 0.4, maxDelay: 1, jitter: 0.2, httpStatusCodes: [408, 429, 500, 502, 503, 504] };

function providerStatus(error) {
  const status = Number(error?.status ?? error?.response?.status);
  return Number.isInteger(status) ? status : null;
}

function providerMessage(status) {
  if (status === 429) return 'Gemini is temporarily rate limited.';
  if (status === 401 || status === 403) return 'Gemini could not authorize this request. Check the backend Gemini API key.';
  if (status === 404) return 'The configured Gemini model is unavailable to this API key. Check the backend GEMINI_MODEL setting.';
  if (status === 400) return 'Gemini rejected the analytics request. Check the model and structured-response configuration.';
  return 'Gemini metric calculation is temporarily unavailable.';
}

export function createGeminiClient(apiKey, fetchImpl = globalThis.fetch) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: RETRY_OPTIONS, fetch: fetchImpl },
  });
}

export async function requestGeminiJson({ prompt, schema, apiKey, model, clientFactory, fetchImpl = globalThis.fetch, maxOutputTokens = 1600 }) {
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) {
    throw new AppError(503, 'The configured Gemini model name is invalid. Check the backend GEMINI_MODEL setting.');
  }
  const makeClient = clientFactory || ((key) => createGeminiClient(key, fetchImpl));
  let result;
  try {
    const client = makeClient(apiKey);
    result = await client.models.generateContent({
      model,
      contents: Array.isArray(prompt) ? prompt : [{ parts: [{ text: prompt }] }],
      config: {
        ...(schema.systemInstruction ? { systemInstruction: schema.systemInstruction } : {}),
        responseMimeType: 'application/json',
        responseSchema: schema.responseSchema,
        maxOutputTokens,
        temperature: 0.2,
      },
    });
  } catch (error) {
    const status = providerStatus(error);
    console.warn('[analytics-gemini] request_failed', {
      model,
      status,
      errorType: typeof error?.name === 'string' ? error.name.slice(0, 60) : 'Error',
    });
    throw new AppError(status === 429 || status == null || status >= 500 ? 503 : 502, providerMessage(status));
  }

  const finishReason = result?.candidates?.[0]?.finishReason;
  if (result?.promptFeedback?.blockReason || finishReason === 'SAFETY') {
    throw new AppError(422, 'Gemini blocked the analytics calculation request.');
  }
  if (finishReason === 'MAX_TOKENS') {
    throw new AppError(502, 'Gemini analytics calculation response was too long to process.');
  }

  try {
    if (typeof result?.text !== 'string' || !result.text.trim()) throw new Error('Empty model response');
    return JSON.parse(result.text);
  } catch {
    throw new AppError(502, 'Gemini returned an unreadable analytics calculation.');
  }
}
