import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

import { readOpenAiCompatibleSse } from './openAiCompatibleSse.js';

const PROBE_NAME = 'foliole_aide_tool_contract_probe';

export async function probeOpenAiCompatibleModelTools(input: {
  apiKey: string;
  endpoint: string;
  model: string;
  signal: AbortSignal;
}): Promise<NativeAssistantFailureCategory | null> {
  if (input.signal.aborted) return 'timeout';
  try {
    const first = await sendProbe(input, [{ content: 'Call the required probe tool.', role: 'user' }], {
      function: { name: PROBE_NAME }, type: 'function'
    });
    const call = first.toolCalls[0];
    if (first.finishReason !== 'tool_calls'
      || first.toolCalls.length !== 1
      || call?.name !== PROBE_NAME
      || !isEmptyObject(call.argumentsText)) {
      return 'model_tools_unsupported';
    }
    const second = await sendProbe(input, [
      { content: 'Call the required probe tool.', role: 'user' },
      {
        content: null,
        role: 'assistant',
        tool_calls: [{
          function: { arguments: call.argumentsText, name: call.name },
          id: call.id,
          type: 'function'
        }]
      },
      { content: '{"supported":true}', role: 'tool', tool_call_id: call.id }
    ]);
    return second.finishReason === 'stop'
      && second.toolCalls.length === 0
      && Boolean(second.text.trim())
      ? null
      : 'model_tools_unsupported';
  } catch (error) {
    return readProbeFailure(error);
  }
}

function isEmptyObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && Object.keys(parsed).length === 0);
  } catch {
    return false;
  }
}

async function sendProbe(
  input: Parameters<typeof probeOpenAiCompatibleModelTools>[0],
  messages: unknown[],
  toolChoice: unknown = 'none'
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(input.endpoint, {
      body: JSON.stringify({
        messages,
        model: input.model,
        stream: true,
        tool_choice: toolChoice,
        tools: [{
          function: {
            description: 'Return an empty object to prove a complete function-tool round trip.',
            name: PROBE_NAME,
            parameters: { additionalProperties: false, properties: {}, type: 'object' }
          },
          type: 'function'
        }]
      }),
      headers: requestHeaders(input.apiKey),
      method: 'POST',
      redirect: 'error',
      signal: controller.signal
    });
    assertProbeResponse(response);
    return await readOpenAiCompatibleSse(response.body, controller, () => undefined);
  } finally {
    input.signal.removeEventListener('abort', abort);
  }
}

function assertProbeResponse(response: Response): asserts response is Response & {
  body: ReadableStream<Uint8Array>;
} {
  if (!response.ok) throw categorized(responseCategory(response.status));
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw categorized('model_tools_unsupported');
  }
}

function requestHeaders(apiKey: string) {
  return {
    accept: 'text/event-stream',
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  };
}

function responseCategory(status: number): NativeAssistantFailureCategory {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429 || (status >= 502 && status <= 504)) return 'overloaded';
  return 'model_tools_unsupported';
}

function readProbeFailure(error: unknown): NativeAssistantFailureCategory {
  if (error && typeof error === 'object' && 'category' in error) {
    const category = (error as { category: NativeAssistantFailureCategory }).category;
    return category === 'protocol_error' ? 'model_tools_unsupported' : category;
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'timeout';
  return 'model_tools_unsupported';
}

function categorized(category: NativeAssistantFailureCategory) {
  return Object.assign(new Error(category), { category });
}
