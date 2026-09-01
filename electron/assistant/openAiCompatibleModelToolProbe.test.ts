// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';

import { probeOpenAiCompatibleModelTools } from './openAiCompatibleModelToolProbe.js';

afterEach(() => vi.unstubAllGlobals());

it('qualifies only after streamed tool fragments, assistant replay, tool result, and final text', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([
      { choices: [{ delta: { tool_calls: [{ function: { arguments: '{', name: 'foliole_aide_tool_contract_probe' }, id: 'probe-1', index: 0, type: 'function' }] } }] },
      { choices: [{ delta: { tool_calls: [{ function: { arguments: '}' }, index: 0 }] }, finish_reason: 'tool_calls' }] }
    ]))
    .mockResolvedValueOnce(sse([
      { choices: [{ delta: { content: 'Probe complete' }, finish_reason: 'stop' }] }
    ]));
  vi.stubGlobal('fetch', fetchMock);

  await expect(probe()).resolves.toBeNull();
  const second = requestBody(fetchMock, 1);
  expect(second.messages).toEqual([
    expect.objectContaining({ role: 'user' }),
    expect.objectContaining({ role: 'assistant', tool_calls: [expect.objectContaining({ id: 'probe-1' })] }),
    { content: '{"supported":true}', role: 'tool', tool_call_id: 'probe-1' }
  ]);
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Agent Control');
});

it.each([
  [401, 'auth_failed'],
  [429, 'overloaded'],
  [400, 'model_tools_unsupported']
])('keeps HTTP %s distinct as %s', async (status, category) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
  await expect(probe()).resolves.toBe(category);
});

it('rejects endpoints that return text without the required function call', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => sse([
    { choices: [{ delta: { content: 'I cannot call tools.' }, finish_reason: 'stop' }] }
  ])));
  await expect(probe()).resolves.toBe('model_tools_unsupported');
});

function probe() {
  return probeOpenAiCompatibleModelTools({
    apiKey: 'secret', endpoint: 'https://models.example/chat', model: 'model-a', signal: new AbortController().signal
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body)) as { messages: unknown[] };
}

function sse(chunks: unknown[]) {
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' }
  });
}
