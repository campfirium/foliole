// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runtimeConfig = vi.hoisted(() => vi.fn());

vi.mock('./folioleAideByokSettings.js', () => ({
  loadFolioleAideByokRuntimeConfig: runtimeConfig
}));

import type { NativeAssistantThreadMessageRecord } from '../../lib/platform/nativeAssistantContract.js';

import { OpenAiCompatibleAdapter } from './openAiCompatibleAdapter.js';
import { selectRecentOpenAiCompatibleHistory } from './openAiCompatibleHistory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-byok-adapter-'));
  runtimeConfig.mockReturnValue({
    apiKey: 'secret-key',
    endpoint: 'http://127.0.0.1:43121/v1/chat/completions',
    model: 'local-model'
  });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('sends bearer-authenticated Chat Completions SSE with text history, material, and current images', async () => {
  const imagePath = path.join(tempRoot, 'current.png');
  await fs.writeFile(imagePath, Buffer.from('image-bytes'));
  const fetchMock = vi.fn<typeof fetch>(async () => sseResponse([
    { choices: [{ delta: { content: 'Hello' } }] },
    { choices: [{ delta: { content: ' world' } }] }
  ]));
  vi.stubGlobal('fetch', fetchMock);
  const events: unknown[] = [];
  const adapter = new OpenAiCompatibleAdapter();

  const result = await adapter.sendMessage({
    clientTurnId: 'turn-2',
    history: [history('turn-1:user', 'user', 'Earlier question', true), history('turn-1:assistant', 'assistant', 'Earlier answer')],
    images: [{
      createdFile: false,
      filePath: imagePath,
      id: 'a'.repeat(64),
      mimeType: 'image/png',
      originalName: 'current.png',
      sizeBytes: 11
    }],
    message: 'Current question',
    onEvent: (event) => events.push(event),
    providerThreadId: 'thread-local',
    workspaceContext: {
      activeTitle: 'Current Topic',
      agentControl: { capabilities: ['materials.read'], state: 'running' },
      document: { bodyStatus: 'ready', preview: 'Topic body' },
      schemaVersion: 1,
      scope: 'node'
    }
  });

  expect(result).toMatchObject({
    message: { text: 'Hello world', threadId: 'thread-local' },
    provider: 'openai-compatible',
    state: 'ready'
  });
  assertOpenAiCompatibleRequest(fetchMock);
  expect(events).toEqual([
    expect.objectContaining({ kind: 'started', provider: 'openai-compatible' }),
    expect.objectContaining({ kind: 'delta', text: 'Hello' }),
    expect.objectContaining({ kind: 'delta', text: 'Hello world' }),
    expect.objectContaining({ kind: 'completed', text: 'Hello world' })
  ]);
});

function assertOpenAiCompatibleRequest(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe('http://127.0.0.1:43121/v1/chat/completions');
  expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
  expect(init?.headers).toMatchObject({ authorization: 'Bearer secret-key' });
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({ model: 'local-model', stream: true });
  expect(body.messages).toEqual([
    expect.objectContaining({ content: expect.stringContaining('Topic body'), role: 'system' }),
    { content: 'Earlier question', role: 'user' },
    { content: 'Earlier answer', role: 'assistant' },
    {
      content: [
        { text: 'Current question', type: 'text' },
        { image_url: { url: `data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}` }, type: 'image_url' }
      ],
      role: 'user'
    }
  ]);
  expect(body.messages[0].content).not.toMatch(/Agent Control|materials\.read|available Foliole actions/iu);
  expect(JSON.stringify(body.messages)).not.toContain('old-image');
}

it.each([
  [401, 'auth_failed'],
  [403, 'auth_failed'],
  [429, 'overloaded'],
  [503, 'overloaded'],
  [400, 'protocol_error']
])('maps HTTP %s to %s without returning service details', async (status, category) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('sensitive service details', { status })));
  const result = await new OpenAiCompatibleAdapter().sendMessage(baseInput());
  expect(result).toEqual({ failure: { category }, provider: 'openai-compatible', state: 'failed' });
  expect(JSON.stringify(result)).not.toContain('sensitive');
});

it('rejects malformed SSE and never accepts a non-streaming JSON fallback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    'data: {"choices":[{"delta":{"content":42}}]}\n\ndata: [DONE]\n\n',
    { status: 200 }
  )));
  await expect(new OpenAiCompatibleAdapter().sendMessage(baseInput())).resolves.toEqual({
    failure: { category: 'protocol_error' },
    provider: 'openai-compatible',
    state: 'failed'
  });
});

it('bounds history at complete turns and never carries historical image bodies', () => {
  const messages = [
    history('old:user', 'user', 'x'.repeat(23_000), true),
    history('old:assistant', 'assistant', 'y'.repeat(2_000)),
    history('new:user', 'user', 'new question'),
    history('new:assistant', 'assistant', 'new answer')
  ];
  expect(selectRecentOpenAiCompatibleHistory(messages).map((message) => message.id)).toEqual([
    'new:user', 'new:assistant'
  ]);
});

it('maps an idle stream to timeout and dispose to interrupted', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({}), {
    headers: { 'content-type': 'text/event-stream' }
  })));
  const timeoutAdapter = new OpenAiCompatibleAdapter();
  const timeoutResult = timeoutAdapter.sendMessage(baseInput());
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(45_001);
  await expect(timeoutResult).resolves.toMatchObject({ failure: { category: 'timeout' } });

  const interruptedAdapter = new OpenAiCompatibleAdapter();
  const interruptedResult = interruptedAdapter.sendMessage(baseInput());
  await Promise.resolve();
  await Promise.resolve();
  interruptedAdapter.dispose();
  await expect(interruptedResult).resolves.toMatchObject({ failure: { category: 'interrupted' } });
});

function baseInput() {
  return { clientTurnId: 'turn-1', history: [], images: [], message: 'Hello' };
}

function history(
  id: string,
  role: NativeAssistantThreadMessageRecord['role'],
  text: string,
  withImage = false
): NativeAssistantThreadMessageRecord {
  return {
    createdAt: '2026-08-31T00:00:00.000Z',
    id,
    ...(withImage ? { images: [{ id: 'old-image', mimeType: 'image/png', originalName: 'old.png', sizeBytes: 1 }] } : {}),
    provider: 'openai-compatible',
    providerThreadId: 'thread-local',
    role,
    text
  };
}

function sseResponse(chunks: unknown[]) {
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
    status: 200
  });
}
