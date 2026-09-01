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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('executes ordered multi-call rounds and emits cumulative text with one final answer', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([toolDelta([
      {
        ...toolCall(0, 'read-1', 'read_material', '{"id":"topic-1"}'),
        extra_content: { provider: { opaque_signature: 'signature-1' } }
      },
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
    expect.objectContaining({
      role: 'assistant',
      tool_calls: expect.arrayContaining([expect.objectContaining({
        extra_content: { provider: { opaque_signature: 'signature-1' } }, id: 'read-1'
      })])
    }),
    expect.objectContaining({ name: 'read_material', role: 'tool', tool_call_id: 'read-1' }),
    expect.objectContaining({ name: 'update_material', role: 'tool', tool_call_id: 'write-1' })
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

it('allows more than eight tool rounds and twenty-four total calls', async () => {
  const responses = Array.from({ length: 9 }, (_, round) => sse([toolDelta(
    Array.from({ length: 3 }, (_, index) => toolCall(index, `read-${round}-${index}`, 'read_material', '{}'))
  )]));
  responses.push(sse([{ choices: [{ delta: { content: 'Long task done' }, finish_reason: 'stop' }] }]));
  const fetchMock = queuedFetch(responses);
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).resolves.toBe('Long task done');
  expect(executeTool).toHaveBeenCalledTimes(27);
});

it('fails closed after 256 sequential tool rounds', async () => {
  const responses = Array.from({ length: 257 }, (_, round) => sse([
    toolDelta([toolCall(0, `read-${round}`, 'read_material', '{}')])
  ]));
  const fetchMock = queuedFetch(responses);
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).rejects.toMatchObject({ category: 'tool_limit_reached' });
  expect(executeTool).toHaveBeenCalledTimes(256);
});

it('uses one 180 second idle deadline instead of an absolute turn timeout', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let round = 0;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
    await vi.advanceTimersByTimeAsync(70_000);
    round += 1;
    return round < 3
      ? sse([toolDelta([toolCall(0, `read-${round}`, 'read_material', '{}')])])
      : sse([{ choices: [{ delta: { content: 'Still active' }, finish_reason: 'stop' }] }]);
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).resolves.toBe('Still active');
  expect(vi.getMockedSystemTime()?.getTime()).toBe(210_000);
});

it('times out only after 180 seconds without activity', async () => {
  vi.useFakeTimers();
  const fetchMock = abortablePendingFetch();
  vi.stubGlobal('fetch', fetchMock);
  const result = run(fetchMock);
  let settled = false;
  void result.finally(() => { settled = true; }).catch(() => undefined);

  await vi.advanceTimersByTimeAsync(179_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).rejects.toMatchObject({ category: 'timeout' });
});

it('refreshes the deadline when Agent Control returns a tool result', async () => {
  vi.useFakeTimers();
  executeTool.mockImplementationOnce(async () => {
    await vi.advanceTimersByTimeAsync(170_000);
    return { contentItems: [{ text: '{"ok":true}', type: 'inputText' }], success: true };
  });
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([toolDelta([toolCall(0, 'read-1', 'read_material', '{}')])]))
    .mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      return sse([{ choices: [{ delta: { content: 'Done after tool' }, finish_reason: 'stop' }] }]);
    });
  vi.stubGlobal('fetch', fetchMock);

  await expect(run(fetchMock)).resolves.toBe('Done after tool');
});

it('preserves explicit interruption classification', async () => {
  const controller = new AbortController();
  const fetchMock = abortablePendingFetch();
  vi.stubGlobal('fetch', fetchMock);
  const result = run(fetchMock, () => undefined, controller);
  controller.abort();

  await expect(result).rejects.toMatchObject({ category: 'interrupted' });
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
  onText: (text: string) => void = () => undefined,
  controller = new AbortController()
) {
  void fetchMock;
  return runOpenAiCompatibleToolLoop({
    allowedCapabilities: ['materials.read', 'materials.update'],
    apiKey: 'secret', controller, endpoint: 'https://models.example/chat',
    messages: [{ content: 'Prompt', role: 'user' }], model: 'model-a', onText,
    tools: [{ function: { name: 'read_material' }, type: 'function' }]
  });
}

function queuedFetch(responses: Response[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error('missing_fixture_response');
    return response;
  });
}

function abortablePendingFetch() {
  return vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {
      name: 'AbortError'
    })), { once: true });
  }));
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
