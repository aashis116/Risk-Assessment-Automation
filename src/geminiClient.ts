const DEFAULT_MODEL = 'gemini-3.6-flash';

export function buildGeminiUrl(apiKey: string, model: string = DEFAULT_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

export function buildGeminiRequestBody(prompt: string): { contents: { parts: { text: string }[] }[] } {
  return {
    contents: [{ parts: [{ text: prompt }] }],
  };
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini({
  apiKey,
  prompt,
  model,
  fetchImpl = fetch,
  maxRetries = 3,
  retryDelayMs = 1000,
}: {
  apiKey: string;
  prompt: string;
  model?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<string> {
  let attempt = 0;

  while (true) {
    const response = await fetchImpl(buildGeminiUrl(apiKey, model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiRequestBody(prompt)),
    });

    if (response.ok) {
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    }

    const text = await response.text();
    const isRetryable = RETRYABLE_STATUSES.has(response.status);

    if (!isRetryable || attempt >= maxRetries) {
      throw new Error(`Gemini API request failed (${response.status}): ${text}`);
    }

    attempt += 1;
    await delay(retryDelayMs * 2 ** (attempt - 1));
  }
}
