import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

import { executeAideTool } from './aideToolExecutor.js';
import { readOpenAiCompatibleSse, type OpenAiCompatibleToolCall } from './openAiCompatibleSse.js';

const MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_CALLS = 24;
const TURN_TIMEOUT_MS = 120_000;
export async function runOpenAiCompatibleToolLoop(input: {
  allowedCapabilities: readonly string[];
  apiKey: string;
  controller: AbortController;
  endpoint: string;
  messages: unknown[];
  model: string;
  onText: (text: string) => void;
  tools: unknown[];
}) {
  const messages = [...input.messages];
  const acceptedIds = new Set<string>();
  let callCount = 0;
  let responseText = '';
  let writeDispatched = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    input.controller.abort();
  }, TURN_TIMEOUT_MS);
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const completion = await requestCompletion(input, messages, responseText);
      responseText += completion.text;
      if (!completion.toolCalls.length) {
        if (!responseText.trim()) throw categorized('protocol_error');
        return responseText;
      }
      if (round === MAX_TOOL_ROUNDS) throw categorized('tool_limit_reached');
      callCount += completion.toolCalls.length;
      if (callCount > MAX_TOOL_CALLS) throw categorized('tool_limit_reached');
      assertFreshToolCalls(completion.toolCalls, acceptedIds);
      messages.push(assistantToolCallMessage(completion));
      for (const call of completion.toolCalls) {
        const result = await executeToolCall(call, input, () => { writeDispatched = true; });
        messages.push({
          content: result.contentItems.map((item) => item.text).join('\n'),
          role: 'tool',
          tool_call_id: call.id
        });
      }
    }
    throw categorized('protocol_error');
  } catch (error) {
    if (writeDispatched) throw categorized('tool_result_uncertain');
    if (timedOut) throw categorized('timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestCompletion(
  input: Parameters<typeof runOpenAiCompatibleToolLoop>[0],
  messages: unknown[],
  priorText: string
) {
  const response = await fetch(input.endpoint, {
    body: JSON.stringify({
      messages,
      model: input.model,
      stream: true,
      tool_choice: 'auto',
      tools: input.tools
    }),
    headers: {
      accept: 'text/event-stream',
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json'
    },
    method: 'POST',
    redirect: 'error',
    signal: input.controller.signal
  });
  assertSseResponse(response);
  return readOpenAiCompatibleSse(response.body, input.controller, (text) => input.onText(priorText + text));
}

function assertFreshToolCalls(calls: OpenAiCompatibleToolCall[], accepted: Set<string>) {
  for (const call of calls) {
    if (accepted.has(call.id)) throw categorized('protocol_error');
    accepted.add(call.id);
  }
}

async function executeToolCall(
  call: OpenAiCompatibleToolCall,
  input: Parameters<typeof runOpenAiCompatibleToolLoop>[0],
  markWriteDispatched: () => void
) {
  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(call.argumentsText);
  } catch {
    argumentsValue = null;
  }
  return executeAideTool(
    { arguments: argumentsValue, tool: call.name },
    {
      allowedCapabilities: input.allowedCapabilities,
      onDispatch: (mutates) => { if (mutates) markWriteDispatched(); },
      signal: input.controller.signal
    }
  );
}

function assistantToolCallMessage(completion: {
  text: string;
  toolCalls: OpenAiCompatibleToolCall[];
}) {
  return {
    content: completion.text || null,
    role: 'assistant',
    tool_calls: completion.toolCalls.map((call) => ({
      function: { arguments: call.argumentsText, name: call.name },
      id: call.id,
      type: 'function'
    }))
  };
}

function assertSseResponse(response: Response): asserts response is Response & {
  body: ReadableStream<Uint8Array>;
} {
  if (!response.ok) throw categorized(responseCategory(response.status));
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body) {
    throw categorized('protocol_error');
  }
}

function responseCategory(status: number): NativeAssistantFailureCategory {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429 || (status >= 502 && status <= 504)) return 'overloaded';
  return 'protocol_error';
}

function categorized(category: NativeAssistantFailureCategory) {
  return Object.assign(new Error(category), { category });
}
