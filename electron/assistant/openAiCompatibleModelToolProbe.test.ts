// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: vi.fn()
}));

import { probeOpenAiCompatibleModelTools } from './openAiCompatibleModelToolProbe.js';

afterEach(() => vi.unstubAllGlobals());

it('qualifies only after streamed tool fragments, assistant replay, tool result, and final text', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(sse([
      { choices: [{ delta: { tool_calls: [{
        extra_content: { google: { thought_signature: 'signature-1' } },
        function: { arguments: '{"supported":', name: 'foliole_aide_tool_contract_probe' },
        id: 'probe-1', index: 0, type: 'function'
      }] } }] },
      { choices: [{ delta: { tool_calls: [{ function: { arguments: 'true}' }, index: 0 }] }, finish_reason: 'stop' }] }
    ]))
    .mockResolvedValueOnce(sse([
      { choices: [{ delta: { content: 'Probe complete' }, finish_reason: 'stop' }] }
    ]));
  vi.stubGlobal('fetch', fetchMock);

  await expect(probe()).resolves.toBeNull();
  const first = requestBody(fetchMock, 0);
  expect(first).toMatchObject({
    tool_choice: 'auto',
    tools: [{ function: { parameters: {
      properties: { supported: { type: 'boolean' } }, required: ['supported'], type: 'object'
    } } }]
  });
  const second = requestBody(fetchMock, 1);
  expect(second.messages).toEqual([
    expect.objectContaining({ role: 'user' }),
    expect.objectContaining({ role: 'assistant', tool_calls: [expect.objectContaining({
      extra_content: { google: { thought_signature: 'signature-1' } }, id: 'probe-1'
    })] }),
    {
      content: '{"supported":true}', name: 'foliole_aide_tool_contract_probe',
      role: 'tool', tool_call_id: 'probe-1'
    }
  ]);
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('Agent Control');
});

it.each([
  [401, 'auth_failed'],
  [429, 'overloaded'],
  [400, 'model_tools_unsupported']
])('keeps HTTP %s distinct as %s', async (status, category) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
  await expect(probe()).resolves.toEqual({ category });
});

it('keeps provider region restrictions distinct from tool incompatibility', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{
    error: {
      code: 400,
      message: 'User location is not supported for the API use.',
      status: 'FAILED_PRECONDITION'
    }
  }]), { headers: { 'content-type': 'application/json' }, status: 400 })));

  await expect(probe()).resolves.toEqual({
    category: 'provider_region_unsupported',
    message: 'User location is not supported for the API use.'
  });
});

it('rejects endpoints that return text without the required function call', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => sse([
    { choices: [{ delta: { content: 'I cannot call tools.' }, finish_reason: 'stop' }] }
  ])));
  await expect(probe()).resolves.toEqual({ category: 'model_tools_unsupported' });
});

function probe() {
  return probeOpenAiCompatibleModelTools({
    apiKey: 'secret', endpoint: 'https://models.example/chat', model: 'model-a', signal: new AbortController().signal
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body)) as {
    messages: unknown[]; tool_choice: unknown; tools: unknown[];
  };
}

function sse(chunks: unknown[]) {
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' }
  });
}
