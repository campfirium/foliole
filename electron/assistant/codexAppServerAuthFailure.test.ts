// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';

class FakeCodexProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => undefined);
}

function writeMessage(process: FakeCodexProcess, message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

it('maps app-server authentication events before waiting for timeout', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: () => undefined,
    probeCommand: async () => true,
    spawnCommand: () => process,
    timeoutMs: 1000
  });
  const result = adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' });
  writeMessage(process, { id: 0, result: {} });
  await Promise.resolve();
  writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
  writeMessage(process, {
    method: 'error',
    params: {
      additionalDetails: 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header'
    }
  });

  await expect(result).resolves.toMatchObject({ failure: { category: 'auth_failed' } });
  expect(process.kill).toHaveBeenCalledOnce();
});
