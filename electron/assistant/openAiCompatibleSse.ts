import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

import {
  createOpenAiCompatibleToolCallAssembler,
  type OpenAiCompatibleToolCall
} from './openAiCompatibleToolCallAssembler.js';

export type { OpenAiCompatibleToolCall } from './openAiCompatibleToolCallAssembler.js';

export interface OpenAiCompatibleSseResult {
  finishReason: string | null;
  text: string;
  toolCalls: OpenAiCompatibleToolCall[];
}

export function formatOpenAiCompatibleToolCall(call: OpenAiCompatibleToolCall) {
  return {
    ...call.extensionFields,
    function: {
      ...call.functionExtensionFields,
      arguments: call.argumentsText,
      name: call.name
    },
    id: call.id,
    type: 'function'
  };
}

export async function readOpenAiCompatibleSse(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  onText: (text: string) => void,
  onActivity: () => void = () => undefined
): Promise<OpenAiCompatibleSseResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = createOpenAiCompatibleToolCallAssembler();
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
      toolCalls.append(delta.toolCallFragments);
      if (delta.finishReason !== null) finishReason = delta.finishReason;
    }
  }
  if (!doneMarker) throw categorized('protocol_error');
  return {
    finishReason,
    text,
    toolCalls: toolCalls.finalize()
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
    toolCallFragments: delta.tool_calls
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function categorized(category: NativeAssistantFailureCategory) {
  return Object.assign(new Error(category), { category });
}
