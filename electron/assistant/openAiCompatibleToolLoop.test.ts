// @vitest-environment node

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const executeTool = vi.hoisted(() => vi.fn());

vi.mock('./aideToolExecutor.js', () => ({ executeAideTool: executeTool }));

import { runOpenAiCompatibleToolLoop } from './openAiCompatibleToolLoop.js';

beforeEach(() => {
  executeTool.mockReset();
  executeTool.mockImplementation(async (request, options) => {
    options?.onDispatch?.(request.tool === 'update_material');
    return { contentItems: [{ text: '{"ok":true}', type: 'inputText' }], success: true };
  });
});

afterEach(() => vi.unstubAllGlobals());

it('executes ordered multi-call rounds and emits cumulative text with one final answer', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([toolDelta([
      toolCall(0, 'read-1', 'read_material', '{"id":"topic-1"}'),
      toolCall(1, 'write-1', 'update_material', '{"id":"topic-1"}')
    ], 'Checking ')]))
    .mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }] }]));
  vi.stubGlobal('fetch', fetchMock);
  const deltas: string[] = [];

  await expect(run(fetchMock, (text) => deltas.push(text))).resolves.toBe('Checking Done');
  expect(executeTool.mock.calls.map(([request]) => request.tool)).toEqual(['read_material', 'update_material']);
  expect(deltas).toEqual(['Checking ', 'Checking Done']);
  const secondBody = body(fetchMock, 1);
  expect(secondBody.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
    expect.objectContaining({ role: 'tool', tool_call_id: 'read-1' }),
    expect.objectContaining({ role: 'tool', tool_call_id: 'write-1' })
  ]));
});

it('rejects a repeated accepted tool-call id without executing it twice', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([toolDelta([toolCall(0, 'same-id', 'read_material', '{}')])]))
    .mockResolvedValueOnce(sse([toolDelta([toolCall(0, 'same-id', 'read_material', '{}')])]));
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).rejects.toMatchObject({ category: 'protocol_error' });
  expect(executeTool).toHaveBeenCalledTimes(1);
});

it('fails before execution when a model exceeds the total call bound', async () => {
  const calls = Array.from({ length: 25 }, (_, index) => toolCall(index, `id-${index}`, 'read_material', '{}'));
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(sse([toolDelta(calls)]));
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).rejects.toMatchObject({ category: 'tool_limit_reached' });
  expect(executeTool).not.toHaveBeenCalled();
});

it('reports outcome uncertainty when the provider fails after a dispatched write', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([toolDelta([toolCall(0, 'write-1', 'update_material', '{}')])]))
    .mockResolvedValueOnce(new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).rejects.toMatchObject({ category: 'tool_result_uncertain' });
  expect(executeTool).toHaveBeenCalledTimes(1);
});

function run(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  onText: (text: string) => void = () => undefined
) {
  void fetchMock;
  return runOpenAiCompatibleToolLoop({
    allowedCapabilities: ['materials.read', 'materials.update'],
    apiKey: 'secret', controller: new AbortController(), endpoint: 'https://models.example/chat',
    messages: [{ content: 'Prompt', role: 'user' }], model: 'model-a', onText,
    tools: [{ function: { name: 'read_material' }, type: 'function' }]
  });
}

function toolCall(index: number, id: string, name: string, argumentsText: string) {
  return { function: { arguments: argumentsText, name }, id, index, type: 'function' };
}

function toolDelta(toolCalls: unknown[], content?: string) {
  return { choices: [{ delta: { ...(content ? { content } : {}), tool_calls: toolCalls }, finish_reason: 'tool_calls' }] };
}

function body(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body)) as { messages: unknown[] };
}

function sse(chunks: unknown[]) {
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' }
  });
}
