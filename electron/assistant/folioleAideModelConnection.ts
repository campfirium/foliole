import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

const TEST_TIMEOUT_MS = 20_000;

export async function testOpenAiCompatibleModel(input: {
  apiKey: string;
  endpoint: string;
  model: string;
}): Promise<NativeAssistantFailureCategory | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const response = await fetch(input.endpoint, {
      body: JSON.stringify({
        max_tokens: 1,
        messages: [{ content: 'Reply with OK.', role: 'user' }],
        model: input.model,
        stream: false
      }),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json'
      },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal
    });
    if (!response.ok) return responseCategory(response.status);
    const payload = await response.json() as { choices?: unknown };
    return Array.isArray(payload.choices) ? null : 'protocol_error';
  } catch (error) {
    return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
      ? 'timeout'
      : 'protocol_error';
  } finally {
    clearTimeout(timer);
  }
}

function responseCategory(status: number): NativeAssistantFailureCategory {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429 || (status >= 502 && status <= 504)) return 'overloaded';
  return 'protocol_error';
}
