import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

import { validateAideToolArguments } from './aideToolArguments.js';
import { executeAideTool } from './aideToolExecutor.js';
import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';
import { confirmAideWrites, isAideToolOffered, type AideToolSession, type AideWriteRequest } from './aideToolSession.js';
import {
  formatOpenAiCompatibleToolCall,
  readOpenAiCompatibleSse,
  type OpenAiCompatibleToolCall
} from './openAiCompatibleSse.js';

const MAX_SEQUENTIAL_TOOL_ROUNDS = 256;
const ACTIVITY_IDLE_TIMEOUT_MS = 180_000;
export async function runOpenAiCompatibleToolLoop(input: {
  allowedCapabilities: readonly string[];
  apiKey: string;
  controller: AbortController;
  endpoint: string;
  messages: unknown[];
  model: string;
  onText: (text: string) => void;
  toolSession?: AideToolSession;
  tools: unknown[];
}) {
  const messages = [...input.messages];
  const acceptedIds = new Set<string>();
  let toolRounds = 0;
  let responseText = '';
  let writeDispatched = false;
  let timedOut = false;
  const deadline = createActivityDeadline(() => {
    timedOut = true;
    input.controller.abort();
  });
  try {
    while (true) {
      const completion = await requestCompletion(input, messages, responseText, deadline.refresh);
      responseText += completion.text;
      if (!completion.toolCalls.length) {
        if (!responseText.trim()) throw categorized('protocol_error');
        return responseText;
      }
      assertFreshToolCalls(completion.toolCalls, acceptedIds);
      toolRounds += 1;
      if (toolRounds > MAX_SEQUENTIAL_TOOL_ROUNDS) throw categorized('tool_limit_reached');
      deadline.refresh();
      messages.push(assistantToolCallMessage(completion));
      const writeApproval = await approveWriteBatch(completion.toolCalls, input, deadline);
      for (const call of completion.toolCalls) {
        const result = await executeToolCall(call, input, writeApproval, () => { writeDispatched = true; });
        deadline.refresh();
        messages.push({
          content: result.contentItems.map((item) => item.text).join('\n'),
          name: call.name,
          role: 'tool',
          tool_call_id: call.id
        });
      }
    }
  } catch (error) {
    if (writeDispatched) throw categorized('tool_result_uncertain');
    if (timedOut) throw categorized('timeout');
    if (input.controller.signal.aborted) throw categorized('interrupted');
    throw error;
  } finally {
    deadline.clear();
  }
}

async function requestCompletion(
  input: Parameters<typeof runOpenAiCompatibleToolLoop>[0],
  messages: unknown[],
  priorText: string,
  onActivity: () => void
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
  return readOpenAiCompatibleSse(
    response.body,
    input.controller,
    (text) => input.onText(priorText + text),
    onActivity
  );
}

function createActivityDeadline(onTimeout: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(onTimeout, ACTIVITY_IDLE_TIMEOUT_MS);
  };
  refresh();
  return { clear: () => clearTimeout(timer), refresh };
}

function assertFreshToolCalls(calls: OpenAiCompatibleToolCall[], accepted: Set<string>) {
  for (const call of calls) {
    if (accepted.has(call.id)) throw categorized('protocol_error');
    accepted.add(call.id);
  }
}

function parseArguments(call: OpenAiCompatibleToolCall): unknown {
  try {
    return JSON.parse(call.argumentsText);
  } catch {
    return null;
  }
}

// All changes the model asks for in one round are put to the person together, once.
async function approveWriteBatch(
  calls: OpenAiCompatibleToolCall[],
  input: Parameters<typeof runOpenAiCompatibleToolLoop>[0],
  deadline: { clear: () => void; refresh: () => void }
) {
  const session = input.toolSession;
  if (!session?.confirmWrites) return undefined;
  const requests: AideWriteRequest[] = [];
  for (const call of calls) {
    const definition = AIDE_TOOL_REGISTRY[call.name];
    if (!definition?.mutates || !isAideToolOffered(session, call.name)) continue;
    if (!input.allowedCapabilities.includes(definition.capability)) continue;
    const body = validateAideToolArguments(call.name, parseArguments(call));
    if (body) requests.push({ arguments: body, tool: call.name });
  }
  if (!requests.length) return undefined;
  deadline.clear();
  try {
    return await confirmAideWrites(session, requests, input.controller.signal);
  } finally {
    deadline.refresh();
  }
}

async function executeToolCall(
  call: OpenAiCompatibleToolCall,
  input: Parameters<typeof runOpenAiCompatibleToolLoop>[0],
  writeApproval: boolean | undefined,
  markWriteDispatched: () => void
) {
  return executeAideTool(
    { arguments: parseArguments(call), tool: call.name },
    {
      allowedCapabilities: input.allowedCapabilities,
      onDispatch: (mutates) => { if (mutates) markWriteDispatched(); },
      ...(input.toolSession ? { session: input.toolSession } : {}),
      signal: input.controller.signal,
      ...(writeApproval === undefined ? {} : { writeApproval })
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
    tool_calls: completion.toolCalls.map(formatOpenAiCompatibleToolCall)
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
