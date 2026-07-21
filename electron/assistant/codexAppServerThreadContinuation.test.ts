// @vitest-environment node
import { expect, it } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';

it('injects saved history before continuing in a new tool-enabled thread', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    launcherCwd: 'C:\\Foliole Aide',
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand: () => process,
    timeoutMs: 1000
  });
  const observed = { injectedItems: [] as unknown[], seenMethods: [] as string[], turnInput: [] as unknown[] };
  process.stdin.on('data', createContinuationResponder(process, observed));

  await expect(adapter.sendMessage({
    clientTurnId: 'client-continue',
    continuationMessages: [
      {
        images: [{
          contentBase64: 'iVBORw0KGgo=',
          id: 'a'.repeat(64),
          mimeType: 'image/png',
          originalName: 'old.png',
          sizeBytes: 8
        }],
        role: 'user',
        text: 'Old question'
      },
      { role: 'assistant', text: 'Old answer' }
    ],
    imagePaths: ['C:\\Foliole Aide\\Workspace\\Attachments\\current.png'],
    message: 'Continue now',
    workspaceContext: {
      agentControl: { capabilities: ['materials.read'], state: 'running' },
      schemaVersion: 1,
      scope: 'workspace'
    }
  })).resolves.toMatchObject({ message: { text: 'Continued', threadId: 'thr_new' }, state: 'ready' });
  expect(observed.seenMethods).toEqual([
    'initialize', 'initialized', 'thread/start', 'thread/inject_items', 'turn/start'
  ]);
  expect(observed.turnInput).toEqual([
    { text: expect.stringContaining('Continue now'), type: 'text' },
    { path: 'C:\\Foliole Aide\\Workspace\\Attachments\\current.png', type: 'localImage' }
  ]);
  expect(observed.injectedItems).toEqual([
    {
      content: [
        { text: 'Old question', type: 'input_text' },
        { image_url: 'data:image/png;base64,iVBORw0KGgo=', type: 'input_image' }
      ],
      role: 'user',
      type: 'message'
    },
    { content: [{ text: 'Old answer', type: 'output_text' }], role: 'assistant', type: 'message' }
  ]);
});

function createContinuationResponder(
  process: FakeCodexProcess,
  observed: { injectedItems: unknown[]; seenMethods: string[]; turnInput: unknown[] }
) {
  return (chunk: unknown) => {
    for (const line of String(chunk).trim().split('\n').filter(Boolean)) {
      const message = JSON.parse(line);
      observed.seenMethods.push(message.method);
      if (message.method === 'initialize') writeMessage(process, { id: 0, result: {} });
      if (message.method === 'thread/start') {
        expect(message.params.dynamicTools).toHaveLength(1);
        writeMessage(process, { id: message.id, result: { thread: { id: 'thr_new' } } });
      }
      if (message.method === 'thread/inject_items') {
        observed.injectedItems = message.params.items;
        writeMessage(process, { id: message.id, result: {} });
      }
      if (message.method === 'turn/start') {
        observed.turnInput = message.params.input;
        completeTurn(process);
      }
    }
  };
}

function completeTurn(process: FakeCodexProcess) {
  writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_new' } } });
  writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Continued' } });
  writeMessage(process, {
    method: 'turn/completed',
    params: { turn: { id: 'turn_new', status: 'completed' } }
  });
}
