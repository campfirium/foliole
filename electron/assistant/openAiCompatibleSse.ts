import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

export interface OpenAiCompatibleToolCall {
  argumentsText: string;
  id: string;
  name: string;
}

export interface OpenAiCompatibleSseResult {
  finishReason: string | null;
  text: string;
  toolCalls: OpenAiCompatibleToolCall[];
}

interface PendingToolCall {
  argumentsText: string;
  id: string;
  name: string;
  type: string;
}

export async function readOpenAiCompatibleSse(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  onText: (text: string) => void,
  onActivity: () => void = () => undefined
): Promise<OpenAiCompatibleSseResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: PendingToolCall[] = [];
  let buffer = '';
  let finishReason: string | null = null;
  let text = '';
  let doneMarker = false;
  while (true) {
    const chunk = await readWithAbort(reader, controller);
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/gu, '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = readFrameData(frame);
      if (!data) continue;
      if (data === '[DONE]') {
        onActivity();
        doneMarker = true;
        continue;
      }
      const delta = parseSseDelta(data);
      onActivity();
      if (delta.content) {
        text += delta.content;
        onText(text);
      }
      appendToolCallFragments(toolCalls, delta.toolCallFragments);
      if (delta.finishReason !== null) finishReason = delta.finishReason;
    }
  }
  if (!doneMarker) throw categorized('protocol_error');
  return {
    finishReason,
    text,
    toolCalls: finalizeToolCalls(toolCalls)
  };
}

function readFrameData(frame: string) {
  return frame.split('\n').filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart()).join('\n');
}

function parseSseDelta(data: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw categorized('protocol_error');
  }
  const choice = (parsed as { choices?: unknown[] }).choices?.[0];
  if (!isRecord(choice)) throw categorized('protocol_error');
  const delta = choice.delta;
  if (!isRecord(delta)) throw categorized('protocol_error');
  const content = delta.content;
  if (content !== undefined && content !== null && typeof content !== 'string') {
    throw categorized('protocol_error');
  }
  const finishReason = choice.finish_reason;
  if (finishReason !== undefined && finishReason !== null && typeof finishReason !== 'string') {
    throw categorized('protocol_error');
  }
  return {
    content: typeof content === 'string' ? content : '',
    finishReason: typeof finishReason === 'string' ? finishReason : null,
    toolCallFragments: parseToolCallFragments(delta.tool_calls)
  };
}

function parseToolCallFragments(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw categorized('protocol_error');
  return value.map((fragment) => {
    if (!isRecord(fragment) || !Number.isInteger(fragment.index) || Number(fragment.index) < 0) {
      throw categorized('protocol_error');
    }
    const fn = fragment.function;
    if (fn !== undefined && !isRecord(fn)) throw categorized('protocol_error');
    return {
      argumentsText: readOptionalString(fn?.arguments),
      id: readOptionalString(fragment.id),
      index: Number(fragment.index),
      name: readOptionalString(fn?.name),
      type: readOptionalString(fragment.type)
    };
  });
}

function appendToolCallFragments(
  calls: PendingToolCall[],
  fragments: ReturnType<typeof parseToolCallFragments>
) {
  for (const fragment of fragments) {
    const call = calls[fragment.index] ?? { argumentsText: '', id: '', name: '', type: '' };
    call.argumentsText += fragment.argumentsText;
    call.id = mergeStableField(call.id, fragment.id);
    call.name = mergeStableField(call.name, fragment.name);
    call.type = mergeStableField(call.type, fragment.type);
    calls[fragment.index] = call;
  }
}

function finalizeToolCalls(calls: PendingToolCall[]): OpenAiCompatibleToolCall[] {
  return Array.from({ length: calls.length }, (_, index) => {
    const call = calls[index];
    if (!call || !call.id || !call.name || call.type !== 'function') {
      throw categorized('protocol_error');
    }
    return { argumentsText: call.argumentsText, id: call.id, name: call.name };
  });
}

function mergeStableField(current: string, fragment: string) {
  if (!fragment) return current;
  if (!current || current === fragment) return fragment;
  throw categorized('protocol_error');
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController
) {
  if (controller.signal.aborted) throw categorized('interrupted');
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(categorized('interrupted'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      })
    ]);
  } finally {
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
  }
}

function readOptionalString(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw categorized('protocol_error');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function categorized(category: NativeAssistantFailureCategory) {
  return Object.assign(new Error(category), { category });
}
